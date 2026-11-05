// Review rules, audio re-check and import log (0028_review_rules_and_import_log.sql),
// on the whole real schema:
// - only language reviewers approve or reject; admins may edit, draft, archive;
// - a spelling change keeps the recording and flags it "needs re-check"; the
//   flag is cleared only by confirm_audio_matches or a new file — never by a
//   direct edit, a faked session setting or a forged token;
// - review_word_variant writes the 0026 review log; the rollback is exact and
//   must run before 0026's.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { as, fullSchemaDb, isDenied } from './harness.mjs';

const root = join(import.meta.dirname, '..', '..');
const down28 = readFileSync(join(root, 'supabase', 'rollbacks', '0028_review_rules_and_import_log.rollback.sql'), 'utf8');
const down26 = readFileSync(join(root, 'supabase', 'rollbacks', '0026_content_review_log.rollback.sql'), 'utf8');

const ADMIN = 'aaaaaaaa-0000-0000-0000-000000000001';
const REVIEWER = 'bbbbbbbb-0000-0000-0000-000000000002';
const LEARNER = 'eeeeeeee-0000-0000-0000-000000000003';
const P_REVIEWER = 'bbbbbbbb-1111-0000-0000-000000000002';
const U = 'cccccccc-0000-0000-0000-000000000001';
const M = 'dddddddd-0000-0000-0000-000000000001';
const F = 'dddddddd-0000-0000-0000-000000000002';
const H = 'dddddddd-0000-0000-0000-000000000003';
const A = 'dddddddd-0000-0000-0000-000000000004';

async function freshWith0028() {
  const db = await fullSchemaDb(); // every migration, 0001 → 0028
  await db.exec(`
    insert into auth.users (id, email) values ('${ADMIN}', 'a@example.com'), ('${REVIEWER}', 'r@example.com'), ('${LEARNER}', 'l@example.com');
    update public.accounts set is_admin = true where id in ('${ADMIN}', '${REVIEWER}');
    insert into public.reviewers (user_id) values ('${REVIEWER}');
    insert into public.profiles (id, account_id, name, native_language, starting_proficiency, track, date_of_birth, country, is_premium)
      values ('${P_REVIEWER}', '${REVIEWER}', 'Reviewer Name', 'English', 'none', 'adult', '1980-01-01', 'Tunisia', false);
    insert into public.units (id, name) values ('${U}', 'Greetings');
    insert into public.lessons (unit_id, lesson_number) values ('${U}', 9);
    insert into public.word_groups (id, unit_id, lesson_number, english_meaning) values ('welcome', '${U}', 9, 'Welcome'), ('hello', '${U}', 9, 'Hello');
    insert into public.word_variants (id, word_group_id, variant_label, word_arabic, transliteration) values
      ('${M}', 'welcome', 'masculine', 'مرحبا بيك', 'marhba bik'),
      ('${F}', 'welcome', 'feminine', 'مرحبا بيكي', 'mar7ba biki'),
      ('${H}', 'hello', 'primary', 'أسلامة', 'aslema'),
      ('${A}', 'hello', 'also_heard', 'أهلا', 'ahla');
  `);
  return db;
}
const one = async (db, sql) => (await db.query(sql)).rows[0];
const review = (db, user, id, verdict, fixLatin = null, note = null) =>
  as(db, 'authenticated', user, `select public.review_word_variant($1, $2, null, $3, $4) as s`, [id, verdict, fixLatin, note]);

test('0028 applies cleanly on top of 0001 → 0027', async () => {
  const db = await freshWith0028();
  const objects = await one(db, `select
      to_regclass('public.content_review_events') is not null as review_log,
      to_regclass('public.content_source_notes') is not null as notes,
      to_regclass('public.phrase_word_links') is not null as links,
      to_regclass('public.content_import_runs') is not null as import_log,
      to_regprocedure('public.review_word_variant(uuid,text,text,text,text)') is not null as review_fn`);
  assert.deepEqual(objects, { review_log: true, notes: true, links: true, import_log: true, review_fn: true });
});

test('a review through 0028 is written to the 0026 review log, exactly', async () => {
  const db = await freshWith0028();
  const r = await review(db, REVIEWER, M, 'fix', 'mar7ba bik', 'h is 7');
  assert.equal(r.error, null, r.error?.message);
  const ev = await one(db, `select word_variant_id, word_group_id, variant_label, verdict, reviewer_account_id, reviewer_name,
      reviewer_note, reviewed_arabic, reviewed_transliteration, corrected_arabic, corrected_transliteration from public.content_review_events`);
  assert.deepEqual(ev, {
    word_variant_id: M, word_group_id: 'welcome', variant_label: 'masculine', verdict: 'fix',
    reviewer_account_id: REVIEWER, reviewer_name: 'Reviewer Name', reviewer_note: 'h is 7',
    reviewed_arabic: 'مرحبا بيك', reviewed_transliteration: 'marhba bik', corrected_arabic: null, corrected_transliteration: 'mar7ba bik',
  });
  // 0026's read rules still hold for rows 0028 wrote: admins read, learners don't.
  assert.equal((await as(db, 'authenticated', ADMIN, `select * from public.content_review_events`)).rows.length, 1);
  assert.equal((await as(db, 'authenticated', LEARNER, `select * from public.content_review_events`)).rows.length, 0);
  assert.ok(isDenied(await as(db, 'authenticated', REVIEWER, `delete from public.content_review_events`)), 'still no client writes');
});

test('review outcomes: pair goes live together; also-heard rejected leaves the primary live; all rejected → rejected', async () => {
  const db = await freshWith0028();
  assert.equal((await review(db, REVIEWER, M, 'ok')).rows[0].s, 'draft');
  assert.equal((await review(db, REVIEWER, F, 'ok')).rows[0].s, 'approved');
  assert.equal((await review(db, REVIEWER, H, 'ok')).rows[0].s, 'draft', 'also-heard still waiting');
  assert.equal((await review(db, REVIEWER, A, 'reject')).rows[0].s, 'approved');
  assert.equal((await one(db, `select count(*)::int as n from public.content_review_events`)).n, 4);
});

test('0026 history survives deleting the reviewed word or its unit (after 0028 wrote it)', async () => {
  const db = await freshWith0028();
  await review(db, REVIEWER, A, 'reject');
  await db.exec(`delete from public.word_variants where id = '${A}'`);
  assert.deepEqual(await one(db, `select word_variant_id, verdict, reviewed_transliteration from public.content_review_events`), {
    word_variant_id: null, verdict: 'reject', reviewed_transliteration: 'ahla',
  });
  await db.exec(`delete from public.units where id = '${U}'`);
  assert.equal((await one(db, `select count(*)::int as n from public.content_review_events`)).n, 1);
});

test('0026 account deletion clears the reviewer from history written by 0028, and their approval stamp', async () => {
  const db = await freshWith0028();
  await review(db, REVIEWER, M, 'ok');
  await review(db, REVIEWER, F, 'ok');
  const r = await as(db, 'service_role', null, `select public.delete_account_data($1) as result`, [REVIEWER]);
  assert.equal(r.error, null, r.error?.message);
  const ev = (await db.query(`select reviewer_account_id, reviewer_name, verdict from public.content_review_events`)).rows;
  assert.deepEqual(ev, [
    { reviewer_account_id: null, reviewer_name: null, verdict: 'ok' },
    { reviewer_account_id: null, reviewer_name: null, verdict: 'ok' },
  ]);
  assert.equal((await one(db, `select count(*)::int as n from public.word_variants where approved_by is not null`)).n, 0);
  assert.equal((await one(db, `select content_status from public.word_groups where id = 'welcome'`)).content_status, 'approved', 'content stays live');
});

test('0028 rules: admins who are not reviewers cannot approve; scripts (service role) and the SQL editor still can', async () => {
  const db = await freshWith0028();
  assert.ok(isDenied(await as(db, 'authenticated', ADMIN, `update public.word_groups set content_status = 'approved' where id = 'hello'`)));
  assert.ok(isDenied(await review(db, ADMIN, H, 'ok')));
  assert.equal((await as(db, 'service_role', null, `update public.word_variants set content_status = 'approved', native_verified = true where id = '${H}'`)).error, null);
  await db.exec(`update public.word_groups set content_status = 'approved' where id = 'hello'`);
});

test('rejecting is reviewer-only too; archiving stays open to any admin', async () => {
  const db = await freshWith0028();
  assert.ok(isDenied(await as(db, 'authenticated', ADMIN, `update public.word_variants set content_status = 'rejected' where id = '${H}'`)), 'admin cannot reject a form');
  assert.ok(isDenied(await as(db, 'authenticated', ADMIN, `update public.word_groups set content_status = 'rejected' where id = 'hello'`)), 'admin cannot reject a word');
  assert.equal((await as(db, 'authenticated', ADMIN, `update public.word_groups set content_status = 'archived' where id = 'hello'`)).error, null, 'admin may archive');
  assert.equal((await as(db, 'authenticated', ADMIN, `update public.word_groups set content_status = 'draft' where id = 'hello'`)).error, null, 'admin may send back to draft');
  assert.equal((await as(db, 'authenticated', REVIEWER, `update public.word_variants set content_status = 'rejected' where id = '${A}'`)).error, null, 'reviewer may reject');
  assert.equal((await as(db, 'service_role', null, `update public.word_variants set content_status = 'rejected' where id = '${H}'`)).error, null, 'scripts are not checked by the trigger');
});

test('audio re-check: a spelling change keeps the file and its native flag, and flags it', async () => {
  const db = await freshWith0028();
  await db.exec(`update public.word_variants set audio_path = 'w/m.mp3', is_native_voice = true where id = '${M}'`);
  await db.exec(`update public.word_variants set transliteration = 'mar7ba bik' where id = '${M}'`);
  assert.deepEqual(await one(db, `select audio_path, is_native_voice, audio_needs_recheck, native_verified from public.word_variants where id = '${M}'`), {
    audio_path: 'w/m.mp3', is_native_voice: true, audio_needs_recheck: true, native_verified: false,
  });
  // A form without a recording has nothing to re-check.
  await db.exec(`update public.word_variants set transliteration = 'aslema2' where id = '${H}'`);
  assert.equal((await one(db, `select audio_needs_recheck from public.word_variants where id = '${H}'`)).audio_needs_recheck, false);
  // A reviewer's "fix" through review_word_variant flags it the same way.
  await db.exec(`update public.word_variants set audio_path = 'w/f.mp3', is_native_voice = true where id = '${F}'`);
  await review(db, REVIEWER, F, 'fix', 'mar7ba bikii');
  assert.equal((await one(db, `select audio_needs_recheck from public.word_variants where id = '${F}'`)).audio_needs_recheck, true);
});

test('audio re-check: the flag cannot be cleared by editing the field — not by an admin, a script or the SQL editor', async () => {
  const db = await freshWith0028();
  await db.exec(`update public.word_variants set audio_path = 'w/m.mp3', is_native_voice = true where id = '${M}'`);
  await db.exec(`update public.word_variants set transliteration = 'mar7ba bik' where id = '${M}'`);
  const clear = `update public.word_variants set audio_needs_recheck = false where id = '${M}'`;
  assert.ok(isDenied(await as(db, 'authenticated', ADMIN, clear)), 'admin');
  assert.ok(isDenied(await as(db, 'service_role', null, clear)), 'service role');
  await assert.rejects(db.exec(clear), /cleared only by confirming it or replacing it/, 'database owner');
  assert.equal((await one(db, `select audio_needs_recheck from public.word_variants where id = '${M}'`)).audio_needs_recheck, true);
});

test('audio re-check: cleared by confirming (admin or reviewer, not a learner) or by replacing the file', async () => {
  const db = await freshWith0028();
  await db.exec(`update public.word_variants set audio_path = 'w/m.mp3', is_native_voice = true where id = '${M}'`);
  await db.exec(`update public.word_variants set transliteration = 'mar7ba bik' where id = '${M}'`);
  assert.ok(isDenied(await as(db, 'authenticated', LEARNER, `select public.confirm_audio_matches($1)`, [M])), 'learner cannot confirm');
  assert.equal((await as(db, 'authenticated', ADMIN, `select public.confirm_audio_matches($1)`, [M])).error, null, 'admin confirms');
  assert.deepEqual(await one(db, `select audio_needs_recheck, is_native_voice, native_verified from public.word_variants where id = '${M}'`), {
    audio_needs_recheck: false, is_native_voice: true, native_verified: false,
  }, 'text approval and native voice untouched');
  const again = await as(db, 'authenticated', REVIEWER, `select public.confirm_audio_matches($1)`, [M]);
  assert.match(again.error.message, /nothing_to_confirm/);
  // Replace: a new file clears it, through any normal write.
  await db.exec(`update public.word_variants set transliteration = 'mar7ba bik ya' where id = '${M}'`);
  assert.equal((await as(db, 'service_role', null, `update public.word_variants set audio_path = 'w/m2.mp3' where id = '${M}'`)).error, null);
  assert.equal((await one(db, `select audio_needs_recheck from public.word_variants where id = '${M}'`)).audio_needs_recheck, false);
});

test('guests see the re-check flag through the guest view (0024, replaced by 0028)', async () => {
  const db = await freshWith0028();
  const cols = (await db.query(`select column_name from information_schema.columns where table_name = 'guest_preview_word_variants' order by ordinal_position`)).rows.map((r) => r.column_name);
  assert.equal(cols.at(-1), 'audio_needs_recheck');
  assert.equal(cols.length, 14);
  assert.equal((await as(db, 'anon', null, `select audio_needs_recheck from public.guest_preview_word_variants`)).error, null);
});

test('rollback in reverse order (0028, then 0026) leaves a working schema', async () => {
  const db = await freshWith0028();
  await review(db, REVIEWER, M, 'ok');
  await db.exec(down28);
  assert.equal((await one(db, `select to_regprocedure('public.review_word_variant(uuid,text,text,text,text)') as f`)).f, null);
  const viewCols = (await db.query(`select column_name from information_schema.columns where table_name = 'guest_preview_word_variants'`)).rows.length;
  assert.equal(viewCols, 13, 'guest view back to 0024 (13 columns)');
  assert.equal((await as(db, 'anon', null, `select id from public.guest_preview_word_variants`)).error, null, '0024 grants restored');
  assert.equal((await one(db, `select count(*)::int as n from information_schema.columns where table_name = 'word_variants' and column_name = 'audio_needs_recheck'`)).n, 0);
  assert.equal((await one(db, `select to_regclass('public.content_review_events') is not null as kept`)).kept, true, '0026 data untouched by the 0028 rollback');
  await db.exec(down26);
  assert.deepEqual(await one(db, `select to_regclass('public.content_review_events') as a, to_regclass('public.content_source_notes') as b`), { a: null, b: null });
  const r = await as(db, 'service_role', null, `select public.delete_account_data($1) as result`, [REVIEWER]);
  assert.equal(r.error, null, r.error?.message);
  assert.equal(r.rows[0].result.account_deleted, true);
});

test('wrong rollback order: undoing 0026 while 0028 is in place breaks reviewing — so 0028 must be undone first', async () => {
  const db = await freshWith0028();
  await db.exec(down26);
  const r = await review(db, REVIEWER, M, 'ok');
  assert.notEqual(r.error, null, 'review needs the 0026 log');
});

test('audio re-check: a caller cannot fake the confirmation by setting learn_tunisian.confirming_audio themselves', async () => {
  const db = await freshWith0028();
  await db.exec(`update public.word_variants set audio_path = 'w/m.mp3', is_native_voice = true where id = '${M}'`);
  await db.exec(`update public.word_variants set transliteration = 'mar7ba bik' where id = '${M}'`);
  const clear = `update public.word_variants set audio_needs_recheck = false where id = '${M}'`;
  for (const [role, user] of [['authenticated', ADMIN], ['authenticated', REVIEWER], ['service_role', null]]) {
    // Session-wide setting, then the direct clear.
    assert.equal((await as(db, role, user, `select set_config('learn_tunisian.confirming_audio', 'on', false)`)).error, null, 'anyone can set a custom setting');
    assert.ok(isDenied(await as(db, role, user, clear)), `${role} ${user ?? ''}: session setting`);
    // Same statement, transaction-local setting.
    const oneStatement = `with s as (select set_config('learn_tunisian.confirming_audio', 'on', true) as v)
      update public.word_variants set audio_needs_recheck = false where id = '${M}' and (select v from s) = 'on'`;
    assert.ok(isDenied(await as(db, role, user, oneStatement)), `${role} ${user ?? ''}: same statement`);
  }
  // The database owner, too.
  await db.exec(`select set_config('learn_tunisian.confirming_audio', 'on', false)`);
  await assert.rejects(db.exec(clear), /cleared only by confirming it or replacing it/, 'database owner');
  assert.equal((await one(db, `select audio_needs_recheck from public.word_variants where id = '${M}'`)).audio_needs_recheck, true);
});

test('audio re-check: no client role can forge, read or leave behind a confirmation token', async () => {
  const db = await freshWith0028();
  await db.exec(`update public.word_variants set audio_path = 'w/m.mp3', is_native_voice = true where id = '${M}'`);
  await db.exec(`update public.word_variants set transliteration = 'mar7ba bik' where id = '${M}'`);
  for (const [role, user] of [['anon', null], ['authenticated', LEARNER], ['authenticated', ADMIN], ['authenticated', REVIEWER], ['service_role', null]]) {
    const forge = `with t as (insert into public.audio_recheck_confirmations (variant_id, txid) values ('${M}', txid_current()) returning 1)
      update public.word_variants set audio_needs_recheck = false where id = '${M}' and exists (select 1 from t)`;
    assert.ok(isDenied(await as(db, role, user, forge)), `${role} ${user ?? ''}: forge`);
    assert.ok(isDenied(await as(db, role, user, `select * from public.audio_recheck_confirmations`)), `${role} ${user ?? ''}: read`);
  }
  assert.equal((await one(db, `select audio_needs_recheck from public.word_variants where id = '${M}'`)).audio_needs_recheck, true);
  // A real confirm, then a failed one: no token is left behind either way.
  assert.equal((await as(db, 'authenticated', REVIEWER, `select public.confirm_audio_matches($1)`, [M])).error, null);
  assert.match((await as(db, 'authenticated', ADMIN, `select public.confirm_audio_matches($1)`, [M])).error.message, /nothing_to_confirm/);
  assert.equal((await one(db, `select count(*)::int as n from public.audio_recheck_confirmations`)).n, 0);
  // Rollback removes the token table.
  await db.exec(down28);
  assert.equal((await one(db, `select to_regclass('public.audio_recheck_confirmations') is null as gone`)).gone, true);
});
