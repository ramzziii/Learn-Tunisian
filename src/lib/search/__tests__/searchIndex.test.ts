// The in-memory search index: one result per word group, ranked exact →
// starts with → contains → approved aliases → English with one typo. No typo
// tolerance for Arabic or Latin. A "matched" note only when the best match
// came from a non-primary form.
import { buildSearchIndex, searchWords } from '@/lib/search/searchIndex';
import type { VariantLabel, WordGroupWithVariants } from '@/types/models';

let seq = 0;
const form = (label: VariantLabel, transliteration: string, wordArabic = 'كلمة') => ({
  id: `v${++seq}`,
  wordGroupId: '',
  variantLabel: label,
  wordArabic,
  transliteration,
  audioPath: null,
  contentStatus: 'approved',
  sortOrder: seq,
});
const word = (id: string, englishMeaning: string, variants: ReturnType<typeof form>[]) =>
  ({ id, unitId: 'u1', lessonNumber: 1, englishMeaning, contentStatus: 'approved', sortOrder: 0, variants }) as unknown as WordGroupWithVariants;

const ids = (results: { group: { id: string } }[]) => results.map((r) => r.group.id);

const WORDS = [
  word('bread', 'bread', [form('primary', '5obz', 'خبز')]),
  word('beloved', 'my love', [form('primary', '7abib', 'حبيب')]),
  word('habibi', 'darling', [form('primary', 'habibi', 'هبيبي')]),
  word('eye', 'eye', [form('primary', '3in', 'عين')]),
  word('tired', 'tired', [
    form('primary', 'ta3ban', 'تعبان'),
    form('also_heard', 'mfadda', 'مفدّى'),
    form('masculine', 'ta3ben', 'تعبان'),
    form('feminine', 'ta3bena', 'تعبانة'),
  ]),
  word('heart', 'heart', [form('primary', '9alb', 'قلب')]),
  word('dog', 'dog', [form('primary', 'kalb', 'كلب')]),
  word('me', 'me', [form('primary', 'ana', 'أنا')]),
  word('coffee', 'coffee', [form('primary', '9ahwa', 'قهوة')]),
  word('breadbox', 'bread box', [form('primary', '5obzbox', 'خبزبوكس')]),
];
const index = buildSearchIndex(WORDS);

describe('ranking', () => {
  it('exact, then starts with, then contains', () => {
    expect(ids(searchWords(index, 'bread'))).toEqual(['bread', 'breadbox']);
    expect(ids(searchWords(index, '5obz'))[0]).toBe('bread');
  });

  it('an alias match ranks below an exact match', () => {
    // "khobz" reaches 5obz only through the kh → 5 alias.
    expect(ids(searchWords(index, 'khobz'))).toEqual(['bread', 'breadbox']);
    const exact = searchWords(index, '5obz')[0].rank;
    const alias = searchWords(index, 'khobz')[0].rank;
    expect(alias).toBeGreaterThan(exact);
  });

  it('each approved alias finds its word', () => {
    expect(ids(searchWords(index, 'qalb'))).toEqual(['heart']);
    expect(ids(searchWords(index, 'ḥabib'))).toContain('beloved');
    expect(ids(searchWords(index, 'ʿin'))).toEqual(['eye']);
  });

  it('English allows one typo (lowest rank); Latin and Arabic never do', () => {
    expect(ids(searchWords(index, 'coffe'))).toEqual(['coffee']); // prefix, fine
    expect(ids(searchWords(index, 'cofee'))).toEqual(['coffee']); // one typo, English
    expect(ids(searchWords(index, 'tiered'))).toEqual(['tired']);
    expect(searchWords(index, '9ahwe')).toEqual([]); // Latin: no typo tolerance
    expect(searchWords(index, 'قهوه')).toEqual([]); // Arabic: no typo tolerance, ة ≠ ه
  });
});

describe('different sounds are never merged', () => {
  it('habib does not find 7abib (ح ≠ h)', () => {
    expect(ids(searchWords(index, 'habib'))).toEqual(['habibi']);
  });

  it('kalb finds the dog, never the heart (ق ≠ k)', () => {
    expect(ids(searchWords(index, 'kalb'))).toEqual(['dog']);
  });

  it('ain does not find 3in (ع ≠ a); kobz does not find 5obz (خ ≠ k)', () => {
    expect(searchWords(index, 'ain')).toEqual([]);
    expect(searchWords(index, 'kobz')).toEqual([]);
  });
});

describe('Arabic', () => {
  it('matches with or without diacritics, and alef forms as an alias', () => {
    expect(ids(searchWords(index, 'خُبْز'))).toEqual(['bread', 'breadbox']);
    expect(ids(searchWords(index, 'انا'))).toEqual(['me']);
    expect(searchWords(index, 'انا')[0].rank).toBeGreaterThan(searchWords(index, 'أنا')[0].rank);
  });
});

describe('grouping', () => {
  it('a word with primary, also-heard, masculine and feminine forms appears once', () => {
    expect(ids(searchWords(index, 'ta3b'))).toEqual(['tired']);
  });

  it('the "matched" note appears only when a non-primary form matched', () => {
    expect(searchWords(index, 'ta3ban')[0].matchedLabel).toBeNull();
    expect(searchWords(index, 'mfadda')[0].matchedLabel).toBe('also_heard');
    expect(searchWords(index, 'ta3bena')[0].matchedLabel).toBe('feminine');
    expect(searchWords(index, 'tired')[0].matchedLabel).toBeNull();
  });
});

it('an empty query returns nothing', () => {
  expect(searchWords(index, '   ')).toEqual([]);
});

it('copes with a few thousand words quickly', () => {
  const many = Array.from({ length: 3000 }, (_, i) => word(`w${i}`, `meaning ${i}`, [form('primary', `kelma${i}`)]));
  const big = buildSearchIndex(many);
  const started = Date.now();
  for (const q of ['kel', 'kelma29', 'meaning 1', 'zzz']) searchWords(big, q);
  expect(Date.now() - started).toBeLessThan(1000);
});
