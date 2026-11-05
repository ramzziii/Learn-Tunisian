// "Words used" suggestions for a phrase (admin):
// - a match is a word whose Arabic or Latin spelling equals a word of the
//   phrase, using the search keys (diacritics ignored, kh = 5 etc.); matches
//   start ticked;
// - a changed form is only a "possible match" (never ticked): the article
//   (el / ال) in front, or the word with a letter added before or after
//   ("sakker" vs "nsakker");
// - sounds that differ are never merged: 7 ≠ h, 3 ≠ a, 9 ≠ k, 5 ≠ k, 8 ≠ g, 2 ≠ a;
// - each card shows the word as it appears in the phrase; suggestions follow
//   the phrase's order; the phrase itself and rejected words are never suggested.
import { makeGroup, makeVariant } from '@/test-utils/wordGroupFixtures';

import { suggestWordLinks } from '../suggestWordLinks';

const word = (id: string, arabic: string, latin: string, extra: { status?: string; label?: string } = {}) =>
  makeGroup(id, {
    contentStatus: (extra.status ?? 'approved') as never,
    variants: [makeVariant(id, { wordArabic: arabic, transliteration: latin, variantLabel: (extra.label ?? 'primary') as never })],
  });
const phrase = (arabic: string, latin: string) => word('pb_phrase', arabic, latin);

const summary = (s: ReturnType<typeof suggestWordLinks>) =>
  s.map((x) => `${x.wordId}:${x.kind}:${x.ticked ? 'ticked' : 'unticked'}:${x.shownArabic}/${x.shownLatin}`);

describe('suggestWordLinks', () => {
  const closeTheDoor = phrase('سكّر الباب يعيشك', 'Sakker el beb ya3ichek');

  it('exact matches (Arabic or Latin) start ticked; changed forms are possible matches, unticked; in phrase order', () => {
    const words = [
      word('please', 'يعيشك', 'ya3ichek'),
      word('door', 'باب', 'beb'),
      word('close', 'نسكّر', 'nsakker'),
    ];
    expect(summary(suggestWordLinks(closeTheDoor, words))).toEqual([
      'close:possible:unticked:سكّر/Sakker',
      'door:match:ticked:الباب/beb',
      'please:match:ticked:يعيشك/ya3ichek',
    ]);
  });

  it('diacritics and the kh / 5 spelling are the same letter', () => {
    const s = suggestWordLinks(phrase('خُبز', 'khobz'), [word('bread', 'خبز', '5obz')]);
    expect(summary(s)).toEqual(['bread:match:ticked:خُبز/khobz']);
  });

  it('a word of two or more words matches as a whole', () => {
    const s = suggestWordLinks(phrase('نحب زيت زيتون', 'nheb zit zitoun'), [word('olive_oil', 'زيت زيتون', 'zit zitoun')]);
    expect(summary(s)).toEqual(['olive_oil:match:ticked:زيت زيتون/zit zitoun']);
  });

  it('the article in front (el / ال) is a possible match only', () => {
    const s = suggestWordLinks(phrase('الباب', 'elbeb'), [word('door', 'باب', 'beb')]);
    expect(summary(s)).toEqual(['door:possible:unticked:الباب/elbeb']);
  });

  it.each([
    ['7 ≠ h', 'habib', '7abib'],
    ['3 ≠ a', 'ali', '3ali'],
    ['9 ≠ k', 'kalb', '9alb'],
    ['5 ≠ k', 'kobz', '5obz'],
    ['8 ≠ g', 'gali', '8ali'],
    ['2 ≠ a', 'amel', '2amel'],
  ])('never merges different sounds: %s', (_name, inPhrase, inWordList) => {
    expect(suggestWordLinks(phrase('كلمة', inPhrase), [word('w', 'شي', inWordList)])).toEqual([]);
  });

  it('a short word inside a longer one is not suggested (at least 3 letters)', () => {
    expect(suggestWordLinks(phrase('مع', 'm3a'), [word('with_milk', 'معاه', 'm3ah')])).toEqual([]);
  });

  it('the phrase itself, rejected and archived words are never suggested', () => {
    const words = [closeTheDoor, word('door', 'باب', 'beb', { status: 'rejected' }), word('door2', 'باب', 'beb', { status: 'archived' })];
    expect(suggestWordLinks(closeTheDoor, words)).toEqual([]);
  });

  it('any form of a word can match (e.g. its feminine form); each word is suggested once', () => {
    const tired = makeGroup('tired', {
      variants: [
        makeVariant('tired', { variantLabel: 'masculine', wordArabic: 'تعبان', transliteration: 'ta3ban' }),
        makeVariant('tired', { variantLabel: 'feminine', wordArabic: 'تعبانة', transliteration: 'ta3bana' }),
      ],
    });
    const s = suggestWordLinks(phrase('أنا تعبانة برشة', 'ena ta3bana barcha'), [tired]);
    expect(summary(s)).toEqual(['tired:match:ticked:تعبانة/ta3bana']);
  });

  it('punctuation is ignored', () => {
    const s = suggestWordLinks(phrase('أنا لاباس، يعيشك', 'Ena lebes, ya3ichek!'), [word('fine', 'لاباس', 'lebes')]);
    expect(summary(s)).toEqual(['fine:match:ticked:لاباس/lebes']);
  });
});
