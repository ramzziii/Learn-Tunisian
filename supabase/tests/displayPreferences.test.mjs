// Learner display preferences (0023_display_preferences.sql), against the
// whole real schema: which script to show (Arabic / Latin / both) and which
// grammatical form to show first (masculine / feminine / both).
// - It's a display setting, not a profile/gender field: its own table,
//   readable and writable only by the profile's own account — not by
//   admins, not by anyone else.
// - Existing learners have no row, which means both/both; nothing is
//   silently assigned.
// - It goes with the profile (cascade) and with account deletion.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, fullSchemaDb, isDenied } from './harness.mjs';

const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002'; // an admin, to show admins can't read it either
const PA = 'aaaaaaaa-1111-0000-0000-000000000001';
const PB = 'bbbbbbbb-1111-0000-0000-000000000002';

async function seed(db) {
  await db.exec(`
    insert into auth.users (id, email) values ('${A}', 'a@example.com'), ('${B}', 'b@example.com');
    update public.accounts set is_admin = true where id = '${B}';
    insert into public.profiles (id, account_id, name, native_language, starting_proficiency, track, date_of_birth, country)
      values ('${PA}', '${A}', 'A', 'English', 'none', 'adult', '1990-01-01', 'Tunisia'),
             ('${PB}', '${B}', 'B', 'French', 'none', 'adult', '1985-05-05', 'France');
  `);
}

const count = async (db, sql, params = []) => (await db.query(sql, params)).rows[0].n;

describe('learner_display_preferences', () => {
  let db;
  before(async () => {
    db = await fullSchemaDb();
    await seed(db);
  });

  it('existing learners have no row — the app reads that as both/both', async () => {
    assert.equal(await count(db, `select count(*)::int as n from public.learner_display_preferences`), 0);
  });

  it('defaults are both/both when a row is created without values', async () => {
    const r = await as(db, 'authenticated', A, `insert into public.learner_display_preferences (profile_id) values ($1) returning script, form`, [PA]);
    assert.equal(r.error, null, r.error?.message);
    assert.deepEqual(r.rows[0], { script: 'both', form: 'both' });
  });

  it('the owner can read and change their own preferences', async () => {
    const u = await as(db, 'authenticated', A, `update public.learner_display_preferences set script = 'arabic', form = 'feminine' where profile_id = $1 returning script, form`, [PA]);
    assert.equal(u.error, null, u.error?.message);
    assert.deepEqual(u.rows, [{ script: 'arabic', form: 'feminine' }]);
    const s = await as(db, 'authenticated', A, `select script, form from public.learner_display_preferences`);
    assert.deepEqual(s.rows, [{ script: 'arabic', form: 'feminine' }]);
  });

  it('only the documented values are accepted', async () => {
    for (const sql of [
      `update public.learner_display_preferences set script = 'cyrillic' where profile_id = $1`,
      `update public.learner_display_preferences set form = 'other' where profile_id = $1`,
      `update public.learner_display_preferences set form = null where profile_id = $1`,
    ]) {
      const r = await as(db, 'authenticated', A, sql, [PA]);
      assert.ok(r.error, sql);
    }
  });

  it('another account — even an admin — cannot read or change it', async () => {
    assert.deepEqual((await as(db, 'authenticated', B, `select * from public.learner_display_preferences`)).rows, []);
    await as(db, 'authenticated', B, `update public.learner_display_preferences set form = 'masculine' where profile_id = $1`, [PA]);
    assert.equal((await db.query(`select form from public.learner_display_preferences where profile_id = $1`, [PA])).rows[0].form, 'feminine');
    const insertForOther = await as(db, 'authenticated', B, `insert into public.learner_display_preferences (profile_id) values ($1)`, [PA]);
    assert.ok(insertForOther.error);
  });

  it('a signed-out caller has no access at all', async () => {
    assert.ok(isDenied(await as(db, 'anon', null, `select * from public.learner_display_preferences`)));
    assert.ok(isDenied(await as(db, 'anon', null, `insert into public.learner_display_preferences (profile_id) values ($1)`, [PA])));
  });

  it('the owner cannot delete the row directly (they change it instead); it goes with the profile', async () => {
    assert.ok(isDenied(await as(db, 'authenticated', A, `delete from public.learner_display_preferences where profile_id = $1`, [PA])));
  });

  it('updated_at moves on every change', async () => {
    const before = (await db.query(`select updated_at from public.learner_display_preferences where profile_id = $1`, [PA])).rows[0].updated_at;
    await new Promise((r) => setTimeout(r, 10));
    await as(db, 'authenticated', A, `update public.learner_display_preferences set script = 'latin' where profile_id = $1`, [PA]);
    const after = (await db.query(`select updated_at from public.learner_display_preferences where profile_id = $1`, [PA])).rows[0].updated_at;
    assert.ok(new Date(after) > new Date(before));
  });

  it('account deletion removes it along with the profile', async () => {
    await as(db, 'authenticated', B, `insert into public.learner_display_preferences (profile_id, form) values ($1, 'masculine')`, [PB]);
    const r = await as(db, 'service_role', null, `select public.delete_account_data($1) as result`, [A]);
    assert.equal(r.error, null, r.error?.message);
    assert.equal(await count(db, `select count(*)::int as n from public.learner_display_preferences where profile_id = $1`, [PA]), 0);
    assert.equal(await count(db, `select count(*)::int as n from public.learner_display_preferences where profile_id = $1`, [PB]), 1);
  });

  it('adds no gender or identity column to profiles', async () => {
    const cols = (await db.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'profiles'`)).rows.map(
      (r) => r.column_name
    );
    assert.equal(cols.some((c) => /gender|sex|pronoun|form/i.test(c)), false, cols.join(', '));
  });
});
