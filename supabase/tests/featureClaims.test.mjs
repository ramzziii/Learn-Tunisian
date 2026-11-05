// Free sample items (0025_feature_item_claims.sql), against the whole real
// schema: which counted items an account has used, so the free total (5 per
// feature, guest use included) holds across restarts, reinstalls and devices.
// - claim_feature_item: 5 per feature, an item already used is free, Premium
//   (is_premium or admin) is never capped or recorded;
// - import_guest_feature_items: at most 2 per feature, idempotent, counts
//   toward the 5;
// - no direct writes; each account reads only its own; nothing for anon;
// - deleted with the account; rollback is exact.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, describe, it } from 'node:test';

import { as, fullSchemaDb, isDenied } from './harness.mjs';

const FREE = 'aaaaaaaa-0000-0000-0000-0000000000f1';
const FREE2 = 'aaaaaaaa-0000-0000-0000-0000000000f2';
const PREMIUM = 'aaaaaaaa-0000-0000-0000-0000000000a1';
const ADMIN = 'aaaaaaaa-0000-0000-0000-0000000000ad';

async function seed(db) {
  await db.exec(`
    insert into auth.users (id, email) values
      ('${FREE}', 'f@example.com'), ('${FREE2}', 'f2@example.com'),
      ('${PREMIUM}', 'p@example.com'), ('${ADMIN}', 'ad@example.com');
    update public.accounts set is_admin = true where id = '${ADMIN}';
    insert into public.profiles (account_id, name, native_language, starting_proficiency, track, date_of_birth, country)
      values ('${PREMIUM}', 'P', 'English', 'none', 'adult', '1990-01-01', 'Tunisia');
    -- is_premium can't be self-granted; set it as the service would.
    update public.profiles set is_premium = true where account_id = '${PREMIUM}';
  `);
}

const claim = (db, uid, feature, key) => as(db, 'authenticated', uid, `select public.claim_feature_item($1, $2) ok`, [feature, key]);
const ok = (r) => {
  assert.ok(!r.error, r.error?.message);
  return r.rows[0].ok;
};
const count = async (db, uid, feature) =>
  (await db.query(`select count(*)::int n from public.feature_item_claims where account_id = $1 and feature = $2`, [uid, feature])).rows[0].n;

describe('feature_item_claims', () => {
  let db;
  before(async () => {
    db = await fullSchemaDb();
    await seed(db);
  });

  it('a free account can use 5 items per feature, then no more', async () => {
    for (const key of ['l1', 'l2', 'l3', 'l4', 'l5']) assert.equal(ok(await claim(db, FREE, 'lesson', key)), true);
    assert.equal(ok(await claim(db, FREE, 'lesson', 'l6')), false);
    assert.equal(await count(db, FREE, 'lesson'), 5);
  });

  it('an item already used is never counted again', async () => {
    assert.equal(ok(await claim(db, FREE, 'lesson', 'l3')), true);
    assert.equal(await count(db, FREE, 'lesson'), 5);
  });

  it('features are counted separately', async () => {
    assert.equal(ok(await claim(db, FREE, 'proverb', 'p1')), true);
    assert.equal(await count(db, FREE, 'proverb'), 1);
  });

  it('Premium and admins are never capped and nothing is recorded', async () => {
    for (let i = 0; i < 8; i++) assert.equal(ok(await claim(db, PREMIUM, 'lesson', `x${i}`)), true);
    assert.equal(await count(db, PREMIUM, 'lesson'), 0);
    assert.equal(ok(await claim(db, ADMIN, 'grammar_note', 'n1')), true);
    assert.equal(await count(db, ADMIN, 'grammar_note'), 0);
  });

  it('rejects unknown features and bad keys', async () => {
    assert.ok((await claim(db, FREE2, 'talk', 'x')).error);
    assert.ok((await claim(db, FREE2, 'lesson', '')).error);
  });

  it('signed out can’t claim, import or read', async () => {
    assert.ok(isDenied(await as(db, 'anon', null, `select public.claim_feature_item('lesson', 'l1')`)));
    assert.ok(isDenied(await as(db, 'anon', null, `select public.import_guest_feature_items('[]'::jsonb)`)));
    assert.ok(isDenied(await as(db, 'anon', null, `select * from public.feature_item_claims`)));
  });

  it('each account reads only its own claims', async () => {
    const mine = await as(db, 'authenticated', FREE2, `select account_id from public.feature_item_claims`);
    assert.ok(!mine.error, mine.error?.message);
    assert.ok(mine.rows.every((r) => r.account_id === FREE2));
    const other = await as(db, 'authenticated', FREE2, `select count(*)::int n from public.feature_item_claims where account_id = '${FREE}'`);
    assert.equal(other.rows[0].n, 0);
  });

  it('no direct inserts, updates or deletes — only through the functions', async () => {
    assert.ok(isDenied(await as(db, 'authenticated', FREE2,
      `insert into public.feature_item_claims (account_id, feature, item_key) values ('${FREE2}', 'lesson', 'z')`)));
    assert.ok(isDenied(await as(db, 'authenticated', FREE, `update public.feature_item_claims set item_key = 'z'`)));
    const del = await as(db, 'authenticated', FREE, `delete from public.feature_item_claims`);
    assert.ok(isDenied(del) || del.rows?.length === 0);
    assert.equal(await count(db, FREE, 'lesson'), 5);
  });

  it('guest import: at most 2 per feature, unknown features ignored, idempotent, counts toward 5', async () => {
    const items = JSON.stringify([
      { feature: 'grammar_note', item_key: 'g1' },
      { feature: 'grammar_note', item_key: 'g2' },
      { feature: 'grammar_note', item_key: 'g3' }, // a third is ignored
      { feature: 'talk', item_key: 't1' }, // not a counted feature
      { feature: 'lesson', item_key: 'l1' },
    ]);
    const first = await as(db, 'authenticated', FREE2, `select public.import_guest_feature_items($1::jsonb) n`, [items]);
    assert.ok(!first.error, first.error?.message);
    assert.equal(first.rows[0].n, 3);
    const again = await as(db, 'authenticated', FREE2, `select public.import_guest_feature_items($1::jsonb) n`, [items]);
    assert.equal(again.rows[0].n, 0);
    assert.equal(await count(db, FREE2, 'grammar_note'), 2);
    // 2 guest + 3 more = 5, then the limit.
    for (const key of ['g4', 'g5', 'g6']) assert.equal(ok(await claim(db, FREE2, 'grammar_note', key)), true);
    assert.equal(ok(await claim(db, FREE2, 'grammar_note', 'g7')), false);
    const sources = await db.query(`select source, count(*)::int n from public.feature_item_claims where account_id = $1 and feature = 'grammar_note' group by 1 order by 1`, [FREE2]);
    assert.deepEqual(sources.rows, [{ source: 'account', n: 3 }, { source: 'guest_import', n: 2 }]);
  });

  it('guest import rejects a non-array or oversized payload', async () => {
    assert.ok((await as(db, 'authenticated', FREE2, `select public.import_guest_feature_items('{}'::jsonb)`)).error);
    const big = JSON.stringify(Array.from({ length: 51 }, (_, i) => ({ feature: 'lesson', item_key: `k${i}` })));
    assert.ok((await as(db, 'authenticated', FREE2, `select public.import_guest_feature_items($1::jsonb)`, [big])).error);
  });

  it('deleted with the account', async () => {
    await db.exec(`select public.delete_account_data('${FREE}')`);
    const left = await db.query(`select count(*)::int n from public.feature_item_claims where account_id = $1`, [FREE]);
    assert.equal(left.rows[0].n, 0);
  });
});

describe('0025 rollback', () => {
  it('removes exactly what the migration added', async () => {
    const db = await fullSchemaDb();
    await db.exec(readFileSync(join(import.meta.dirname, '..', 'rollbacks', '0025_feature_item_claims.rollback.sql'), 'utf8'));
    const t = await db.query(`select count(*)::int n from information_schema.tables where table_name = 'feature_item_claims'`);
    const f = await db.query(`select count(*)::int n from pg_proc where proname in ('claim_feature_item', 'import_guest_feature_items')`);
    assert.equal(t.rows[0].n, 0);
    assert.equal(f.rows[0].n, 0);
  });
});
