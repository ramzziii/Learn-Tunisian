// Guest preview (0024_guest_preview.sql + scripts/select-guest-preview.sql),
// against the whole real schema, queried as the real signed-out role (anon):
// - the views show only the explicitly selected, approved rows and the listed
//   columns; nothing else (other content, drafts, admin columns, other tables);
// - anon still gets nothing from the real tables and can't write anywhere;
// - the selection script refuses anything not exactly as intended;
// - the rollback is exact.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { as, fullSchemaDb } from './harness.mjs';

const root = join(import.meta.dirname, '..', '..');
const SELECTION = readFileSync(join(root, 'scripts', 'select-guest-preview.sql'), 'utf8');
const ROLLBACK = readFileSync(join(root, 'supabase', 'rollbacks', '0024_guest_preview.rollback.sql'), 'utf8');
// Later migrations that build on 0024, rolled back first (newest first).
const LATER_ROLLBACKS = ['0028_review_rules_and_import_log', '0027_phrase_word_links']
  .map((name) => readFileSync(join(root, 'supabase', 'rollbacks', `${name}.rollback.sql`), 'utf8'))
  .join('\n');

const U = (n) => `aaaaaaaa-0000-0000-0000-00000000000${n}`;
const L = (n) => `bbbbbbbb-0000-0000-0000-00000000000${n}`;

/** Test content on top of the real migrations (0007 already loaded the phrasebook, all approved). */
async function setup() {
  const db = await fullSchemaDb();
  await db.exec(`
    insert into public.units (id, name, sort_order, is_curriculum) values
      ('${U(1)}', 'Daily Phrases', 1, true),
      ('${U(2)}', 'Colors', 2, true),
      ('${U(3)}', 'Animals', 3, true),
      ('${U(4)}', 'Greetings', 200, false); -- duplicate NAME, a different unit
    insert into public.lessons (id, unit_id, lesson_number, title, sort_order) values
      ('${L(1)}', '${U(1)}', 8, 'Daily Phrases', 1),
      ('${L(2)}', '${U(2)}', 4, 'Colors', 1),
      ('${L(3)}', '${U(3)}', 5, 'Animals', 1),
      ('${L(4)}', '${U(4)}', 1, 'Greetings', 1);
    insert into public.word_groups (id, unit_id, lesson_number, english_meaning, sort_order, content_status) values
      ('dp_ok1', '${U(1)}', 8, 'hello friend', 1, 'approved'),
      ('dp_ok2', '${U(1)}', 8, 'thank you', 2, 'approved'),
      ('dp_draft', '${U(1)}', 8, 'draft word', 3, 'draft'),
      ('dp_unlisted', '${U(1)}', 8, 'approved but not selected', 4, 'approved'),
      ('co_red', '${U(2)}', 4, 'red', 1, 'approved'),
      ('an_cat', '${U(3)}', 5, 'cat', 1, 'approved'),
      ('dupe_word', '${U(4)}', 1, 'in the duplicate Greetings', 1, 'approved');
    insert into public.word_variants (word_group_id, variant_label, word_arabic, transliteration, audio_path, sort_order,
                                      content_status, speaker_name, explanation_audio_path) values
      ('dp_ok1', 'primary', 'أهلا', 'ahla', 'dp/ok1.m4a', 0, 'approved', 'Private Speaker', 'dp/ok1_expl.m4a'),
      ('dp_ok2', 'masculine', 'يعيشك', 'y3aychek', 'dp/ok2_m.m4a', 0, 'approved', null, null),
      ('dp_ok2', 'feminine', 'يعيشك', 'y3aychek', 'dp/ok2_f.m4a', 1, 'draft', null, null),
      ('dp_draft', 'primary', 'مسودة', 'draft', 'dp/draft.m4a', 0, 'approved', null, null),
      ('dp_unlisted', 'primary', 'لا', 'la', 'dp/unlisted.m4a', 0, 'approved', null, null),
      ('co_red', 'primary', 'أحمر', 'a7mer', 'co/red.m4a', 0, 'approved', null, null),
      ('an_cat', 'primary', 'قطوس', 'qattous', 'an/cat.m4a', 0, 'approved', null, null),
      ('dupe_word', 'primary', 'زيد', 'zid', 'x/dupe.m4a', 0, 'approved', null, null);
  `);
  const pb = async (name, sort) =>
    (await db.query(`select l.id from public.lessons l join public.units u on u.id = l.unit_id where u.name = $1 and u.sort_order = $2`, [name, sort])).rows[0].id;
  return { db, greetings: await pb('Greetings', 100), firstEncounters: await pb('First Encounters', 101) };
}

const GREETINGS_WORDS = ['pb_greet_hello', 'pb_greet_peace', 'pb_greet_good_morning', 'pb_greet_good_evening',
  'pb_greet_how_are_you', 'pb_greet_im_fine', 'pb_greet_thank_you', 'pb_greet_goodbye'];
const FIRST_WORDS = ['pb_first_whats_your_name', 'pb_first_my_name_is', 'pb_first_nice_to_meet_you',
  'pb_first_where_are_you_from', 'pb_first_im_from', 'pb_first_do_you_speak_english', 'pb_first_how_old_are_you',
  'pb_first_see_you_soon'];

const arr = (xs, cast) => (xs ? `array[${xs.map((x) => `'${x}'`).join(',')}]::${cast}` : 'null');
function fill({ lessons, words, pbLessons, pbWords }) {
  return SELECTION
    .replace('/*CURRICULUM_LESSONS*/ null', arr(lessons, 'uuid[]'))
    .replace('/*CURRICULUM_WORDS*/ null', arr(words, 'text[]'))
    .replace('/*PHRASEBOOK_LESSONS*/ null', arr(pbLessons, 'uuid[]'))
    .replace('/*PHRASEBOOK_WORDS*/ null', arr(pbWords, 'text[]'));
}

const anon = async (db, sql) => {
  const r = await as(db, 'anon', null, sql);
  return r.error ? { error: r.error.message } : r.rows;
};

describe('guest preview views, as the signed-out role', () => {
  it('shows exactly the selected, approved rows and the listed columns — nothing else', async () => {
    const { db, greetings, firstEncounters } = await setup();
    await db.exec(fill({ lessons: [L(1), L(2)], words: ['dp_ok1', 'dp_ok2', 'co_red'], pbLessons: [greetings, firstEncounters], pbWords: [...GREETINGS_WORDS, ...FIRST_WORDS] }));

    const units = await anon(db, `select * from public.guest_preview_units order by sort_order`);
    assert.deepEqual(units.map((u) => u.name), ['Daily Phrases', 'Colors', 'Greetings', 'First Encounters']);
    assert.ok(!units.some((u) => u.id === U(4)), 'the duplicate-name unit is not exposed');

    const lessons = await anon(db, `select id from public.guest_preview_lessons`);
    assert.equal(lessons.length, 4);

    const groups = await anon(db, `select * from public.guest_preview_word_groups order by id`);
    const ids = groups.map((g) => g.id);
    assert.deepEqual(ids.filter((id) => !id.startsWith('pb_')), ['co_red', 'dp_ok1', 'dp_ok2']);
    assert.equal(ids.filter((id) => id.startsWith('pb_')).length, 16);
    for (const hidden of ['dp_draft', 'dp_unlisted', 'an_cat', 'dupe_word']) assert.ok(!ids.includes(hidden), hidden);

    const variants = await anon(db, `select * from public.guest_preview_word_variants`);
    assert.ok(!variants.some((v) => v.word_group_id === 'dp_ok2' && v.variant_label === 'feminine'), 'draft form hidden');

    assert.deepEqual(Object.keys(groups[0]).sort(), ['content_status', 'english_meaning', 'id', 'image_keyword', 'image_path', 'lesson_number', 'sort_order', 'unit_id']);
    // audio_needs_recheck: added by 0028.
    assert.deepEqual(Object.keys(variants[0]).sort(), ['audio_needs_recheck', 'audio_path', 'content_status', 'id', 'in_repeat_after_me', 'is_native_voice', 'native_verified', 'notes', 'sort_order', 'transliteration', 'updated_at', 'variant_label', 'word_arabic', 'word_group_id']);
    assert.ok((await anon(db, `select created_by from public.guest_preview_word_groups`)).error);
    assert.ok((await anon(db, `select speaker_name from public.guest_preview_word_variants`)).error);
  });

  it('the real tables stay closed to anon, and no view accepts writes', async () => {
    const { db, greetings, firstEncounters } = await setup();
    await db.exec(fill({ lessons: [L(1), L(2)], words: ['dp_ok1'], pbLessons: [greetings, firstEncounters], pbWords: GREETINGS_WORDS }));
    for (const t of ['units', 'lessons', 'word_groups', 'word_variants']) {
      assert.equal((await anon(db, `select count(*)::int n from public.${t}`))[0].n, 0, t);
    }
    for (const sql of [
      `insert into public.guest_preview_units (id, name, sort_order, is_curriculum) values (gen_random_uuid(), 'x', 1, true)`,
      `update public.guest_preview_units set name = 'x'`,
      `delete from public.guest_preview_units`,
      `update public.guest_preview_word_variants set word_arabic = 'x'`,
    ]) {
      assert.ok((await anon(db, sql)).error, sql);
    }
    for (const t of ['profiles', 'progress', 'favorites', 'reviewers', 'corrections', 'ai_usage_log', 'translation_requests', 'accounts', 'feature_item_claims']) {
      const r = await anon(db, `select count(*)::int n from public.${t}`);
      assert.ok(r.error || r[0].n === 0, t);
    }
  });

  it('a selected word set back to draft later disappears', async () => {
    const { db, greetings, firstEncounters } = await setup();
    await db.exec(fill({ lessons: [L(1), L(2)], words: ['dp_ok1', 'dp_ok2'], pbLessons: [greetings, firstEncounters], pbWords: GREETINGS_WORDS }));
    await db.exec(`update public.word_groups set content_status = 'draft' where id = 'dp_ok2'`);
    const rows = await anon(db, `select id from public.guest_preview_word_groups where id like 'dp_%'`);
    assert.deepEqual(rows.map((r) => r.id), ['dp_ok1']);
  });

  it('before the selection script runs, the views are empty', async () => {
    const { db } = await setup();
    assert.equal((await anon(db, `select count(*)::int n from public.guest_preview_word_groups`))[0].n, 0);
  });
});

describe('selection script checks — each aborts and flags nothing', () => {
  const cases = [
    ['selection not filled in', () => ({})],
    ['a draft word', (g, f) => ({ lessons: [L(1), L(2)], words: ['dp_ok1', 'dp_draft'], pbLessons: [g, f], pbWords: GREETINGS_WORDS })],
    ['a word outside the selected lessons', (g, f) => ({ lessons: [L(1), L(2)], words: ['dp_ok1', 'an_cat'], pbLessons: [g, f], pbWords: GREETINGS_WORDS })],
    ['a word that doesn’t exist', (g, f) => ({ lessons: [L(1), L(2)], words: ['dp_ok1', 'nope'], pbLessons: [g, f], pbWords: GREETINGS_WORDS })],
    ['a word listed twice', (g, f) => ({ lessons: [L(1), L(2)], words: ['dp_ok1', 'dp_ok1'], pbLessons: [g, f], pbWords: GREETINGS_WORDS })],
    ['not the first two lessons in course order', (g, f) => ({ lessons: [L(1), L(3)], words: ['dp_ok1'], pbLessons: [g, f], pbWords: GREETINGS_WORDS })],
    ['only one curriculum lesson', (g, f) => ({ lessons: [L(1)], words: ['dp_ok1'], pbLessons: [g, f], pbWords: GREETINGS_WORDS })],
    ['a phrasebook lesson given as a curriculum lesson', (g, f) => ({ lessons: [L(1), g], words: ['dp_ok1'], pbLessons: [g, f], pbWords: GREETINGS_WORDS })],
    ['the duplicate-name Greetings as a category', (g) => ({ lessons: [L(1), L(2)], words: ['dp_ok1'], pbLessons: [g, L(4)], pbWords: GREETINGS_WORDS })],
  ];
  for (const [label, build] of cases) {
    it(label, async () => {
      const { db, greetings, firstEncounters } = await setup();
      await assert.rejects(db.exec(`begin; ${fill(build(greetings, firstEncounters))} commit;`), /guest preview/);
      await db.exec('rollback');
      for (const t of ['units', 'lessons', 'word_groups']) {
        const n = (await db.query(`select count(*)::int n from public.${t} where is_guest_preview`)).rows[0].n;
        assert.equal(n, 0, t);
      }
    });
  }
});

describe('0024 rollback', () => {
  it('restores the content tables’ columns, grants and policies exactly', async () => {
    const snapshot = async (db) => JSON.stringify([
      (await db.query(`select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name in ('units','lessons','word_groups','word_variants') order by 1, 2`)).rows,
      (await db.query(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name in ('units','lessons','word_groups','word_variants') order by 1, 2, 3`)).rows,
      (await db.query(`select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where tablename in ('units','lessons','word_groups','word_variants') order by 1, 2`)).rows,
    ]);
    // "Before" = every migration except 0024, i.e. the full schema with 0024 rolled back.
    // Rollbacks run newest first: 0027's and 0028's guest views build on 0024's.
    const db = await fullSchemaDb();
    await db.exec(LATER_ROLLBACKS);
    await db.exec(ROLLBACK);
    const after = await snapshot(db);
    const views = await db.query(`select count(*)::int n from pg_views where viewname like 'guest_preview_%'`);
    assert.equal(views.rows[0].n, 0);
    assert.ok(!after.includes('is_guest_preview'));
  });
});
