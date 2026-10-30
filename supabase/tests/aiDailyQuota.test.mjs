// The existing per-account daily AI quotas (0018_ai_quota_and_account_email.sql),
// run for real: keyed by the authenticated account, UTC calendar days, and
// the limits chat 60 / tts 200 / stt 150. 0021 must leave them unchanged.
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { ACCOUNT_A, ACCOUNT_B, as, freshDb, isDenied } from './harness.mjs';

const MIGRATIONS = ['0018_ai_quota_and_account_email.sql', '0021_ai_monthly_budget.sql'];
let db;

const consume = (userId, kind) => as(db, 'authenticated', userId, 'select public.consume_ai_quota($1) as ok', [kind]);
const countFor = async (userId, kind) =>
  (
    await db.query(
      `select count from public.ai_daily_usage where account_id = $1 and kind = $2 and usage_date = (now() at time zone 'utc')::date`,
      [userId, kind]
    )
  ).rows[0]?.count ?? 0;

beforeEach(async () => {
  db = await freshDb(MIGRATIONS);
});

describe('daily quota per account', () => {
  it('under the limit: allowed and counted', async () => {
    const r = await consume(ACCOUNT_A, 'chat');
    assert.equal(r.error, null);
    assert.equal(r.rows[0].ok, true);
    assert.equal(await countFor(ACCOUNT_A, 'chat'), 1);
  });

  for (const [kind, limit] of [
    ['chat', 60],
    ['tts', 200],
    ['stt', 150],
  ]) {
    it(`${kind}: exactly the ${limit}th call is allowed, the next is refused and not counted`, async () => {
      await db.query(
        `insert into public.ai_daily_usage (account_id, usage_date, kind, count) values ($1, (now() at time zone 'utc')::date, $2, $3)`,
        [ACCOUNT_A, kind, limit - 1]
      );
      assert.equal((await consume(ACCOUNT_A, kind)).rows[0].ok, true, 'reaching exactly the limit');
      assert.equal(await countFor(ACCOUNT_A, kind), limit);
      assert.equal((await consume(ACCOUNT_A, kind)).rows[0].ok, false, 'over the limit');
      assert.equal(await countFor(ACCOUNT_A, kind), limit, 'a refused call is not counted');
    });
  }

  it('is keyed by account: one account at its limit does not affect another', async () => {
    await db.query(
      `insert into public.ai_daily_usage (account_id, usage_date, kind, count) values ($1, (now() at time zone 'utc')::date, 'chat', 60)`,
      [ACCOUNT_A]
    );
    assert.equal((await consume(ACCOUNT_A, 'chat')).rows[0].ok, false);
    assert.equal((await consume(ACCOUNT_B, 'chat')).rows[0].ok, true);
  });

  it('takes no profile or account argument — the caller is always auth.uid()', async () => {
    const fn = await db.query(
      `select pg_get_function_identity_arguments(p.oid) as args from pg_proc p where p.proname = 'consume_ai_quota'`
    );
    assert.equal(fn.rows[0].args, 'p_kind text');
  });

  it('the kinds are counted separately', async () => {
    await db.query(
      `insert into public.ai_daily_usage (account_id, usage_date, kind, count) values ($1, (now() at time zone 'utc')::date, 'chat', 60)`,
      [ACCOUNT_A]
    );
    assert.equal((await consume(ACCOUNT_A, 'tts')).rows[0].ok, true);
  });
});

describe('UTC day boundary', () => {
  it('yesterday’s (UTC) usage at the limit does not block today', async () => {
    await db.query(
      `insert into public.ai_daily_usage (account_id, usage_date, kind, count)
         values ($1, (now() at time zone 'utc')::date - 1, 'chat', 60)`,
      [ACCOUNT_A]
    );
    assert.equal((await consume(ACCOUNT_A, 'chat')).rows[0].ok, true);
    assert.equal(await countFor(ACCOUNT_A, 'chat'), 1);
  });

  for (const zone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
    it(`counts against the UTC date even when the session time zone is ${zone}`, async () => {
      await db.exec(`set timezone = '${zone}'`);
      await consume(ACCOUNT_A, 'chat');
      const rows = (await db.query(`select usage_date::text as d from public.ai_daily_usage where account_id = $1`, [ACCOUNT_A])).rows;
      const utcToday = (await db.query(`select ((now() at time zone 'utc')::date)::text as d`)).rows[0].d;
      assert.deepEqual(rows.map((r) => r.d), [utcToday]);
    });
  }
});

describe('who can call it', () => {
  it('a caller with no user identity is refused (not_authenticated)', async () => {
    const r = await consume(null, 'chat');
    assert.match(r.error?.message ?? '', /not_authenticated/);
  });

  it('the anon role cannot execute it at all', async () => {
    assert.ok(isDenied(await as(db, 'anon', null, `select public.consume_ai_quota('chat')`)));
  });

  it('clients cannot write the counter table directly', async () => {
    const r = await as(
      db,
      'authenticated',
      ACCOUNT_A,
      `update public.ai_daily_usage set count = 0 where account_id = $1`,
      [ACCOUNT_A]
    );
    // No update policy: either refused outright or nothing visible to change.
    assert.ok(r.error !== null || r.rows.length === 0);
    await db.query(
      `insert into public.ai_daily_usage (account_id, usage_date, kind, count) values ($1, (now() at time zone 'utc')::date, 'stt', 150)`,
      [ACCOUNT_A]
    );
    await as(db, 'authenticated', ACCOUNT_A, `update public.ai_daily_usage set count = 0 where account_id = $1`, [ACCOUNT_A]);
    assert.equal(await countFor(ACCOUNT_A, 'stt'), 150);
  });
});
