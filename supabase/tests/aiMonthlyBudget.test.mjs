// The project-wide monthly AI budget (0021_ai_monthly_budget.sql), run for
// real: atomic reservations that count logged spend AND outstanding
// reservations, reconciliation into ai_usage_log, safe release vs.
// ambiguous handling, UTC calendar months, and that none of it can be
// called or forged by app clients.
//
// PGlite is a single connection, so statements here run one at a time: the
// tests show that reservations which together exceed the budget are not all
// granted, but they cannot show two real sessions racing. The function takes
// a per-month advisory lock for that — see docs/cost-controls.md for how to
// verify it against a real database.
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { ACCOUNT_A, ACCOUNT_B, PROFILE_A, as, freshDb, isDenied } from './harness.mjs';

const MIGRATIONS = ['0018_ai_quota_and_account_email.sql', '0021_ai_monthly_budget.sql'];
const BUDGET = 10;
let db;

const svc = (sql, params) => as(db, 'service_role', null, sql, params);
const reserve = async (amount, { account = ACCOUNT_A, callType = 'chat', model = 'gpt-4o-mini', budget = BUDGET } = {}) => {
  const r = await svc('select public.reserve_ai_budget($1, $2, $3, $4, $5) as id', [account, callType, model, amount, budget]);
  if (r.error) throw r.error;
  return r.rows[0].id;
};
const reconcile = (id, cost, extra = {}) =>
  svc(
    `select public.reconcile_ai_budget($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as log_id`,
    [
      id,
      extra.profileId ?? null,
      extra.promptTokens ?? null,
      extra.completionTokens ?? null,
      extra.totalTokens ?? null,
      extra.inputCharacters ?? null,
      extra.audioSeconds ?? null,
      cost,
      extra.usageEstimated ?? false,
      JSON.stringify(extra.pricing ?? { unit: 'test' }),
    ]
  );
const status = async (id) => (await db.query(`select status from public.ai_budget_reservations where id = $1`, [id])).rows[0]?.status;
const thisMonth = async () => (await db.query(`select public.ai_budget_month(now())::text as m`)).rows[0].m;

beforeEach(async () => {
  db = await freshDb(MIGRATIONS);
});

describe('reserving against the monthly budget', () => {
  it('below the budget: granted, held as an outstanding reservation in this UTC month', async () => {
    const id = await reserve(1.5);
    assert.ok(id);
    const row = (await db.query(`select status, reserved_usd::float as usd, budget_month::text as m, account_id from public.ai_budget_reservations`)).rows[0];
    assert.deepEqual(row, { status: 'reserved', usd: 1.5, m: await thisMonth(), account_id: ACCOUNT_A });
  });

  it('exactly reaching the budget is allowed; anything beyond it is refused', async () => {
    assert.ok(await reserve(9.99));
    assert.ok(await reserve(0.01), 'reaching exactly 10.00');
    assert.equal(await reserve(0.000001), null, 'over by a millionth of a dollar');
  });

  it('a single call larger than the whole budget is refused', async () => {
    assert.equal(await reserve(10.000001), null);
  });

  it('outstanding (not yet reconciled) reservations count against what is left', async () => {
    assert.ok(await reserve(6));
    assert.equal(await reserve(5), null);
    assert.ok(await reserve(4));
  });

  it('logged spend counts against what is left', async () => {
    const id = await reserve(8);
    assert.equal((await reconcile(id, 8)).error, null);
    assert.equal(await reserve(2.5), null);
    assert.ok(await reserve(2));
  });

  it('a reconciled call counts once, at its actual cost — not also at its reservation', async () => {
    const id = await reserve(9); // conservative upper bound
    await reconcile(id, 1); // what it actually cost
    assert.ok(await reserve(9), 'only 1.00 is spent, 9.00 is free again');
  });

  it('requests whose reservations together exceed the budget are not all granted', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => reserve(3)));
    const granted = results.filter(Boolean);
    assert.equal(granted.length, 3, `granted ${granted.length} of 6 reservations of 3.00 against 10.00`);
    const held = (await db.query(`select sum(reserved_usd)::float as s from public.ai_budget_reservations where status = 'reserved'`)).rows[0].s;
    assert.ok(held <= BUDGET);
  });

  it('the budget is project-wide: every account draws from the same pool', async () => {
    assert.ok(await reserve(7, { account: ACCOUNT_A }));
    assert.equal(await reserve(4, { account: ACCOUNT_B }), null);
  });

  it('covers every paid call type, and rejects unknown ones', async () => {
    for (const callType of ['chat', 'embedding', 'tts', 'stt']) {
      assert.ok(await reserve(0.01, { callType }), callType);
    }
    await assert.rejects(reserve(0.01, { callType: 'image' }), /invalid_call_type/);
  });

  it('rejects negative amounts or a missing budget instead of guessing', async () => {
    await assert.rejects(reserve(-1), /invalid_budget_amount/);
    await assert.rejects(reserve(1, { budget: null }), /invalid_budget_amount/);
  });

  it('usage logged before cost tracking (no cost, no budget month) does not count', async () => {
    assert.ok(await reserve(10));
  });
});

describe('UTC calendar months', () => {
  it('the month boundary is UTC, whatever the session time zone', async () => {
    await db.exec(`set timezone = 'Pacific/Kiritimati'`); // UTC+14
    const m = async (ts) => (await db.query(`select public.ai_budget_month($1::timestamptz)::text as m`, [ts])).rows[0].m;
    assert.equal(await m('2026-01-31T23:59:59.999Z'), '2026-01-01');
    assert.equal(await m('2026-02-01T00:00:00Z'), '2026-02-01');
    assert.equal(await m('2026-12-31T23:59:59Z'), '2026-12-01');
    assert.equal(await m('2027-01-01T00:00:00Z'), '2027-01-01');
    await db.exec(`set timezone = 'Pacific/Pago_Pago'`); // UTC-11
    assert.equal(await m('2026-02-01T00:00:00Z'), '2026-02-01');
  });

  it('last month’s spend and still-outstanding reservations do not count this month', async () => {
    await db.query(
      `insert into public.ai_budget_reservations (account_id, call_type, model, reserved_usd, status, budget_month)
         values ($1, 'chat', 'gpt-4o-mini', 10, 'reserved', (public.ai_budget_month(now()) - interval '1 month')::date),
                ($1, 'chat', 'gpt-4o-mini', 10, 'ambiguous', (public.ai_budget_month(now()) - interval '1 month')::date)`,
      [ACCOUNT_A]
    );
    await db.query(
      `insert into public.ai_usage_log (account_id, call_type, model, estimated_cost_usd, budget_month)
         values ($1, 'chat', 'gpt-4o-mini', 10, (public.ai_budget_month(now()) - interval '1 month')::date)`,
      [ACCOUNT_A]
    );
    assert.ok(await reserve(10));
  });

  it('a reservation reconciled after the month rolls over stays in the month it was reserved', async () => {
    const last = (await db.query(`select (public.ai_budget_month(now()) - interval '1 month')::date::text as m`)).rows[0].m;
    const id = (
      await db.query(
        `insert into public.ai_budget_reservations (account_id, call_type, model, reserved_usd, status, budget_month)
           values ($1, 'chat', 'gpt-4o-mini', 5, 'reserved', $2) returning id`,
        [ACCOUNT_A, last]
      )
    ).rows[0].id;
    await reconcile(id, 5);
    const log = (await db.query(`select budget_month::text as m from public.ai_usage_log where reservation_id = $1`, [id])).rows[0];
    assert.equal(log.m, last);
    assert.ok(await reserve(10), 'this month is untouched');
  });
});

describe('settling a reservation', () => {
  it('reconcile writes one usage row with the account, model, units, cost and pricing, and closes the reservation', async () => {
    const id = await reserve(0.5, { callType: 'chat' });
    const r = await reconcile(id, 0.000375, {
      profileId: PROFILE_A,
      promptTokens: 1500,
      completionTokens: 250,
      totalTokens: 1750,
      pricing: { model: 'gpt-4o-mini', input_per_1m_tokens: 0.15, output_per_1m_tokens: 0.6 },
    });
    assert.equal(r.error, null);
    const log = (
      await db.query(
        `select account_id, profile_id, call_type, model, prompt_tokens, completion_tokens, total_tokens,
                estimated_cost_usd::float as cost, usage_estimated, pricing, reservation_id
           from public.ai_usage_log where id = $1`,
        [r.rows[0].log_id]
      )
    ).rows[0];
    assert.deepEqual(log, {
      account_id: ACCOUNT_A,
      profile_id: PROFILE_A,
      call_type: 'chat',
      model: 'gpt-4o-mini',
      prompt_tokens: 1500,
      completion_tokens: 250,
      total_tokens: 1750,
      cost: 0.000375,
      usage_estimated: false,
      pricing: { model: 'gpt-4o-mini', input_per_1m_tokens: 0.15, output_per_1m_tokens: 0.6 },
      reservation_id: id,
    });
    assert.equal(await status(id), 'reconciled');
  });

  it('records TTS characters and STT seconds', async () => {
    const tts = await reserve(0.01, { callType: 'tts', model: 'tts-1' });
    await reconcile(tts, 0.0006, { inputCharacters: 40 });
    const stt = await reserve(0.01, { callType: 'stt', model: 'whisper-1' });
    await reconcile(stt, 0.0005, { audioSeconds: 5.2 });
    const rows = (
      await db.query(
        `select call_type, model, input_characters, audio_seconds::float as secs from public.ai_usage_log
           where call_type in ('tts', 'stt') order by call_type desc`
      )
    ).rows;
    assert.deepEqual(rows, [
      { call_type: 'tts', model: 'tts-1', input_characters: 40, secs: null },
      { call_type: 'stt', model: 'whisper-1', input_characters: null, secs: 5.2 },
    ]);
  });

  it('a reservation can be settled only once', async () => {
    const id = await reserve(1);
    assert.equal((await reconcile(id, 1)).error, null);
    assert.match((await reconcile(id, 1)).error?.message ?? '', /reservation_already_settled/);
    assert.match((await svc('select public.release_ai_budget($1)', [id])).error?.message ?? '', /reservation_not_releasable/);
    assert.equal((await db.query(`select count(*)::int as n from public.ai_usage_log where reservation_id = $1`, [id])).rows[0].n, 1);
  });

  it('release (no billable call happened) frees the reservation and logs nothing', async () => {
    const id = await reserve(10);
    assert.equal((await svc('select public.release_ai_budget($1)', [id])).error, null);
    assert.equal(await status(id), 'released');
    assert.ok(await reserve(10));
  });

  it('an ambiguous call keeps its reservation counted until it is reconciled', async () => {
    const id = await reserve(10);
    assert.equal((await svc(`select public.mark_ai_budget_ambiguous($1, 'timeout')`, [id])).error, null);
    assert.equal(await status(id), 'ambiguous');
    assert.equal(await reserve(0.01), null, 'still held');
    // An ambiguous reservation can't be released by the app code path…
    assert.match((await svc('select public.release_ai_budget($1)', [id])).error?.message ?? '', /reservation_not_releasable/);
    // …but can be reconciled once the real outcome is known.
    assert.equal((await reconcile(id, 0.2, { usageEstimated: true })).error, null);
    assert.ok(await reserve(9.8));
  });

  it('settling an unknown reservation is an error, not a silent no-op', async () => {
    const unknown = '20000000-0000-0000-0000-000000000000';
    assert.match((await reconcile(unknown, 1)).error?.message ?? '', /reservation_not_found/);
    assert.match((await svc('select public.release_ai_budget($1)', [unknown])).error?.message ?? '', /reservation_not_releasable/);
    assert.match(
      (await svc(`select public.mark_ai_budget_ambiguous($1, 'x')`, [unknown])).error?.message ?? '',
      /reservation_not_reserved/
    );
  });
});

describe('clients cannot reserve, settle or forge usage', () => {
  for (const role of ['authenticated', 'anon']) {
    it(`${role}: cannot execute any budget function`, async () => {
      const uid = role === 'authenticated' ? ACCOUNT_A : null;
      assert.ok(isDenied(await as(db, role, uid, `select public.reserve_ai_budget($1, 'chat', 'gpt-4o-mini', 0, 1000)`, [ACCOUNT_A])));
      assert.ok(isDenied(await as(db, role, uid, `select public.release_ai_budget(gen_random_uuid())`)));
      assert.ok(isDenied(await as(db, role, uid, `select public.mark_ai_budget_ambiguous(gen_random_uuid(), 'x')`)));
      assert.ok(
        isDenied(
          await as(db, role, uid, `select public.reconcile_ai_budget(gen_random_uuid(), null, null, null, null, null, null, 0, false, '{}'::jsonb)`)
        )
      );
    });

    it(`${role}: cannot read or write reservations`, async () => {
      const uid = role === 'authenticated' ? ACCOUNT_A : null;
      assert.ok(isDenied(await as(db, role, uid, `select * from public.ai_budget_reservations`)));
      assert.ok(
        isDenied(
          await as(db, role, uid, `insert into public.ai_budget_reservations (call_type, model, reserved_usd, status, budget_month) values ('chat', 'm', 0, 'released', current_date)`)
        )
      );
    });
  }

  it('a signed-in user cannot insert, change or delete usage rows', async () => {
    assert.ok(
      isDenied(
        await as(db, 'authenticated', ACCOUNT_A, `insert into public.ai_usage_log (profile_id, call_type, model) values ($1, 'chat', 'gpt-4o-mini')`, [PROFILE_A])
      )
    );
    assert.ok(isDenied(await as(db, 'authenticated', ACCOUNT_A, `update public.ai_usage_log set estimated_cost_usd = 0`)));
    assert.ok(isDenied(await as(db, 'authenticated', ACCOUNT_A, `delete from public.ai_usage_log`)));
  });

  it('a signed-in user can still read their own account’s usage rows, and only those', async () => {
    const a = await reserve(0.01, { account: ACCOUNT_A, callType: 'tts', model: 'tts-1' });
    await reconcile(a, 0.0001, { inputCharacters: 5 });
    const b = await reserve(0.01, { account: ACCOUNT_B, callType: 'tts', model: 'tts-1' });
    await reconcile(b, 0.0001, { inputCharacters: 5 });
    const mine = await as(db, 'authenticated', ACCOUNT_A, `select account_id from public.ai_usage_log where call_type = 'tts'`);
    assert.deepEqual(mine.rows.map((r) => r.account_id), [ACCOUNT_A]);
  });

  it('the service role can do the whole flow', async () => {
    const id = await reserve(1);
    assert.equal((await reconcile(id, 1)).error, null);
  });
});
