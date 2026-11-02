// Native review history and import notes (0026_content_review_log.sql), on
// the whole real schema:
// - learners (and signed-out visitors) can't read either table; admins can
//   read; nobody writes through the API (only the service-role scripts);
// - review history survives deleting the word, its group or its unit (the
//   form link is cleared, the reviewed text is kept), so a delete or a seed
//   re-run can't silently erase the record of a native approval;
// - import notes go with their form.
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { as, fullSchemaDb, isDenied } from './harness.mjs';

const ADMIN = 'aaaaaaaa-0000-0000-0000-000000000001';
const LEARNER = 'bbbbbbbb-0000-0000-0000-000000000002';
const UNIT = 'cccccccc-0000-0000-0000-000000000001';
const VARIANT = 'dddddddd-0000-0000-0000-000000000001';

async function seeded() {
  const db = await fullSchemaDb();
  await db.exec(`
    insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com'), ('${LEARNER}', 'learner@example.com');
    update public.accounts set is_admin = true where id = '${ADMIN}';
    insert into public.reviewers (user_id) values ('${ADMIN}');
    insert into public.units (id, name) values ('${UNIT}', 'Greetings');
    insert into public.lessons (unit_id, lesson_number) values ('${UNIT}', 9);
    insert into public.word_groups (id, unit_id, lesson_number, english_meaning) values ('hello', '${UNIT}', 9, 'Hello');
    insert into public.word_variants (id, word_group_id, variant_label, word_arabic, transliteration)
      values ('${VARIANT}', 'hello', 'primary', 'أسلامة', 'aslema');
    insert into public.content_review_events (word_variant_id, word_group_id, variant_label, verdict, reviewer_account_id,
        reviewer_name, reviewed_arabic, reviewed_transliteration)
      values ('${VARIANT}', 'hello', 'primary', 'ok', '${ADMIN}', 'Reviewer', 'أسلامة', 'aslema');
    insert into public.content_source_notes (word_variant_id, note) values ('${VARIANT}', '[HIGH]');
  `);
  return db;
}

describe('content review log', () => {
  let db;
  beforeEach(async () => {
    db = await seeded();
  });

  for (const table of ['content_review_events', 'content_source_notes']) {
    it(`${table}: learners see nothing, signed-out visitors are refused`, async () => {
      assert.equal((await as(db, 'authenticated', LEARNER, `select * from public.${table}`)).rows.length, 0);
      assert.ok(isDenied(await as(db, 'anon', null, `select * from public.${table}`)));
    });

    it(`${table}: admins can read but not write through the API`, async () => {
      assert.equal((await as(db, 'authenticated', ADMIN, `select * from public.${table}`)).rows.length, 1);
      assert.ok(isDenied(await as(db, 'authenticated', ADMIN, `delete from public.${table}`)));
      assert.ok(isDenied(await as(db, 'authenticated', LEARNER, `delete from public.${table}`)));
    });
  }

  it('a verdict must be ok, fix or reject', async () => {
    await assert.rejects(
      db.query(`insert into public.content_review_events (word_group_id, variant_label, verdict, reviewed_arabic, reviewed_transliteration)
                values ('hello', 'primary', 'maybe', 'x', 'x')`)
    );
  });

  it('deleting the unit keeps the review history (form link cleared) and removes the import note', async () => {
    await db.exec(`delete from public.units where id = '${UNIT}'`);
    const rows = (await db.query(`select word_variant_id, word_group_id, variant_label, reviewed_arabic from public.content_review_events`)).rows;
    assert.deepEqual(rows, [{ word_variant_id: null, word_group_id: 'hello', variant_label: 'primary', reviewed_arabic: 'أسلامة' }]);
    assert.equal((await db.query(`select * from public.content_source_notes`)).rows.length, 0);
  });

  it('deleting just the form keeps the history too', async () => {
    // (A group's only primary can't be deleted, so this uses an also-heard form.)
    const ALSO = 'dddddddd-0000-0000-0000-000000000002';
    await db.exec(`
      insert into public.word_variants (id, word_group_id, variant_label, word_arabic, transliteration)
        values ('${ALSO}', 'hello', 'also_heard', 'أهلا', 'ahla');
      insert into public.content_review_events (word_variant_id, word_group_id, variant_label, verdict, reviewed_arabic, reviewed_transliteration)
        values ('${ALSO}', 'hello', 'also_heard', 'reject', 'أهلا', 'ahla');
      delete from public.word_variants where id = '${ALSO}';
    `);
    const rows = (await db.query(`select word_variant_id, verdict from public.content_review_events where variant_label = 'also_heard'`)).rows;
    assert.deepEqual(rows, [{ word_variant_id: null, verdict: 'reject' }]);
  });
});
