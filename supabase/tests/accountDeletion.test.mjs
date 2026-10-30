// Account deletion's database step (0022_account_deletion.sql), run against
// the WHOLE real schema (every migration), so the actual foreign keys and
// cascades decide what happens — not assumptions about them.
//
// delete_account_data(account) must, in one transaction:
//   - delete everything the account owns (profile and everything under it,
//     consent, translation requests and answers, daily AI counters, the
//     reviewer allowlist entry, the account row);
//   - keep shared content and other learners' data, with this account's
//     links removed (created_by / approved_by / handled_by …);
//   - keep AI cost records for accurate monthly totals, with every account
//     and profile id removed;
//   - be safe to run again.
// The Auth user itself is deleted afterwards by the delete-account Edge
// Function (Admin API); storage files are removed through the Storage API
// using account_storage_objects() — both tested in Jest.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, fullSchemaDb, isDenied } from './harness.mjs';

const A = 'aaaaaaaa-0000-0000-0000-000000000001'; // deletes their account (also an admin and a reviewer)
const B = 'bbbbbbbb-0000-0000-0000-000000000002'; // another learner
const PA = 'aaaaaaaa-1111-0000-0000-000000000001';
const PB = 'bbbbbbbb-1111-0000-0000-000000000002';
const REQ_A = 'aaaaaaaa-2222-0000-0000-000000000001';
const REQ_B = 'bbbbbbbb-2222-0000-0000-000000000002';

async function seed(db) {
  await db.exec(`
    insert into auth.users (id, email) values ('${A}', 'a@example.com'), ('${B}', 'b@example.com');
    update public.accounts set is_admin = true where id = '${A}';
    insert into public.reviewers (user_id) values ('${A}');

    insert into public.profiles (id, account_id, name, native_language, starting_proficiency, track, date_of_birth, country, is_premium)
      values ('${PA}', '${A}', 'Learner A', 'English', 'none', 'adult', '1990-01-01', 'Tunisia', true),
             ('${PB}', '${B}', 'Learner B', 'French', 'none', 'adult', '1985-05-05', 'France', false);

    insert into public.daily_goal_settings (profile_id, daily_goal_minutes, reminder_time)
      values ('${PA}', 10, '18:00'), ('${PB}', 5, '08:00');
    insert into public.consent_records (account_id, profile_id, is_for_child)
      values ('${A}', '${PA}', false), ('${B}', '${PB}', false);

    -- Shared content A created and approved as an admin.
    insert into public.units (id, name, created_by, updated_by) values ('cccccccc-0000-0000-0000-000000000001', 'Greetings', '${A}', '${A}');
    insert into public.lessons (unit_id, lesson_number, created_by, updated_by) values ('cccccccc-0000-0000-0000-000000000001', 1, '${A}', '${A}');
    insert into public.word_groups (id, unit_id, lesson_number, english_meaning, created_by, updated_by)
      values ('wg_hello', 'cccccccc-0000-0000-0000-000000000001', 1, 'hello', '${A}', '${A}'),
             ('tr_${REQ_A.replace(/-/g, '')}', 'cccccccc-0000-0000-0000-000000000001', 1, 'a learner''s question, shared', '${A}', '${A}');
    insert into public.word_variants (word_group_id, variant_label, word_arabic, transliteration, created_by, updated_by, approved_by, recording_skipped_by)
      values ('wg_hello', 'primary', 'عسلامة', 'aslema', '${A}', '${A}', '${A}', '${A}');

    insert into public.progress (profile_id, word_group_id) values ('${PA}', 'wg_hello'), ('${PB}', 'wg_hello');
    insert into public.favorites (profile_id, word_group_id) values ('${PA}', 'wg_hello'), ('${PB}', 'wg_hello');
    insert into public.session_logs (profile_id, session_type, duration_seconds) values ('${PA}', 'lesson', 120), ('${PB}', 'review', 60);
    insert into public.corrections (profile_id, ai_generated_text) values ('${PA}', '{"tunisian":"a","english":"b"}'), ('${PB}', '{"tunisian":"c","english":"d"}');

    -- A's own translation request (answered by B? no — by A as admin is irrelevant; answered by someone).
    insert into public.translation_requests (id, account_id, client_request_id, english_text, status, due_at,
        answer_arabic, answer_transliteration, answer_english, answer_audio_path, answer_explanation_audio_path, answered_at)
      values ('${REQ_A}', '${A}', gen_random_uuid(), 'How do I say thank you?', 'answered', now(),
        'يعيشك', 'y3ayshek', 'thank you', '${REQ_A}/answer-1.m4a', '${REQ_A}/explanation-2.m4a', now());
    -- B's request, handled by A as the admin.
    insert into public.translation_requests (id, account_id, client_request_id, english_text, due_at, handled_by)
      values ('${REQ_B}', '${B}', gen_random_uuid(), 'How do I say goodbye?', now(), '${A}');

    insert into public.ai_daily_usage (account_id, usage_date, kind, count)
      values ('${A}', current_date, 'chat', 5), ('${B}', current_date, 'chat', 2);
  `);

  // AI cost records for A (and B), through the real budget functions.
  for (const [account, profile, cost] of [
    [A, PA, 0.25],
    [B, PB, 0.5],
  ]) {
    const id = (await db.query(`select public.reserve_ai_budget($1, 'chat', 'gpt-4o-mini', 1, 10) as id`, [account])).rows[0].id;
    await db.query(
      `select public.reconcile_ai_budget($1, $2, 100, 20, 120, null, null, $3, false, '{"model":"gpt-4o-mini"}'::jsonb)`,
      [id, profile, cost]
    );
  }
  // An ambiguous (still held) reservation for A.
  const held = (await db.query(`select public.reserve_ai_budget($1, 'tts', 'tts-1', 0.01, 10) as id`, [A])).rows[0].id;
  await db.query(`select public.mark_ai_budget_ambiguous($1, 'timeout')`, [held]);

  await db.exec(`
    insert into storage.objects (bucket_id, name) values
      ('translation-audio', '${REQ_A}/answer-1.m4a'),
      ('translation-audio', '${REQ_A}/explanation-2.m4a'),
      ('translation-audio', '${REQ_A}/answer-0-replaced.m4a'),
      ('translation-audio', '${REQ_B}/answer-9.m4a'),
      ('audio', 'tr_${REQ_A.replace(/-/g, '')}/primary-3.m4a'),
      ('audio', 'wg_hello/primary-4.m4a');
  `);
}

const count = async (db, sql, params = []) => (await db.query(sql, params)).rows[0].n;
const svc = (db, sql, params) => as(db, 'service_role', null, sql, params);

describe('delete_account_data', () => {
  let db;
  let result;
  let monthTotalBefore;
  let storageList;

  before(async () => {
    db = await fullSchemaDb();
    await seed(db);
    monthTotalBefore = await count(
      db,
      `select sum(estimated_cost_usd)::float as n from public.ai_usage_log where budget_month = public.ai_budget_month(now())`
    );
    storageList = await svc(db, `select bucket, name from public.account_storage_objects($1) order by name`, [A]);
    const r = await svc(db, `select public.delete_account_data($1) as result`, [A]);
    assert.equal(r.error, null, r.error?.message);
    result = r.rows[0].result;
  });

  it('lists exactly the account’s private translation audio for removal — not B’s, not shared copies', () => {
    assert.equal(storageList.error, null);
    assert.deepEqual(storageList.rows, [
      { bucket: 'translation-audio', name: `${REQ_A}/answer-0-replaced.m4a` },
      { bucket: 'translation-audio', name: `${REQ_A}/answer-1.m4a` },
      { bucket: 'translation-audio', name: `${REQ_A}/explanation-2.m4a` },
    ]);
  });

  it('reports that the account existed and was removed', () => {
    assert.equal(result.account_deleted, true);
  });

  for (const [table, where] of [
    ['public.accounts', `id = '${A}'`],
    ['public.profiles', `account_id = '${A}'`],
    ['public.daily_goal_settings', `profile_id = '${PA}'`],
    ['public.consent_records', `account_id = '${A}'`],
    ['public.progress', `profile_id = '${PA}'`],
    ['public.favorites', `profile_id = '${PA}'`],
    ['public.session_logs', `profile_id = '${PA}'`],
    ['public.corrections', `profile_id = '${PA}'`],
    ['public.translation_requests', `account_id = '${A}'`],
    ['public.ai_daily_usage', `account_id = '${A}'`],
    ['public.reviewers', `user_id = '${A}'`],
  ]) {
    it(`deletes: ${table}`, async () => {
      assert.equal(await count(db, `select count(*)::int as n from ${table} where ${where}`), 0);
    });
  }

  it('anonymizes AI cost records: kept for the monthly total, with no account or profile id', async () => {
    assert.equal(await count(db, `select count(*)::int as n from public.ai_usage_log where account_id = '${A}' or profile_id = '${PA}'`), 0);
    assert.equal(await count(db, `select count(*)::int as n from public.ai_budget_reservations where account_id = '${A}'`), 0);
    const monthTotalAfter = await count(
      db,
      `select sum(estimated_cost_usd)::float as n from public.ai_usage_log where budget_month = public.ai_budget_month(now())`
    );
    assert.equal(monthTotalAfter, monthTotalBefore);
    // The still-held reservation keeps counting against the budget, unlinked.
    assert.equal(
      await count(db, `select count(*)::int as n from public.ai_budget_reservations where status = 'ambiguous' and account_id is null`),
      1
    );
  });

  it('keeps shared content A created or approved, with A’s links removed', async () => {
    assert.equal(await count(db, `select count(*)::int as n from public.word_groups where id = 'wg_hello' and created_by is null and updated_by is null`), 1);
    assert.equal(
      await count(
        db,
        `select count(*)::int as n from public.word_variants
           where word_group_id = 'wg_hello' and created_by is null and updated_by is null and approved_by is null and recording_skipped_by is null`
      ),
      1
    );
    const UNIT = 'cccccccc-0000-0000-0000-000000000001';
    assert.equal(await count(db, `select count(*)::int as n from public.units where id = '${UNIT}' and created_by is null and updated_by is null`), 1);
    assert.equal(await count(db, `select count(*)::int as n from public.lessons where unit_id = '${UNIT}' and created_by is null and updated_by is null`), 1);
  });

  it('keeps the shared copy of A’s translation answer', async () => {
    assert.equal(await count(db, `select count(*)::int as n from public.word_groups where id like 'tr_%'`), 1);
  });

  it('keeps B’s request that A handled as an admin, with handled_by cleared', async () => {
    const row = (await db.query(`select account_id, handled_by from public.translation_requests where id = $1`, [REQ_B])).rows[0];
    assert.deepEqual(row, { account_id: B, handled_by: null });
  });

  it('leaves every other account’s data exactly as it was', async () => {
    for (const [table, where] of [
      ['public.accounts', `id = '${B}'`],
      ['public.profiles', `id = '${PB}'`],
      ['public.daily_goal_settings', `profile_id = '${PB}'`],
      ['public.consent_records', `account_id = '${B}'`],
      ['public.progress', `profile_id = '${PB}'`],
      ['public.favorites', `profile_id = '${PB}'`],
      ['public.session_logs', `profile_id = '${PB}'`],
      ['public.corrections', `profile_id = '${PB}'`],
      ['public.ai_daily_usage', `account_id = '${B}'`],
      ['public.ai_usage_log', `account_id = '${B}' and profile_id = '${PB}'`],
    ]) {
      assert.equal(await count(db, `select count(*)::int as n from ${table} where ${where}`), 1, table);
    }
  });

  it('does not touch storage itself (files go through the Storage API) or the Auth user', async () => {
    assert.equal(await count(db, `select count(*)::int as n from storage.objects`), 6);
    assert.equal(await count(db, `select count(*)::int as n from auth.users where id = '${A}'`), 1);
  });

  it('running it again is a safe no-op', async () => {
    const again = await svc(db, `select public.delete_account_data($1) as result`, [A]);
    assert.equal(again.error, null);
    assert.equal(again.rows[0].result.account_deleted, false);
    assert.equal(await count(db, `select count(*)::int as n from public.accounts where id = '${B}'`), 1);
    const list = await svc(db, `select * from public.account_storage_objects($1)`, [A]);
    assert.equal(list.rows.length, 0, 'nothing left to list once the requests are gone');
  });

  it('the Auth user can then be deleted cleanly', async () => {
    await db.query(`delete from auth.users where id = $1`, [A]);
    assert.equal(await count(db, `select count(*)::int as n from auth.users where id = '${B}'`), 1);
  });

  it('an admin and reviewer can delete themselves; afterwards there may be no admin or reviewer left', async () => {
    assert.equal(await count(db, `select count(*)::int as n from public.accounts where is_admin`), 0);
    assert.equal(await count(db, `select count(*)::int as n from public.reviewers`), 0);
  });
});

describe('who can run it', () => {
  let db;
  before(async () => {
    db = await fullSchemaDb();
    await seed(db);
  });

  for (const role of ['authenticated', 'anon']) {
    it(`${role} cannot call delete_account_data or account_storage_objects — not even for themselves`, async () => {
      const uid = role === 'authenticated' ? A : null;
      assert.ok(isDenied(await as(db, role, uid, `select public.delete_account_data($1)`, [A])));
      assert.ok(isDenied(await as(db, role, uid, `select * from public.account_storage_objects($1)`, [A])));
      assert.equal(await count(db, `select count(*)::int as n from public.accounts where id = '${A}'`), 1);
    });
  }

  it('an unknown account id is a no-op, not an error', async () => {
    const r = await svc(db, `select public.delete_account_data($1) as result`, ['00000000-0000-0000-0000-00000000dead']);
    assert.equal(r.error, null);
    assert.equal(r.rows[0].result.account_deleted, false);
  });
});
