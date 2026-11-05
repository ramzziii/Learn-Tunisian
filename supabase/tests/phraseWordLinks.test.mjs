// "Words used" links between a phrase and the words in it
// (0027_phrase_word_links.sql), on the whole real schema:
// - signed-in learners can read links; only admins can change them, and only
//   through set_phrase_word_links (one atomic save of a phrase's whole list);
// - a word is linked at most once per phrase, never to itself;
// - deleting the phrase or the word removes its links;
// - guests see links only through guest_preview_phrase_word_links: phrases in
//   the preview, linked words approved — nothing else.
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { as, fullSchemaDb, isDenied } from './harness.mjs';

const ADMIN = 'aaaaaaaa-0000-0000-0000-000000000001';
const LEARNER = 'bbbbbbbb-0000-0000-0000-000000000002';
const UNIT = 'cccccccc-0000-0000-0000-000000000001';
const PB = 'cccccccc-0000-0000-0000-000000000002';

async function seeded() {
  const db = await fullSchemaDb();
  await db.exec(`
    insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com'), ('${LEARNER}', 'learner@example.com');
    update public.accounts set is_admin = true where id = '${ADMIN}';
    insert into public.units (id, name, is_guest_preview) values ('${UNIT}', 'Home', true);
    insert into public.units (id, name, is_curriculum, is_guest_preview) values ('${PB}', 'Phrases', false, true);
    insert into public.lessons (unit_id, lesson_number, is_guest_preview) values ('${UNIT}', 1, true), ('${PB}', 1, true);
    insert into public.word_groups (id, unit_id, lesson_number, english_meaning, content_status, is_guest_preview) values
      ('door', '${UNIT}', 1, 'Door', 'approved', true),
      ('close', '${UNIT}', 1, 'I close', 'approved', true),
      ('please', '${UNIT}', 1, 'Please', 'draft', true),
      ('pb_close_door', '${PB}', 1, 'Close the door please', 'approved', true);
    insert into public.word_variants (word_group_id, variant_label, word_arabic, transliteration, content_status) values
      ('door', 'primary', 'باب', 'beb', 'approved'),
      ('close', 'primary', 'نسكّر', 'nsakker', 'approved'),
      ('please', 'primary', 'يعيشك', 'ya3ichek', 'draft'),
      ('pb_close_door', 'primary', 'سكّر الباب يعيشك', 'sakker el beb ya3ichek', 'approved');
  `);
  return db;
}

const LINKS = JSON.stringify([
  { word_id: 'close', shown_arabic: 'سكّر', shown_latin: 'sakker' },
  { word_id: 'door', shown_arabic: 'الباب', shown_latin: 'el beb' },
  { word_id: 'please', shown_arabic: 'يعيشك', shown_latin: 'ya3ichek' },
]);
const save = (db, role, user, links = LINKS) =>
  as(db, role, user, `select public.set_phrase_word_links('pb_close_door', $1::jsonb)`, [links]);
const linksOf = async (db) =>
  (await db.query(`select word_id, position, shown_latin from public.phrase_word_links where phrase_id = 'pb_close_door' order by position`)).rows;

describe('phrase word links', () => {
  let db;
  beforeEach(async () => {
    db = await seeded();
  });

  it('an admin saves the whole list at once, in the given order', async () => {
    const r = await save(db, 'authenticated', ADMIN);
    assert.equal(r.error, null, r.error?.message);
    assert.deepEqual(await linksOf(db), [
      { word_id: 'close', position: 0, shown_latin: 'sakker' },
      { word_id: 'door', position: 1, shown_latin: 'el beb' },
      { word_id: 'please', position: 2, shown_latin: 'ya3ichek' },
    ]);
  });

  it('saving again replaces the list (reorder, untick)', async () => {
    await save(db, 'authenticated', ADMIN);
    await save(db, 'authenticated', ADMIN, JSON.stringify([{ word_id: 'door', shown_arabic: 'الباب', shown_latin: 'el beb' }]));
    assert.deepEqual(await linksOf(db), [{ word_id: 'door', position: 0, shown_latin: 'el beb' }]);
  });

  it('learners can read links but never change them', async () => {
    await save(db, 'authenticated', ADMIN);
    assert.equal((await as(db, 'authenticated', LEARNER, `select * from public.phrase_word_links`)).rows.length, 3);
    assert.ok(isDenied(await save(db, 'authenticated', LEARNER)));
    assert.ok(isDenied(await as(db, 'authenticated', LEARNER, `delete from public.phrase_word_links`)));
    assert.ok(isDenied(await as(db, 'authenticated', LEARNER,
      `insert into public.phrase_word_links (phrase_id, word_id, position, shown_arabic, shown_latin) values ('pb_close_door', 'door', 5, 'x', 'x')`)));
    assert.ok(isDenied(await save(db, 'anon', null)));
    assert.equal((await linksOf(db)).length, 3);
  });

  it('even admins write only through the save function', async () => {
    assert.ok(isDenied(await as(db, 'authenticated', ADMIN,
      `insert into public.phrase_word_links (phrase_id, word_id, position, shown_arabic, shown_latin) values ('pb_close_door', 'door', 0, 'x', 'x')`)));
  });

  it('refuses a word twice, a phrase linked to itself, an unknown word, or an empty shown form — and keeps the old list', async () => {
    await save(db, 'authenticated', ADMIN);
    for (const bad of [
      [{ word_id: 'door', shown_arabic: 'باب', shown_latin: 'beb' }, { word_id: 'door', shown_arabic: 'باب', shown_latin: 'beb' }],
      [{ word_id: 'pb_close_door', shown_arabic: 'سكّر', shown_latin: 'sakker' }],
      [{ word_id: 'nope', shown_arabic: 'x', shown_latin: 'x' }],
      [{ word_id: 'door', shown_arabic: '', shown_latin: '' }],
    ]) {
      const r = await save(db, 'authenticated', ADMIN, JSON.stringify(bad));
      assert.notEqual(r.error, null, JSON.stringify(bad));
    }
    assert.equal((await linksOf(db)).length, 3, 'the previous list is untouched');
  });

  it('deleting the word or the phrase removes its links', async () => {
    await save(db, 'authenticated', ADMIN);
    await db.exec(`delete from public.word_groups where id = 'door'`);
    assert.deepEqual((await linksOf(db)).map((l) => l.word_id), ['close', 'please']);
    await db.exec(`delete from public.word_groups where id = 'pb_close_door'`);
    assert.equal((await db.query(`select count(*)::int as n from public.phrase_word_links`)).rows[0].n, 0);
  });

  it('guests: the preview view shows links to approved words only, and nothing to write', async () => {
    await save(db, 'authenticated', ADMIN);
    const rows = (await as(db, 'anon', null, `select word_id, position, shown_arabic, shown_latin from public.guest_preview_phrase_word_links order by position`)).rows;
    assert.deepEqual(rows.map((r) => r.word_id), ['close', 'door']);
    assert.ok(isDenied(await as(db, 'anon', null, `select * from public.phrase_word_links`)));
  });

  it('guests: nothing for a phrase outside the preview', async () => {
    await save(db, 'authenticated', ADMIN);
    await db.exec(`update public.word_groups set is_guest_preview = false where id = 'pb_close_door'`);
    assert.equal((await as(db, 'anon', null, `select * from public.guest_preview_phrase_word_links`)).rows.length, 0);
  });
});
