// Flashcard decks and ratings, on top of the existing progress and
// spaced-repetition schedule (no second review system):
// - decks come only from words the learner has already practised (a
//   progress row) or saved as a favorite — never future content;
// - Missed it / Almost / Got it map onto the scheduler's right/wrong input;
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

describe('rating → scheduler', () => {
  it('Missed it and Almost are recorded as not remembered; Got it as remembered', () => {
    expect(fc.ratingWasCorrect('missed')).toBe(false);
    expect(fc.ratingWasCorrect('almost')).toBe(false);
    expect(fc.ratingWasCorrect('got_it')).toBe(true);
  });

  it('offers exactly Missed it, Almost, Got it', () => {
    expect(fc.FLASHCARD_RATINGS.map((r: { label: string }) => r.label)).toEqual(['Missed it', 'Almost', 'Got it']);
  });

  it('next due dates come from the existing scheduler', () => {
    const day = 24 * 60 * 60 * 1000;
    const almost = calculateNextReview(INITIAL_SPACED_REPETITION_STATE, fc.ratingWasCorrect('almost'), NOW);
    expect(almost.nextReviewAt.getTime() - NOW.getTime()).toBe(day);
    const second = calculateNextReview(
      { reviewIntervalDays: 1, easeFactor: 2.5, consecutiveCorrect: 1, consecutiveIncorrect: 0 },
      fc.ratingWasCorrect('got_it'),
      NOW
    );
    expect(second.reviewIntervalDays).toBe(6);
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
