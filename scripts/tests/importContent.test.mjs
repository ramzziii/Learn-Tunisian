// Bulk import: everything arrives as draft; re-running changes nothing; a
// changed row updates its form and sends it back to draft; several lessons
// per unit get sensible order; existing words are never moved; nothing is
// written without --execute.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { importContentCommand } from '../lib/content/commands.mjs';
import { loadSnapshot } from '../lib/content/db.mjs';
import { applyImportPlan, planHasChanges, planImport } from '../lib/content/importContent.mjs';
import { importCsv, memoryDb, sheetRow } from './memoryDb.mjs';

const EXISTING = {
  units: [
    { id: 'u-food', name: 'Food', sort_order: 4, is_curriculum: true },
    { id: 'u-colors', name: 'Colors', sort_order: 2, is_curriculum: true },
    { id: 'u-pb-shop', name: 'Shopping', sort_order: 107, is_curriculum: false },
  ],
  lessons: [
    { id: 'l-food', unit_id: 'u-food', lesson_number: 6, title: 'Food', sort_order: 1 },
    { id: 'l-colors', unit_id: 'u-colors', lesson_number: 4, title: 'Colors', sort_order: 1 },
  ],
  word_groups: [
    { id: 'bread', unit_id: 'u-food', lesson_number: 6, english_meaning: 'bread', sort_order: 1, content_status: 'approved' },
    { id: 'orange', unit_id: 'u-colors', lesson_number: 4, english_meaning: 'orange', sort_order: 5, content_status: 'approved' },
  ],
  word_variants: [
    { id: 'v-bread', word_group_id: 'bread', variant_label: 'primary', word_arabic: 'خبز', transliteration: 'khobz', audio_path: 'food/bread.m4a', sort_order: 0, content_status: 'approved', native_verified: true, is_native_voice: true },
    { id: 'v-orange', word_group_id: 'orange', variant_label: 'primary', word_arabic: 'مشماشي', transliteration: 'mechmechi', audio_path: null, sort_order: 0, content_status: 'approved', native_verified: false, is_native_voice: false },
  ],
};

const SHEET = [
  sheetRow(2, 'Greetings', 9, 'hello', 'primary', 'أسلامة', 'aslema', 'Hello', { notes: '[HIGH]' }),
  sheetRow(3, 'Greetings', 9, 'hello', 'also_heard', 'أهلا', 'ahla', 'Hello'),
  sheetRow(4, 'Greetings', 9, 'welcome', 'masculine', 'مرحبا بيك', 'mar7ba bik', 'Welcome'),
  sheetRow(5, 'Greetings', 9, 'welcome', 'feminine', 'مرحبا بيكي', 'mar7ba biki', 'Welcome'),
  sheetRow(6, 'Greetings', 10, 'yes', 'primary', 'إيه', 'iyeh', 'Yes'),
  sheetRow(7, 'Food', 17, 'orange_fruit', 'primary', 'برتقال', 'borto9al', 'Orange (fruit)'),
  sheetRow(8, 'Shopping', 20, 'expensive', 'primary', 'غالي', 'ghali', 'Expensive'),
];

async function imported(rows = SHEET, initial = EXISTING) {
  const db = memoryDb(initial);
  const snapshot = await loadSnapshot(db);
  const plan = planImport(rows, snapshot);
  assert.deepEqual(plan.errors, []);
  await applyImportPlan(db, plan, snapshot, '2026-11-01T00:00:00Z');
  return db;
}

describe('a first import', () => {
  it('creates units, lessons, word groups and forms — every one a draft, nothing verified or native', async () => {
    const db = await imported();
    const t = db.tables;
    assert.deepEqual(t.units.filter((u) => !u.id.startsWith('u-')).map((u) => u.name).sort(), ['Greetings', 'Shopping']);
    assert.equal(t.word_groups.filter((g) => ['hello', 'welcome', 'yes', 'orange_fruit', 'expensive'].includes(g.id)).every((g) => g.content_status === 'draft'), true);
    const added = t.word_variants.filter((v) => !v.id.startsWith('v-'));
    assert.equal(added.length, 7);
    assert.ok(added.every((v) => v.content_status === 'draft' && v.native_verified === false && v.is_native_voice === false && !v.audio_path));
  });

  it('several lessons per unit: ordered by lesson number, numbered titles; words ordered as in the sheet', async () => {
    const db = await imported();
    const greetings = db.tables.units.find((u) => u.name === 'Greetings');
    const lessons = db.tables.lessons.filter((l) => l.unit_id === greetings.id).sort((a, b) => a.sort_order - b.sort_order);
    assert.deepEqual(lessons.map((l) => [l.lesson_number, l.title, l.sort_order]), [[9, 'Greetings 1', 9], [10, 'Greetings 2', 10]]);
    assert.deepEqual(db.tables.word_groups.filter((g) => g.lesson_number === 9).map((g) => [g.id, g.sort_order]), [['hello', 1], ['welcome', 2]]);
  });

  it('new units come after the existing course units; a Phrasebook name gets its own course unit', async () => {
    const db = await imported();
    const shopping = db.tables.units.filter((u) => u.name === 'Shopping');
    assert.equal(shopping.length, 2);
    assert.deepEqual(db.tables.units.filter((u) => ['Greetings', 'Shopping'].includes(u.name) && u.is_curriculum).map((u) => u.sort_order), [5, 6]);
  });

  it('an existing course unit gets a new lesson (Food 17), its other words untouched', async () => {
    const db = await imported();
    assert.ok(db.tables.lessons.some((l) => l.unit_id === 'u-food' && l.lesson_number === 17));
    assert.equal(db.tables.word_groups.find((g) => g.id === 'bread').content_status, 'approved');
  });

  it('the sheet notes are kept privately, not on the learner-visible form', async () => {
    const db = await imported();
    const hello = db.tables.word_variants.find((v) => v.word_group_id === 'hello' && v.variant_label === 'primary');
    assert.equal(hello.notes, undefined);
    assert.deepEqual(db.tables.content_source_notes.map((n) => [n.word_variant_id, n.note]), [[hello.id, '[HIGH]']]);
  });
});

describe('running again', () => {
  it('the same sheet changes nothing', async () => {
    const db = await imported();
    const plan = planImport(SHEET, await loadSnapshot(db));
    assert.deepEqual(plan.errors, []);
    assert.equal(planHasChanges(plan), false);
    assert.equal(plan.unchangedVariants, 7);
  });

  it('a changed row updates just that form and sends it back to unreviewed draft', async () => {
    const db = await imported();
    const helloId = db.tables.word_variants.find((v) => v.word_group_id === 'hello' && v.variant_label === 'primary').id;
    Object.assign(db.tables.word_variants.find((v) => v.id === helloId), { content_status: 'approved', native_verified: true, is_native_voice: true, audio_path: 'hello/x.mp3' });
    const changed = SHEET.map((r) => (r.rowNumber === 2 ? { ...r, transliteration: '3aslema' } : r));
    const plan = planImport(changed, await loadSnapshot(db));
    assert.equal(plan.variantUpdates.length, 1);
    assert.deepEqual(plan.variantUpdates[0].rows, [2]);
    assert.equal(plan.variantUpdates[0].wasApproved, true);
    assert.equal(plan.newVariants.length + plan.newGroups.length, 0);
    await applyImportPlan(db, plan, await loadSnapshot(db));
    const v = db.tables.word_variants.find((x) => x.id === helloId);
    assert.deepEqual(
      [v.transliteration, v.content_status, v.native_verified, v.is_native_voice, v.audio_path],
      ['3aslema', 'draft', false, false, 'hello/x.mp3']
    );
  });
});

describe('conflicts block the import', () => {
  it('an existing id in another unit or lesson is never moved', async () => {
    const plan = planImport([sheetRow(2, 'Food', 17, 'orange', 'primary', 'برتقال', 'borto9al', 'Orange')], await loadSnapshot(memoryDb(EXISTING)));
    assert.equal(plan.errors.length, 1);
    assert.match(plan.errors[0].message, /orange already exists in Colors lesson 4; moving it is not allowed/);
  });

  it('a row that would break an existing word’s forms is refused', async () => {
    const plan = planImport([sheetRow(2, 'Food', 6, 'bread', 'feminine', 'خبزة', 'khobza', 'bread')], await loadSnapshot(memoryDb(EXISTING)));
    assert.match(plan.errors[0].message, /bread together with its existing forms mixes a primary form/);
  });
});

describe('the command', () => {
  const sheetFile = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lt-import-'));
    const file = join(dir, 'sheet.csv');
    await writeFile(file, importCsv([['Greetings', 9, 'hello', 'primary', 'أسلامة', 'aslema', 'Hello', 'hello__primary.mp3', '[HIGH]']]), 'utf8');
    return file;
  };

  it('dry run by default: reads, reports, writes nothing', async () => {
    const db = memoryDb(EXISTING);
    const out = [];
    const code = await importContentCommand({ file: await sheetFile(), db, log: (s) => out.push(s) });
    assert.equal(code, 0);
    assert.deepEqual(db.writes, []);
    assert.match(out.join('\n'), /Dry run: nothing was written/);
  });

  it('writes only with execute', async () => {
    const db = memoryDb(EXISTING);
    await importContentCommand({ file: await sheetFile(), db, execute: true, log: () => {} });
    assert.ok(db.writes.length > 0);
    assert.ok(db.tables.word_groups.some((g) => g.id === 'hello' && g.content_status === 'draft'));
  });

  it('an invalid sheet stops before the database is even read', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lt-import-'));
    const file = join(dir, 'bad.csv');
    await writeFile(file, importCsv([['Greetings', 9, 'hello', 'primary', 'أسلامة', 'Aslema', 'Hello', '', '']]), 'utf8');
    const db = memoryDb(EXISTING);
    let reads = 0;
    const counting = { ...db, select: async (...a) => (reads++, db.select(...a)) };
    const code = await importContentCommand({ file, db: counting, execute: true, log: () => {} });
    assert.equal(code, 1);
    assert.equal(reads, 0);
    assert.deepEqual(db.writes, []);
  });
});
