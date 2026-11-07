// In-app feedback (0029_app_feedback.sql), on the whole real schema:
// - a signed-in learner can send a note for their own account only, can't
//   read, edit or delete notes; guests (anon) can't send at all;
// - admins read every note and mark it read; nothing else is editable;
// - notes are 1–2000 characters, at most 20 per account per day;
// - account deletion removes the account's notes; the rollback is clean.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, it } from 'node:test';

import { as, fullSchemaDb, isDenied } from './harness.mjs';

const root = join(import.meta.dirname, '..', '..');
const ROLLBACK = readFileSync(join(root, 'supabase', 'rollbacks', '0029_app_feedback.rollback.sql'), 'utf8');

const ADMIN = 'aaaaaaaa-0000-0000-0000-000000000001';
const LEARNER = 'bbbbbbbb-0000-0000-0000-000000000002';
const OTHER = 'cccccccc-0000-0000-0000-000000000003';

const send = (db, user, account, message = 'The lesson audio is quiet') =>
  as(db, 'authenticated', user, `insert into public.app_feedback (account_id, message, screen) values ($1, $2, '/learn')`, [account, message]);
const count = async (db, where = 'true') => (await db.query(`select count(*)::int as n from public.app_feedback where ${where}`)).rows[0].n;

describe('app feedback', () => {
  let db;
  beforeEach(async () => {
    db = await fullSchemaDb();
    await db.exec(`
      insert into auth.users (id, email) values ('${ADMIN}', 'a@example.com'), ('${LEARNER}', 'l@example.com'), ('${OTHER}', 'o@example.com');
      update public.accounts set is_admin = true where id = '${ADMIN}';
    `);
  });

  it('a learner sends a note for their own account; never for someone else; guests can’t send', async () => {
    assert.equal((await send(db, LEARNER, LEARNER)).error, null);
    assert.ok(isDenied(await send(db, LEARNER, OTHER)), 'not for another account');
    assert.ok(isDenied(await as(db, 'anon', null, `insert into public.app_feedback (account_id, message) values ('${LEARNER}', 'hi')`)), 'guests');
    assert.equal(await count(db), 1);
  });

  it('a learner can’t read, edit or delete notes; an admin reads all and marks them read', async () => {
    await send(db, LEARNER, LEARNER);
    assert.equal((await as(db, 'authenticated', LEARNER, `select * from public.app_feedback`)).rows.length, 0, 'no read-back');
    await as(db, 'authenticated', LEARNER, `update public.app_feedback set read_at = now()`);
    await as(db, 'authenticated', LEARNER, `delete from public.app_feedback`);
    assert.equal(await count(db, 'read_at is null'), 1, 'learner changed nothing');

    const read = await as(db, 'authenticated', ADMIN, `select message, screen from public.app_feedback`);
    assert.deepEqual(read.rows, [{ message: 'The lesson audio is quiet', screen: '/learn' }]);
    assert.equal((await as(db, 'authenticated', ADMIN, `update public.app_feedback set read_at = now()`)).error, null);
    assert.equal(await count(db, 'read_at is not null'), 1);
    assert.ok(isDenied(await as(db, 'authenticated', ADMIN, `update public.app_feedback set message = 'edited'`)), 'admins can’t edit notes');
  });

  it('1–2000 characters; at most 20 per account per day', async () => {
    assert.notEqual((await send(db, LEARNER, LEARNER, '   ')).error, null, 'blank');
    assert.notEqual((await send(db, LEARNER, LEARNER, 'x'.repeat(2001))).error, null, 'too long');
    for (let i = 0; i < 20; i++) assert.equal((await send(db, LEARNER, LEARNER, `note ${i}`)).error, null);
    assert.match((await send(db, LEARNER, LEARNER, 'one more')).error.message, /feedback_limit/);
    assert.equal((await send(db, OTHER, OTHER)).error, null, 'other accounts unaffected');
  });

  it('account deletion removes the account’s notes, and only theirs', async () => {
    await send(db, LEARNER, LEARNER);
    await send(db, OTHER, OTHER);
    const r = await as(db, 'service_role', null, `select public.delete_account_data($1) as result`, [LEARNER]);
    assert.equal(r.error, null, r.error?.message);
    assert.equal(await count(db, `account_id = '${LEARNER}'`), 0);
    assert.equal(await count(db, `account_id = '${OTHER}'`), 1);
  });

  it('the rollback removes the table and its function', async () => {
    await db.exec(ROLLBACK);
    const left = await db.query(`select to_regclass('public.app_feedback') as t, to_regprocedure('public.limit_app_feedback()') as f`);
    assert.deepEqual(left.rows[0], { t: null, f: null });
  });
});
