// The content scripts against the whole real schema (every migration, a
// throwaway PGlite database), so the actual constraints decide:
// - an import creates units, lessons, words and forms as draft, including a
//   masculine + feminine pair the group-forms trigger accepts;
// - importing the same sheet again changes nothing;
// - a review approves / rejects, writes the review log (0026) and never sets
//   is_native_voice; an audio upload then marks the recording native.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { applyAudio, matchAudioFiles } from '../../scripts/lib/content/audio.mjs';
import { loadSnapshot } from '../../scripts/lib/content/db.mjs';
import { applyImportPlan, planHasChanges, planImport } from '../../scripts/lib/content/importContent.mjs';
import { applyReview, exportForReview, planReview } from '../../scripts/lib/content/review.mjs';
import { fullSchemaDb } from './harness.mjs';

const REVIEWER = 'aaaaaaaa-0000-4000-8000-000000000001';

/** The scripts' database adapter over PGlite (run as the database owner, like the service role). */
function pgliteAdapter(db) {
  const uploads = [];
  return {
    uploads,
    async select(table, columns) {
      return (await db.query(`select ${columns} from public.${table}`)).rows;
    },
    async insert(table, rows) {
      if (rows.length === 0) return [];
      const cols = Object.keys(rows[0]);
      const params = [];
      const tuples = rows.map((r) => `(${cols.map((c) => (params.push(r[c]), `$${params.length}`)).join(', ')})`);
      return (await db.query(`insert into public.${table} (${cols.join(', ')}) values ${tuples.join(', ')} returning *`, params)).rows;
    },
    async update(table, patch, match) {
      const params = [];
      const set = Object.entries(patch).map(([k, v]) => (params.push(v), `${k} = $${params.length}`));
      const where = Object.entries(match).map(([k, v]) => (params.push(v), `${k} = $${params.length}`));
      await db.query(`update public.${table} set ${set.join(', ')} where ${where.join(' and ')}`, params);
    },
    async upsert(table, rows, onConflict) {
      if (rows.length === 0) return;
      const cols = Object.keys(rows[0]);
      for (const r of rows) {
        await db.query(
          `insert into public.${table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
           on conflict (${onConflict}) do update set ${cols.filter((c) => c !== onConflict).map((c) => `${c} = excluded.${c}`).join(', ')}`,
          cols.map((c) => r[c])
        );
      }
    },
    async upload(bucket, path) {
      uploads.push(`${bucket}/${path}`);
    },
  };
}

const row = (rowNumber, unit, lessonNumber, wordGroupId, variantLabel, wordArabic, transliteration, englishMeaning, notes = '') => ({
  rowNumber, unit, lessonNumber, lessonNumberText: String(lessonNumber), lessonTitle: '', wordGroupId, variantLabel,
  wordArabic, transliteration, englishMeaning, audioFilename: '', notes,
});
const SHEET = [
  row(2, 'Greetings & Politeness', 9, 'hello', 'primary', 'أسلامة', 'aslema', 'Hello', '[HIGH]'),
  row(3, 'Greetings & Politeness', 9, 'hello', 'also_heard', 'أهلا', 'ahla', 'Hello'),
  row(4, 'Greetings & Politeness', 9, 'welcome', 'masculine', 'مرحبا بيك', 'mar7ba bik', 'Welcome', '[HIGH] said to a man / to a woman'),
  row(5, 'Greetings & Politeness', 9, 'welcome', 'feminine', 'مرحبا بيكي', 'mar7ba biki', 'Welcome', '[HIGH] said to a man / to a woman'),
  row(6, 'Greetings & Politeness', 10, 'yes', 'primary', 'إيه', 'iyeh', 'Yes'),
];

describe('content pipeline on the real schema', () => {
  let db;
  let adapter;
  before(async () => {
    db = await fullSchemaDb();
    await db.exec(`
      insert into auth.users (id, email) values ('${REVIEWER}', 'reviewer@example.com');
      insert into public.reviewers (user_id) values ('${REVIEWER}');
    `);
    adapter = pgliteAdapter(db);
  });

  it('imports as draft: new unit, two lessons, words and forms (the gendered pair accepted)', async () => {
    const snapshot = await loadSnapshot(adapter);
    const plan = planImport(SHEET, snapshot);
    assert.deepEqual(plan.errors, []);
    await applyImportPlan(adapter, plan, snapshot);
    const groups = (await db.query(`select id, content_status from public.word_groups where id in ('hello', 'welcome', 'yes') order by id`)).rows;
    assert.deepEqual(groups, [
      { id: 'hello', content_status: 'draft' },
      { id: 'welcome', content_status: 'draft' },
      { id: 'yes', content_status: 'draft' },
    ]);
    const forms = (await db.query(`select count(*)::int as n from public.word_variants
      where word_group_id in ('hello', 'welcome', 'yes') and content_status = 'draft' and not native_verified and not is_native_voice`)).rows[0].n;
    assert.equal(forms, 5);
    const lessons = (await db.query(`select l.lesson_number, l.title from public.lessons l join public.units u on u.id = l.unit_id
      where u.name = 'Greetings & Politeness' order by l.sort_order`)).rows;
    assert.deepEqual(lessons, [{ lesson_number: 9, title: 'Greetings & Politeness 1' }, { lesson_number: 10, title: 'Greetings & Politeness 2' }]);
    assert.equal((await db.query(`select count(*)::int as n from public.content_source_notes`)).rows[0].n, 3);
  });

  it('importing the same sheet again changes nothing', async () => {
    const plan = planImport(SHEET, await loadSnapshot(adapter));
    assert.deepEqual(plan.errors, []);
    assert.equal(planHasChanges(plan), false);
  });

  it('a review approves and rejects, logs who and when, and never marks audio native', async () => {
    const snapshot = await loadSnapshot(adapter);
    const exported = exportForReview(snapshot).filter((r) => ['hello', 'welcome'].includes(r.word_group_id));
    const verdict = { 'hello#primary': 'ok', 'hello#also_heard': 'reject', 'welcome#masculine': 'ok', 'welcome#feminine': 'ok' };
    const header = Object.keys(exported[0]);
    const records = exported.map((r, i) => ({ rowNumber: i + 2, values: { ...r, verdict: verdict[`${r.word_group_id}#${r.variant_label}`] } }));
    const plan = planReview(header, records, snapshot, { accountId: REVIEWER, name: 'Reviewer' });
    assert.deepEqual(plan.errors, []);
    await applyReview(adapter, plan);

    const groups = (await db.query(`select id, content_status from public.word_groups where id in ('hello', 'welcome') order by id`)).rows;
    assert.deepEqual(groups, [{ id: 'hello', content_status: 'approved' }, { id: 'welcome', content_status: 'approved' }]);
    const approved = (await db.query(`select bool_and(native_verified) as verified, bool_or(is_native_voice) as any_native, bool_and(approved_by = '${REVIEWER}') as by_reviewer
      from public.word_variants where word_group_id in ('hello', 'welcome') and content_status = 'approved'`)).rows[0];
    assert.deepEqual(approved, { verified: true, any_native: false, by_reviewer: true });
    assert.equal((await db.query(`select count(*)::int as n from public.content_review_events where reviewer_name = 'Reviewer'`)).rows[0].n, 4);
  });

  it('an uploaded recording then counts as a native voice', async () => {
    const { matches } = matchAudioFiles(['hello__primary.mp3', 'yes__primary.mp3'], await loadSnapshot(adapter));
    assert.deepEqual(matches.map((m) => m.file), ['hello__primary.mp3'], 'yes is still a draft');
    await applyAudio(adapter, matches, async () => Buffer.from('audio'), { stamp: 1 });
    const v = (await db.query(`select audio_path, is_native_voice, native_verified from public.word_variants where word_group_id = 'hello' and variant_label = 'primary'`)).rows[0];
    assert.deepEqual(v, { audio_path: 'hello/hello__primary-1.mp3', is_native_voice: true, native_verified: true });
    assert.deepEqual(adapter.uploads, ['audio/hello/hello__primary-1.mp3']);
  });
});
