// Flashcard decks and ratings, on top of the existing progress and
// spaced-repetition schedule (no second review system):
// - decks come only from words the learner has already practised (a
//   progress row) or saved as a favorite — never future content;
// - quiz questions: choices from other words only; the app checks the answer;
// - a session stops at a batch, then offers another.
import { calculateNextReview, INITIAL_SPACED_REPETITION_STATE } from '@/lib/spacedRepetition';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fc = require('@/lib/flashcards');

const NOW = new Date(2026, 9, 30, 12, 0);
const past = new Date(2026, 9, 29, 12, 0).toISOString();
const future = new Date(2026, 10, 5, 12, 0).toISOString();

const progress = (wordGroupId: string, nextReviewAt: string, consecutiveIncorrect = 0, correctCount = 1) => ({
  wordGroupId,
  nextReviewAt,
  consecutiveIncorrect,
  correctCount,
});

const units = [
  { id: 'food', name: 'Food', sortOrder: 2 },
  { id: 'greet', name: 'Greetings', sortOrder: 1 },
  { id: 'colors', name: 'Colors', sortOrder: 3 },
];
const groups = [
  { id: 'hello', unitId: 'greet', sortOrder: 1 },
  { id: 'bye', unitId: 'greet', sortOrder: 2 },
  { id: 'bread', unitId: 'food', sortOrder: 1 },
  { id: 'water', unitId: 'food', sortOrder: 2 },
];

const build = (over: Record<string, unknown> = {}) =>
  fc.buildFlashcardDecks(
    {
      progress: [progress('hello', past), progress('bye', future), progress('bread', future, 2)],
      favoriteIds: ['water', 'hello'],
      groups,
      units,
      ...over,
    },
    NOW
  );
const deck = (decks: { id: string }[], id: string) => decks.find((d) => d.id === id);

describe('answer → scheduler', () => {
  it('next due dates come from the existing scheduler: a right answer is "correct", a wrong one "incorrect"', () => {
    const day = 24 * 60 * 60 * 1000;
    const wrong = calculateNextReview(INITIAL_SPACED_REPETITION_STATE, false, NOW);
    expect(wrong.nextReviewAt.getTime() - NOW.getTime()).toBe(day);
    const second = calculateNextReview(
      { reviewIntervalDays: 1, easeFactor: 2.5, consecutiveCorrect: 1, consecutiveIncorrect: 0 },
      true,
      NOW
    );
    expect(second.reviewIntervalDays).toBe(6);
  });

  it('no self-rating buttons any more', () => {
    expect(fc.FLASHCARD_RATINGS).toBeUndefined();
  });
});

describe('quiz questions', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { makeGroup, makeVariant } = require('@/test-utils/wordGroupFixtures');
  const twoForms = (id: string) =>
    makeGroup(id, {
      variants: [
        makeVariant(id, { id: `${id}-m`, variantLabel: 'masculine', wordArabic: `${id}-مذكر`, transliteration: `${id}-m` }),
        makeVariant(id, { id: `${id}-f`, variantLabel: 'feminine', wordArabic: `${id}-مؤنث`, transliteration: `${id}-f` }),
      ],
    });
  const pool = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => makeGroup(id));
  const fixedRandom = () => 0.42;

  it('Tunisian → meaning: choices are meanings, the right one plus 3 from other words', () => {
    const q = fc.buildFlashcardQuestion(pool[0], pool, 'tunisian-first', 'both', fixedRandom);
    expect(q.choices).toHaveLength(4);
    expect(q.choices.map((c: { label: string }) => c.label)).toContain('meaning a');
    expect(new Set(q.choices.map((c: { groupId: string }) => c.groupId)).size).toBe(4);
    expect(q.choices.filter((c: { groupId: string }) => c.groupId === 'a')).toHaveLength(1);
  });

  it('meaning → Tunisian: choices are Tunisian words, shown in the preferred form', () => {
    const target = twoForms('t');
    const q = fc.buildFlashcardQuestion(target, [target, ...pool], 'meaning-first', 'feminine', fixedRandom);
    const right = q.choices.find((c: { groupId: string }) => c.groupId === 't');
    expect(right.variant.id).toBe('t-f');
    expect(q.choices).toHaveLength(4);
  });

  it('never uses another form of the right word as a wrong answer', () => {
    const target = twoForms('t');
    for (const direction of ['tunisian-first', 'meaning-first']) {
      const q = fc.buildFlashcardQuestion(target, [target, ...pool], direction, 'masculine', Math.random);
      const wrong = q.choices.filter((c: { groupId: string }) => c.groupId !== 't');
      expect(wrong.every((c: { variant: { wordGroupId: string } | null }) => c.variant?.wordGroupId !== 't')).toBe(true);
    }
  });

  it('any form of the right word counts as correct; any other word does not', () => {
    const target = twoForms('t');
    const q = fc.buildFlashcardQuestion(target, [target, ...pool], 'meaning-first', 'both', fixedRandom);
    expect(fc.isCorrectChoice(q, 't')).toBe(true);
    expect(fc.isCorrectChoice(q, 'a')).toBe(false);
  });

  it('skips look-alikes in either direction: same meaning, or the same Tunisian text (both could be right)', () => {
    const sameMeaning = makeGroup('dup', { englishMeaning: 'meaning a' });
    const sameText = makeGroup('dup2', { variants: [makeVariant('dup2', { wordArabic: 'عربي-a' })] });
    for (const direction of ['tunisian-first', 'meaning-first']) {
      const q = fc.buildFlashcardQuestion(pool[0], [...pool, sameMeaning, sameText], direction, 'both', Math.random);
      const ids = q.choices.map((c: { groupId: string }) => c.groupId);
      expect(ids).not.toContain('dup');
      expect(ids).not.toContain('dup2');
    }
  });

  it('wrong answers never repeat each other', () => {
    const twins = [makeGroup('t1', { englishMeaning: 'same' }), makeGroup('t2', { englishMeaning: 'same' })];
    const q = fc.buildFlashcardQuestion(pool[0], [pool[0], pool[1], ...twins], 'tunisian-first', 'both', Math.random);
    const labels = q.choices.map((c: { label: string }) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toHaveLength(3);
  });

  it('with only two other words it still asks (3 choices); with fewer it can’t be fair', () => {
    expect(fc.buildFlashcardQuestion(pool[0], pool.slice(0, 3), 'tunisian-first', 'both', fixedRandom).choices).toHaveLength(3);
    expect(fc.buildFlashcardQuestion(pool[0], pool.slice(0, 2), 'tunisian-first', 'both', fixedRandom)).toBeNull();
    expect(fc.canQuiz(pool[0], pool.slice(0, 2), 'both')).toBe(false);
    expect(fc.canQuiz(pool[0], pool, 'both')).toBe(true);
  });
});

describe('decks', () => {
  it('Due today, My favorites, then one deck per category in curriculum order', () => {
    const decks = build();
    expect(decks.map((d: { id: string }) => d.id)).toEqual(['due', 'favorites', 'category-greet', 'category-food']);
    expect(deck(decks, 'category-greet')).toMatchObject({ title: 'Greetings', kind: 'category' });
  });

  it('a category deck holds only words already practised', () => {
    const decks = build();
    expect(deck(decks, 'category-greet')).toMatchObject({ cardIds: ['hello', 'bye'], dueCount: 1 });
    // "water" is only a favorite, not practised: not in the Food deck.
    expect(deck(decks, 'category-food')).toMatchObject({ cardIds: ['bread'], dueCount: 1 });
  });

  it('no deck for a category with nothing practised, and no future content anywhere', () => {
    const decks = build();
    expect(deck(decks, 'category-colors')).toBeUndefined();
    const all = decks.flatMap((d: { cardIds: string[] }) => d.cardIds);
    expect(all).not.toContain('unseen');
  });

  it('Due today: due now or struggling (same rule as Review), most overdue first', () => {
    const decks = build({
      progress: [
        progress('hello', past),
        progress('bye', new Date(2026, 9, 20).toISOString()),
        progress('bread', future, 2), // struggling: missed twice in a row
        progress('water', future),
      ],
    });
    expect(deck(decks, 'due')).toMatchObject({ cardIds: ['bye', 'hello', 'bread'], dueCount: 3 });
  });

  it('My favorites: saved words (due first, then most recently saved), with their due count', () => {
    expect(deck(build(), 'favorites')).toMatchObject({ cardIds: ['hello', 'water'], dueCount: 1 });
    const noneDue = build({ progress: [progress('hello', future)] });
    expect(deck(noneDue, 'favorites')).toMatchObject({ cardIds: ['water', 'hello'], dueCount: 0 });
  });

  it('words that aren’t approved (absent from the groups list) never appear', () => {
    const decks = build({ groups: groups.filter((g) => g.id !== 'hello') });
    const all = decks.flatMap((d: { cardIds: string[] }) => d.cardIds);
    expect(all).not.toContain('hello');
  });

  it('Due today and My favorites are always listed, even when empty', () => {
    const decks = build({ progress: [], favoriteIds: [] });
    expect(decks).toEqual([
      expect.objectContaining({ id: 'due', cardIds: [], dueCount: 0 }),
      expect.objectContaining({ id: 'favorites', cardIds: [], dueCount: 0 }),
    ]);
  });

  it('due cards come first inside a deck', () => {
    const decks = build({ progress: [progress('hello', future), progress('bye', past)] });
    expect(deck(decks, 'category-greet')).toMatchObject({ cardIds: ['bye', 'hello'] });
  });
});

describe('batches', () => {
  const ids = Array.from({ length: 34 }, (_, i) => `w${i}`);

  it('a batch is 15 cards (a natural stopping point)', () => {
    expect(fc.FLASHCARD_BATCH_SIZE).toBe(15);
    expect(fc.nextBatch(ids, 0)).toEqual(ids.slice(0, 15));
  });

  it('the next batch continues with cards not shown yet, then stops', () => {
    expect(fc.nextBatch(ids, 15)).toEqual(ids.slice(15, 30));
    expect(fc.nextBatch(ids, 30)).toEqual(ids.slice(30));
    expect(fc.nextBatch(ids, 34)).toEqual([]);
  });
});
