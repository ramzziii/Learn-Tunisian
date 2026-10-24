import { GRAMMAR_NOTES } from '@/constants/grammarNotes';
import { PROVERBS } from '@/constants/proverbs';
import { ARABIC_LETTERS, buildAlphabetExerciseQueue, buildMatchingGrid } from '@/lib/alphabet';
import {
  accessibleLetters,
  canAccessGrammarNote,
  canAccessLesson,
  canAccessLetter,
  canAccessProverb,
  canStartReview,
  canStartSpeedMatchRound,
  computeFreeLessonIds,
  FREE_ALPHABET_LETTER_IDS,
  FREE_GRAMMAR_NOTE_IDS,
  FREE_PROVERB_IDS,
  FREE_REVIEW_WORD_LIMIT,
  freePhrasebookUnitIds,
  limitReviewQueue,
  resolveEffectivePremium,
  SPEED_MATCH_SAMPLE_PAIRS,
  speedMatchPairCount,
} from '@/lib/premium/access';

describe('pinned free ids for bundled content', () => {
  // The free sets are pinned by id (these arrays have no sort field) — these
  // guard against a content edit silently making a different item "first".
  it('Grammar: only Basic Sentence Order, which still exists', () => {
    expect(FREE_GRAMMAR_NOTE_IDS).toEqual(['sentence_order']);
    expect(GRAMMAR_NOTES.find((n) => n.id === 'sentence_order')?.title).toBe('Basic Sentence Order');
  });

  it('Alphabet: the first 3 letters of the teaching order', () => {
    expect(FREE_ALPHABET_LETTER_IDS).toEqual(ARABIC_LETTERS.slice(0, 3).map((l) => l.id));
  });

  it('Culture: the first 2 proverbs', () => {
    expect(FREE_PROVERB_IDS).toEqual(PROVERBS.slice(0, 2).map((p) => p.id));
  });
});

describe('item-level boundaries', () => {
  it('Grammar: free gets only the free topic; Premium gets every topic', () => {
    const freeAccessible = GRAMMAR_NOTES.filter((n) => canAccessGrammarNote(false, n.id)).map((n) => n.id);
    expect(freeAccessible).toEqual(['sentence_order']);
    expect(GRAMMAR_NOTES.every((n) => canAccessGrammarNote(true, n.id))).toBe(true);
  });

  it('Letters: free gets exactly 3 (shared by Practice, Flashcards, Diacritics); Premium gets all', () => {
    expect(accessibleLetters(false, ARABIC_LETTERS)).toHaveLength(3);
    expect(canAccessLetter(false, ARABIC_LETTERS[3].id)).toBe(false);
    expect(accessibleLetters(true, ARABIC_LETTERS)).toHaveLength(ARABIC_LETTERS.length);
  });

  it('Culture: free gets exactly 2 proverbs; Premium gets all', () => {
    expect(PROVERBS.filter((p) => canAccessProverb(false, p.id))).toHaveLength(2);
    expect(canAccessProverb(false, PROVERBS[2].id)).toBe(false);
    expect(PROVERBS.every((p) => canAccessProverb(true, p.id))).toBe(true);
  });

  it('a free alphabet practice round only asks about free letters', () => {
    const queue = buildAlphabetExerciseQueue(8, accessibleLetters(false, ARABIC_LETTERS));
    expect(queue).toHaveLength(8);
    expect(queue.every((item) => FREE_ALPHABET_LETTER_IDS.includes(item.letterId))).toBe(true);
  });
});

describe('phrasebook categories (Supabase sort_order)', () => {
  const units = [
    { id: 'emergencies', sortOrder: 109, isCurriculum: false },
    { id: 'greetings', sortOrder: 100, isCurriculum: false },
    { id: 'first-encounters', sortOrder: 101, isCurriculum: false },
    { id: 'curriculum-unit', sortOrder: 0, isCurriculum: true },
  ];

  it('frees only the lowest-sort_order phrasebook category, regardless of input order', () => {
    expect([...freePhrasebookUnitIds(units)]).toEqual(['greetings']);
    expect([...freePhrasebookUnitIds([...units].reverse())]).toEqual(['greetings']);
  });
});

describe('lessons (curriculum + phrasebook lessons share /lesson/[lessonId])', () => {
  const units = [
    { id: 'u2', sortOrder: 2, isCurriculum: true },
    { id: 'u1', sortOrder: 1, isCurriculum: true },
    { id: 'pb-greetings', sortOrder: 100, isCurriculum: false },
    { id: 'pb-hotel', sortOrder: 105, isCurriculum: false },
  ];
  const lessons = [
    { id: 'u2-l1', unitId: 'u2', sortOrder: 1 },
    { id: 'u1-l2', unitId: 'u1', sortOrder: 2 },
    { id: 'u1-l1', unitId: 'u1', sortOrder: 1 },
    { id: 'pb-greetings-lesson', unitId: 'pb-greetings', sortOrder: 1 },
    { id: 'pb-hotel-lesson', unitId: 'pb-hotel', sortOrder: 1 },
  ];
  const free = computeFreeLessonIds(units, lessons);

  it('frees the first curriculum lesson by unit then lesson sort_order, plus the free phrasebook lesson', () => {
    expect([...free].sort()).toEqual(['pb-greetings-lesson', 'u1-l1']);
  });

  it('locks later lessons and Premium phrasebook lessons for free, including by direct id', () => {
    expect(canAccessLesson(false, 'u1-l2', free)).toBe(false);
    expect(canAccessLesson(false, 'u2-l1', free)).toBe(false);
    expect(canAccessLesson(false, 'pb-hotel-lesson', free)).toBe(false);
    expect(canAccessLesson(false, 'u1-l1', free)).toBe(true);
  });

  it('Premium can open every lesson', () => {
    expect(lessons.every((l) => canAccessLesson(true, l.id, free))).toBe(true);
  });
});

describe('metered allowances', () => {
  it('Review: free gets one session a day, capped in size; Premium is unlimited', () => {
    expect(canStartReview(false, false)).toBe(true);
    expect(canStartReview(false, true)).toBe(false);
    expect(canStartReview(true, true)).toBe(true);

    const queue = Array.from({ length: 25 }, (_, i) => i);
    expect(limitReviewQueue(false, queue)).toHaveLength(FREE_REVIEW_WORD_LIMIT);
    expect(limitReviewQueue(true, queue)).toHaveLength(25);
  });

  it('Speed Match: free gets one short sample round from free letters; Premium unlimited', () => {
    expect(canStartSpeedMatchRound(false, false)).toBe(true);
    expect(canStartSpeedMatchRound(false, true)).toBe(false);
    expect(canStartSpeedMatchRound(true, true)).toBe(true);

    expect(speedMatchPairCount(false, 6)).toBe(SPEED_MATCH_SAMPLE_PAIRS);
    expect(speedMatchPairCount(true, 6)).toBe(6);

    const sample = buildMatchingGrid(speedMatchPairCount(false, 6), accessibleLetters(false, ARABIC_LETTERS));
    expect(sample).toHaveLength(SPEED_MATCH_SAMPLE_PAIRS * 2);
    expect(sample.every((tile) => FREE_ALPHABET_LETTER_IDS.includes(tile.letterId))).toBe(true);
  });
});

describe('effective entitlement (admins always have Premium, with a free-plan preview)', () => {
  it('admin: Premium by default even though their profile is not paid', () => {
    expect(resolveEffectivePremium({ profileIsPremium: false, isAdmin: true, adminPreview: 'premium' })).toBe(true);
  });

  it('admin previewing the free plan is treated exactly like a free learner', () => {
    expect(resolveEffectivePremium({ profileIsPremium: false, isAdmin: true, adminPreview: 'free' })).toBe(false);
    expect(resolveEffectivePremium({ profileIsPremium: true, isAdmin: true, adminPreview: 'free' })).toBe(false);
  });

  it('non-admins get their profile flag; a stored preview can never grant them Premium', () => {
    expect(resolveEffectivePremium({ profileIsPremium: false, isAdmin: false, adminPreview: 'premium' })).toBe(false);
    expect(resolveEffectivePremium({ profileIsPremium: true, isAdmin: false, adminPreview: 'free' })).toBe(true);
  });
});
