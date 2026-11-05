// Bulk audio and the recording sheet:
// - files named <word_group_id>__<variant_label>.mp3 (or .m4a) match forms
//   exactly; missing, extra (no such form) and misnamed files are reported;
// - only forms whose text is approved take a recording; one already
//   recorded natively is kept unless --replace;
// - uploads are unchanged bytes at a new path, then audio_path + native
//   voice; text review (native_verified) is never touched; old files stay;
// - nothing is uploaded or written without --execute;
// - the recording sheet lists approved forms without native audio, in order.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyAudio, matchAudioFiles } from '../lib/content/audio.mjs';
import { exportRecordingListCommand, uploadAudioCommand } from '../lib/content/commands.mjs';
import { loadSnapshot } from '../lib/content/db.mjs';
import { buildRecordingList } from '../lib/content/recordingList.mjs';
import { memoryDb } from './memoryDb.mjs';

const v = (id, group, label, extra = {}) => ({
  id, word_group_id: group, variant_label: label, word_arabic: 'كلمة', transliteration: 'kelma', audio_path: null, sort_order: 0,
  content_status: 'approved', native_verified: true, is_native_voice: false, approved_at: null, ...extra,
});
const DB = {
  units: [
    { id: 'u2', name: 'Food', sort_order: 2, is_curriculum: true },
    { id: 'u1', name: 'Greetings', sort_order: 1, is_curriculum: true },
  ],
  lessons: [],
  word_groups: [
    { id: 'hello', unit_id: 'u1', lesson_number: 9, english_meaning: 'Hello', sort_order: 1, content_status: 'approved' },
    { id: 'welcome', unit_id: 'u1', lesson_number: 9, english_meaning: 'Welcome', sort_order: 2, content_status: 'approved' },
    { id: 'bread', unit_id: 'u2', lesson_number: 6, english_meaning: 'Bread', sort_order: 1, content_status: 'approved' },
    { id: 'yes', unit_id: 'u1', lesson_number: 10, english_meaning: 'Yes', sort_order: 1, content_status: 'draft' },
  ],
  word_variants: [
    v('v-hello', 'hello', 'primary', { audio_path: 'greetings/hello.m4a' }), // computer voice
    v('v-welcome-f', 'welcome', 'feminine'),
    v('v-welcome-m', 'welcome', 'masculine'),
    v('v-bread', 'bread', 'primary', { audio_path: 'bread/native.mp3', is_native_voice: true }),
    v('v-yes', 'yes', 'primary', { content_status: 'draft', native_verified: false }),
  ],
};
const snapshot = () => loadSnapshot(memoryDb(DB));

describe('matching files', () => {
  it('exact names match their form; mp3 and m4a both work', async () => {
    const r = matchAudioFiles(['hello__primary.mp3', 'welcome__masculine.m4a'], await snapshot());
    assert.deepEqual(r.matches.map((m) => [m.file, m.variant.id, m.ext]), [['hello__primary.mp3', 'v-hello', 'mp3'], ['welcome__masculine.m4a', 'v-welcome-m', 'm4a']]);
  });

  it('misnamed files are reported with a hint, never guessed', async () => {
    const r = matchAudioFiles(['Hello__primary.MP3', 'hello-primary.mp3', 'hello__primary.wav', 'notes.txt', '.DS_Store'], await snapshot());
    assert.deepEqual(r.misnamed.map((m) => [m.file, m.hint]), [
      ['Hello__primary.MP3', 'use lowercase'],
      ['hello-primary.mp3', 'expected <word_group_id>__<variant_label>.mp3'],
      ['hello__primary.wav', 'expected <word_group_id>__<variant_label>.mp3'],
      ['notes.txt', 'expected <word_group_id>__<variant_label>.mp3'],
    ]);
    assert.equal(r.matches.length, 0);
  });

  it('extra files (no such word or form) are reported', async () => {
    const r = matchAudioFiles(['goodbye__primary.mp3', 'hello__feminine.mp3'], await snapshot());
    assert.deepEqual(r.unknown.map((x) => x.file), ['goodbye__primary.mp3', 'hello__feminine.mp3']);
  });

  it('forms not yet approved are refused (record after review); native ones are kept unless --replace', async () => {
    const r = matchAudioFiles(['yes__primary.mp3', 'bread__primary.mp3'], await snapshot());
    assert.deepEqual(r.notApproved.map((x) => [x.file, x.status]), [['yes__primary.mp3', 'draft']]);
    assert.deepEqual(r.alreadyNative.map((x) => x.file), ['bread__primary.mp3']);
    assert.equal(matchAudioFiles(['bread__primary.mp3'], await snapshot(), { replace: true }).matches.length, 1);
  });

  it('the same form twice (mp3 and m4a) is reported and neither is uploaded', async () => {
    const r = matchAudioFiles(['hello__primary.m4a', 'hello__primary.mp3'], await snapshot());
    assert.equal(r.duplicates.length, 1);
    assert.equal(r.matches.length, 0);
  });

  it('missing: approved forms still without a native recording afterwards', async () => {
    const r = matchAudioFiles(['hello__primary.mp3'], await snapshot());
    assert.deepEqual(r.stillMissing, ['welcome__masculine.mp3', 'welcome__feminine.mp3']);
  });
});

describe('uploading', () => {
  it('unchanged bytes at a new path, then audio_path + native voice; text verification untouched; old file kept', async () => {
    const db = memoryDb(DB);
    const { matches } = matchAudioFiles(['hello__primary.mp3'], await loadSnapshot(db));
    const done = await applyAudio(db, matches, async () => Buffer.from('ID3-audio-bytes'), { stamp: 1700000000000, speakerName: 'Speaker' });
    assert.deepEqual(db.uploads, [{ bucket: 'audio', path: 'hello/hello__primary-1700000000000.mp3', size: 15, contentType: 'audio/mpeg' }]);
    const row = db.tables.word_variants.find((x) => x.id === 'v-hello');
    assert.deepEqual([row.audio_path, row.is_native_voice, row.speaker_name, row.native_verified], ['hello/hello__primary-1700000000000.mp3', true, 'Speaker', true]);
    assert.deepEqual(done.map((d) => d.previous), ['greetings/hello.m4a']);
    assert.ok(!db.writes.some((w) => w.op === 'delete'));
  });

  const fakeFs = (names) => ({
    readdir: async () => names,
    stat: async () => ({ isFile: () => true }),
    readFile: async () => Buffer.from('audio'),
  });

  it('dry run by default: nothing uploaded or written', async () => {
    const db = memoryDb(DB);
    const out = [];
    await uploadAudioCommand({ folder: 'rec', db, log: (s) => out.push(s), fs: fakeFs(['hello__primary.mp3']) });
    assert.deepEqual(db.writes, []);
    assert.match(out.join('\n'), /Ready to upload: 1/);
    assert.match(out.join('\n'), /Dry run: nothing was written/);
  });

  it('with execute: uploads and updates only the matched forms', async () => {
    const db = memoryDb(DB);
    await uploadAudioCommand({ folder: 'rec', db, execute: true, log: () => {}, fs: fakeFs(['hello__primary.mp3', 'yes__primary.mp3', 'oops.mp3']) });
    assert.deepEqual(db.uploads.map((u) => u.path.split('-')[0]), ['hello/hello__primary']);
    assert.deepEqual(db.writes.filter((w) => w.op === 'update').map((w) => w.match.id), ['v-hello']);
  });
});

describe('recording sheet', () => {
  it('approved forms without native audio, in unit / lesson / word / form order, with the file name to use', async () => {
    const { rows, awaitingReview } = buildRecordingList(await snapshot());
    assert.deepEqual(rows.map((r) => [r.order, r.word_group_id, r.variant_label, r.file_name]), [
      ['1', 'hello', 'primary', 'hello__primary.mp3'],
      ['2', 'welcome', 'masculine', 'welcome__masculine.mp3'],
      ['3', 'welcome', 'feminine', 'welcome__feminine.mp3'],
    ]);
    assert.equal(awaitingReview, 1);
  });

  it('the command never writes to the database', async () => {
    const db = memoryDb(DB);
    await exportRecordingListCommand({ db, log: () => {} });
    assert.deepEqual(db.writes, []);
  });
});
