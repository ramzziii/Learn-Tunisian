// Import validation: each rule fails on its own, with row numbers; the
// gendered pair rule follows the database (one primary OR a complete
// masculine + feminine pair, never both); values are never corrected.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { groupStructureProblem, spellingHints, validateImportRows } from '../lib/content/validate.mjs';

const HEADER = ['unit', 'lesson_number', 'word_group_id', 'variant_label', 'word_arabic', 'transliteration', 'english_meaning', 'audio_filename', 'notes'];
const rec = (rowNumber, values) => ({
  rowNumber,
  values: {
    unit: 'Greetings',
    lesson_number: '9',
    word_group_id: 'hello',
    variant_label: 'primary',
    word_arabic: 'عسلامة',
    transliteration: 'aslema',
    english_meaning: 'Hello',
    audio_filename: '',
    notes: '',
    ...values,
  },
});
const messages = (records, header = HEADER) => validateImportRows(header, records).errors.map((e) => `${e.rows.join(',')}: ${e.message}`);

describe('valid sheets', () => {
  it('one primary with an also-heard form, and a masculine + feminine pair, pass', () => {
    assert.deepEqual(
      messages([
        rec(2, {}),
        rec(3, { variant_label: 'also_heard', word_arabic: 'أهلا', transliteration: 'ahla' }),
        rec(4, { word_group_id: 'welcome', variant_label: 'masculine', word_arabic: 'مرحبا بيك', transliteration: 'mar7ba bik', english_meaning: 'Welcome' }),
        rec(5, { word_group_id: 'welcome', variant_label: 'feminine', word_arabic: 'مرحبا بيكي', transliteration: 'mar7ba biki', english_meaning: 'Welcome' }),
      ]),
      []
    );
  });

  it('several lessons in one unit are fine; lesson_title and french_meaning are optional', () => {
    const header = [...HEADER, 'lesson_title', 'french_meaning'];
    assert.deepEqual(messages([rec(2, { lesson_title: 'Basics' }), rec(3, { word_group_id: 'yes', lesson_number: '10', word_arabic: 'إيه', transliteration: 'iyeh', english_meaning: 'Yes', french_meaning: 'Oui' })], header), []);
  });

  it('nothing is changed: rows come back exactly as typed', () => {
    const { rows } = validateImportRows(HEADER, [rec(2, {})]);
    assert.equal(rows[0].transliteration, 'aslema');
    assert.equal(rows[0].lessonNumber, 9);
  });
});

describe('each rule', () => {
  const cases = [
    ['a required column is missing', [rec(2, {})], ['unit', 'lesson_number'], /missing column\(s\): word_group_id/],
    ['a required value is empty', [rec(2, { english_meaning: '' })], HEADER, /2: english_meaning is empty/],
    ['extra spaces', [rec(2, { transliteration: 'aslema ' })], HEADER, /2: transliteration has extra spaces/],
    ['lesson_number not a whole number', [rec(2, { lesson_number: '9a' })], HEADER, /2: lesson_number must be a whole number/],
    ['unknown variant label', [rec(2, { variant_label: 'plural' })], HEADER, /variant_label "plural" is not one of/],
    ['bad id', [rec(2, { word_group_id: 'Hello-World' })], HEADER, /word_group_id must be lowercase/],
    ['uppercase transliteration', [rec(2, { transliteration: 'Aslema' })], HEADER, /transliteration must be lowercase/],
    ['accent in transliteration', [rec(2, { transliteration: 'el khémis' })], HEADER, /transliteration must be lowercase/],
    ['apostrophe in transliteration', [rec(2, { transliteration: "lar'ba3" })], HEADER, /transliteration must be lowercase/],
    ['punctuation in transliteration', [rec(2, { transliteration: 'bi sa7?' })], HEADER, /transliteration must be lowercase/],
    ['Latin in the Arabic', [rec(2, { word_arabic: 'aslema' })], HEADER, /word_arabic contains Latin/],
    ['wrong audio file name', [rec(2, { audio_filename: 'hello.mp3' })], HEADER, /audio_filename should be hello__primary.mp3/],
    ['two primaries', [rec(2, {}), rec(3, { word_arabic: 'أهلا', transliteration: 'ahla' })], HEADER, /2,3: word group hello has 2 primary forms/],
    ['primary mixed with gendered forms', [rec(2, {}), rec(3, { variant_label: 'feminine', word_arabic: 'أهلا', transliteration: 'ahla' })], HEADER, /mixes a primary form/],
    ['masculine without feminine', [rec(2, { variant_label: 'masculine' })], HEADER, /has a masculine form without its pair/],
    ['also-heard only', [rec(2, { variant_label: 'also_heard' })], HEADER, /needs one primary form or a complete/],
    ['same Arabic twice in a group', [rec(2, {}), rec(3, { variant_label: 'also_heard' })], HEADER, /has the same Arabic text twice/],
    ['group spread over two lessons', [rec(2, {}), rec(3, { variant_label: 'also_heard', lesson_number: '10', word_arabic: 'أهلا', transliteration: 'ahla' })], HEADER, /has different lesson_number values/],
    ['one lesson number in two units', [rec(2, {}), rec(3, { unit: 'Food', word_group_id: 'bread', word_arabic: 'خبز', transliteration: 'khobz', english_meaning: 'Bread' })], HEADER, /lesson 9 is used by several units/],
  ];
  for (const [name, records, header, expected] of cases) {
    it(name, () => {
      const found = messages(records, header);
      assert.ok(found.some((m) => expected.test(m)), `expected ${expected} in ${JSON.stringify(found)}`);
    });
  }
});

describe('helpers', () => {
  it('group structure follows the database rule', () => {
    assert.equal(groupStructureProblem(['primary']), null);
    assert.equal(groupStructureProblem(['primary', 'also_heard', 'also_heard']), null);
    assert.equal(groupStructureProblem(['masculine', 'feminine']), null);
    assert.match(groupStructureProblem(['feminine']), /without its pair/);
    assert.match(groupStructureProblem([]), /needs one primary/);
  });

  it('spelling hints only point things out', () => {
    assert.deepEqual(spellingHints('نحب', 'nheb'), ['ح without 7']);
    assert.deepEqual(spellingHints('سوق', 'souk'), ['ق without 9 or g']);
    assert.deepEqual(spellingHints('نحب', 'n7eb'), []);
  });
});
