// The native review round trip:
// - the export lists every draft / pending-review form with empty verdict
//   columns and spelling hints (never corrections);
// - ok -> approved + native_verified (text checked); fix applies the
//   correction too; reject -> rejected; who and when go in the review log;
// - a text review never marks a recording as native (is_native_voice), and a
//   correction un-marks a recording that no longer matches;
// - unknown ids, bad verdicts and stale rows are reported, never guessed,
//   and block the whole write; a dry run writes nothing.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { exportForReviewCommand, importReviewCommand } from '../lib/content/commands.mjs';
import { loadSnapshot } from '../lib/content/db.mjs';
import { REVIEW_COLUMNS, applyReview, exportForReview, planReview } from '../lib/content/review.mjs';
import { parseCsv, toCsv } from '../lib/content/sheet.mjs';
import { memoryDb } from './memoryDb.mjs';

const REVIEWER = '11111111-1111-4111-8111-111111111111';
const variant = (id, group, label, arabic, latin, extra = {}) => ({
  id, word_group_id: group, variant_label: label, word_arabic: arabic, transliteration: latin, audio_path: null, sort_order: 0,
  content_status: 'draft', native_verified: false, is_native_voice: false, approved_at: null, ...extra,
});
const DB = {
  units: [{ id: 'u1', name: 'Greetings', sort_order: 5, is_curriculum: true }],
  lessons: [{ id: 'l9', unit_id: 'u1', lesson_number: 9, title: 'Greetings', sort_order: 9 }],
  word_groups: [
    { id: 'hello', unit_id: 'u1', lesson_number: 9, english_meaning: 'Hello', sort_order: 1, content_status: 'draft' },
    { id: 'welcome', unit_id: 'u1', lesson_number: 9, english_meaning: 'Welcome', sort_order: 2, content_status: 'draft' },
    { id: 'sorry', unit_id: 'u1', lesson_number: 9, english_meaning: 'Sorry', sort_order: 3, content_status: 'draft' },
  ],
  word_variants: [
    variant('v-hello', 'hello', 'primary', 'أسلامة', 'aslema'),
    variant('v-hello-alt', 'hello', 'also_heard', 'أهلا', 'ahla'),
    variant('v-welcome-m', 'welcome', 'masculine', 'مرحبا بيك', 'marhba bik', { is_native_voice: true, audio_path: 'welcome/m.mp3' }),
    variant('v-welcome-f', 'welcome', 'feminine', 'مرحبا بيكي', 'marhba biki'),
    variant('v-sorry', 'sorry', 'primary', 'سامحني', 'sam7ni'),
  ],
  content_source_notes: [{ word_variant_id: 'v-sorry', note: '[HIGH]' }],
  reviewers: [{ user_id: REVIEWER }],
};

/** The exported sheet with verdicts filled in, as the reviewer would return it. */
async function returnedSheet(db, verdicts) {
  const rows = exportForReview(await loadSnapshot(db)).map((r) => ({ ...r, ...(verdicts[r.variant_id] ?? {}) }));
  const matrix = parseCsv(toCsv([REVIEW_COLUMNS, ...rows.map((r) => REVIEW_COLUMNS.map((c) => r[c]))]));
  const header = matrix[0];
  return { header, records: matrix.slice(1).map((values, i) => ({ rowNumber: i + 2, values: Object.fromEntries(header.map((h, c) => [h, values[c]])) })) };
}
const plan = async (db, verdicts) => {
  const { header, records } = await returnedSheet(db, verdicts);
  return planReview(header, records, await loadSnapshot(db), { accountId: REVIEWER, name: 'Reviewer' }, '2026-11-02T10:00:00Z');
};

describe('export for review', () => {
  it('lists draft / pending forms in order, with empty verdict columns, notes and spelling hints', async () => {
    const rows = exportForReview(await loadSnapshot(memoryDb(DB)));
    assert.deepEqual(rows.map((r) => r.variant_id), ['v-hello', 'v-hello-alt', 'v-welcome-m', 'v-welcome-f', 'v-sorry']);
    assert.ok(rows.every((r) => r.verdict === '' && r.corrected_arabic === '' && r.corrected_transliteration === '' && r.reviewer_note === ''));
    assert.equal(rows.find((r) => r.variant_id === 'v-welcome-m').spelling_check, 'ح without 7');
    assert.equal(rows.find((r) => r.variant_id === 'v-sorry').notes, '[HIGH]');
  });

  it('the command writes the CSV and never writes to the database', async () => {
    const db = memoryDb(DB);
    const out = join(await mkdtemp(join(tmpdir(), 'lt-review-')), 'review.csv');
    await exportForReviewCommand({ db, out, log: () => {} });
    assert.deepEqual(db.writes, []);
    const matrix = parseCsv(await readFile(out, 'utf8'));
    assert.deepEqual(matrix[0], REVIEW_COLUMNS);
    assert.equal(matrix.length, 6);
  });
});

describe('verdicts', () => {
  it('ok: approved and text-verified, by this reviewer, now — the recording flag untouched', async () => {
    const db = memoryDb(DB);
    const p = await plan(db, { 'v-welcome-m': { verdict: 'ok' }, 'v-welcome-f': { verdict: 'OK ' } });
    assert.deepEqual(p.errors, []);
    await applyReview(db, p);
    const m = db.tables.word_variants.find((v) => v.id === 'v-welcome-m');
    assert.deepEqual([m.content_status, m.native_verified, m.approved_by, m.approved_at, m.is_native_voice], ['approved', true, REVIEWER, '2026-11-02T10:00:00Z', true]);
    const f = db.tables.word_variants.find((v) => v.id === 'v-welcome-f');
    assert.equal(f.is_native_voice, false, 'a text review never marks audio as native');
    assert.equal(db.tables.word_groups.find((g) => g.id === 'welcome').content_status, 'approved');
    const events = db.tables.content_review_events;
    assert.deepEqual(events.map((e) => [e.word_variant_id, e.verdict, e.reviewer_name, e.reviewer_account_id, e.reviewed_at]), [
      ['v-welcome-m', 'ok', 'Reviewer', REVIEWER, '2026-11-02T10:00:00Z'],
      ['v-welcome-f', 'ok', 'Reviewer', REVIEWER, '2026-11-02T10:00:00Z'],
    ]);
  });

  it('fix: applies the correction, approves, logs old and new text; a recording that no longer matches is un-marked', async () => {
    const db = memoryDb(DB);
    const p = await plan(db, {
      'v-welcome-m': { verdict: 'fix', corrected_transliteration: 'mar7ba bik', reviewer_note: 'ح is 7' },
      'v-welcome-f': { verdict: 'fix', corrected_transliteration: 'mar7ba biki' },
    });
    assert.deepEqual(p.errors, []);
    assert.match(p.warnings.join('\n'), /welcome \(masculine\) was corrected, so its native recording needs re-recording/);
    await applyReview(db, p);
    const m = db.tables.word_variants.find((v) => v.id === 'v-welcome-m');
    assert.deepEqual([m.transliteration, m.word_arabic, m.content_status, m.native_verified, m.is_native_voice], ['mar7ba bik', 'مرحبا بيك', 'approved', true, false]);
    const e = db.tables.content_review_events[0];
    assert.deepEqual([e.verdict, e.reviewed_transliteration, e.corrected_transliteration, e.corrected_arabic, e.reviewer_note], ['fix', 'marhba bik', 'mar7ba bik', null, 'ح is 7']);
  });

  it('reject: rejected, not verified; a word with every form rejected is rejected', async () => {
    const db = memoryDb(DB);
    await applyReview(db, await plan(db, { 'v-sorry': { verdict: 'reject', reviewer_note: 'means excuse me' } }));
    const v = db.tables.word_variants.find((x) => x.id === 'v-sorry');
    assert.deepEqual([v.content_status, v.native_verified, v.approved_by], ['rejected', false, null]);
    assert.equal(db.tables.word_groups.find((g) => g.id === 'sorry').content_status, 'rejected');
  });

  it('a word is approved only once all its remaining forms are approved and still valid', async () => {
    const db = memoryDb(DB);
    const partial = await plan(db, { 'v-hello': { verdict: 'ok' } });
    assert.equal(partial.groupUpdates.length, 0, 'also-heard form still unreviewed');
    const broken = await plan(db, { 'v-welcome-m': { verdict: 'ok' }, 'v-welcome-f': { verdict: 'reject' } });
    assert.equal(broken.groupUpdates.length, 0);
    assert.match(broken.warnings.join('\n'), /welcome is not approved: after this review it has a masculine form without its pair/);
    const rejectingAlt = await plan(db, { 'v-hello': { verdict: 'ok' }, 'v-hello-alt': { verdict: 'reject' } });
    assert.deepEqual(rejectingAlt.groupUpdates, [{ id: 'hello', patch: { content_status: 'approved' } }]);
  });

  it('rows without a verdict are left alone', async () => {
    const p = await plan(memoryDb(DB), {});
    assert.equal(p.counts.skipped, 5);
    assert.equal(p.variantUpdates.length, 0);
  });
});

describe('problems are reported, never guessed — and block the whole write', () => {
  const sheetWith = async (db, edit) => {
    const { header, records } = await returnedSheet(db, { 'v-hello': { verdict: 'ok' } });
    edit(records);
    return planReview(header, records, await loadSnapshot(db), { accountId: REVIEWER, name: 'Reviewer' });
  };

  it('an unknown variant id', async () => {
    const p = await sheetWith(memoryDb(DB), (r) => r.push({ rowNumber: 9, values: { ...r[0].values, variant_id: 'v-nope', verdict: 'ok' } }));
    assert.match(p.errors.map((e) => e.message).join(), /unknown variant_id v-nope — not in the database \(nothing is guessed\)/);
  });

  for (const [name, values, expected] of [
    ['an invalid verdict', { verdict: 'maybe' }, /verdict "maybe" must be ok, fix or reject/],
    ['ok with a correction', { verdict: 'ok', corrected_transliteration: '3aslema' }, /verdict ok has a correction/],
    ['fix without a correction', { verdict: 'fix' }, /verdict fix needs corrected_arabic/],
    ['fix with a badly formatted correction', { verdict: 'fix', corrected_transliteration: 'Aslema!' }, /corrected_transliteration must be lowercase/],
    ['fix that changes nothing', { verdict: 'fix', corrected_transliteration: 'aslema' }, /the correction is the same as the current text/],
    ['a row edited since the export', { verdict: 'ok', transliteration: 'aslama' }, /changed in the database since the export/],
  ]) {
    it(name, async () => {
      const p = await sheetWith(memoryDb(DB), (r) => Object.assign(r[0].values, values));
      assert.match(p.errors.map((e) => e.message).join('\n'), expected);
    });
  }

  it('a form that was already reviewed differently', async () => {
    const db = memoryDb(DB);
    const { header, records } = await returnedSheet(db, { 'v-hello': { verdict: 'ok' } });
    db.tables.word_variants.find((v) => v.id === 'v-hello').content_status = 'rejected';
    const p = planReview(header, records, await loadSnapshot(db), { accountId: REVIEWER, name: 'Reviewer' });
    assert.match(p.errors[0].message, /already rejected/);
  });

  it('running the same sheet again after it was applied skips those rows', async () => {
    const db = memoryDb(DB);
    const verdicts = { 'v-hello': { verdict: 'ok' }, 'v-sorry': { verdict: 'reject' } };
    const { header, records } = await returnedSheet(db, verdicts);
    await applyReview(db, planReview(header, records, await loadSnapshot(db), { accountId: REVIEWER, name: 'Reviewer' }));
    const again = planReview(header, records, await loadSnapshot(db), { accountId: REVIEWER, name: 'Reviewer' });
    assert.deepEqual(again.errors, []);
    assert.equal(again.counts.alreadyApplied, 2);
    assert.equal(again.variantUpdates.length, 0);
  });
});

describe('the command', () => {
  const file = async (db, verdicts) => {
    const { header, records } = await returnedSheet(db, verdicts);
    const path = join(await mkdtemp(join(tmpdir(), 'lt-review-')), 'returned.csv');
    await writeFile(path, toCsv([header, ...records.map((r) => header.map((h) => r.values[h]))]), 'utf8');
    return path;
  };

  it('dry run by default: nothing written', async () => {
    const db = memoryDb(DB);
    const out = [];
    const code = await importReviewCommand({ file: await file(db, { 'v-hello': { verdict: 'ok' } }), db, reviewerAccount: REVIEWER, reviewerName: 'Reviewer', log: (s) => out.push(s) });
    assert.equal(code, 0);
    assert.deepEqual(db.writes, []);
    assert.match(out.join('\n'), /Dry run: nothing was written/);
  });

  it('the reviewer must be in public.reviewers (an admin alone is not enough)', async () => {
    const db = memoryDb({ ...DB, reviewers: [] });
    await assert.rejects(
      importReviewCommand({ file: await file(db, {}), db, reviewerAccount: REVIEWER, reviewerName: 'Reviewer', execute: true, log: () => {} }),
      /not in public.reviewers/
    );
    assert.deepEqual(db.writes, []);
  });

  it('a reviewer name is required', async () => {
    const db = memoryDb(DB);
    await assert.rejects(importReviewCommand({ file: 'x.csv', db, reviewerAccount: REVIEWER, reviewerName: ' ', log: () => {} }), /--reviewer-name/);
  });

  it('any error: nothing is written, even with execute', async () => {
    const db = memoryDb(DB);
    const code = await importReviewCommand({
      file: await file(db, { 'v-hello': { verdict: 'ok' }, 'v-sorry': { verdict: 'perhaps' } }),
      db, reviewerAccount: REVIEWER, reviewerName: 'Reviewer', execute: true, log: () => {},
    });
    assert.equal(code, 1);
    assert.deepEqual(db.writes, []);
  });
});
