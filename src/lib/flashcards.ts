import { isStruggling, sortReviewCandidates, type ReviewCandidate } from '@/lib/reviewSelection';

/**
 * Flashcard decks and ratings — a front end onto the existing progress table
 * and spaced-repetition schedule (src/lib/spacedRepetition.ts), not a second
 * review system. Ratings are written with recordWordGroupResult, so they move
 * the same next_review_at the Review screen and lessons use.
 */

export type FlashcardRating = 'missed' | 'almost' | 'got_it';
export type FlashcardDirection = 'tunisian-first' | 'meaning-first';

export const FLASHCARD_RATINGS: readonly { rating: FlashcardRating; label: string }[] = [
  { rating: 'missed', label: 'Missed it' },
  { rating: 'almost', label: 'Almost' },
  { rating: 'got_it', label: 'Got it' },
];

/**
 * The scheduler only takes right/wrong. "Almost" counts as not remembered
 * yet — the same as "Missed it": back tomorrow, ease −0.2. "Got it" counts
 * as remembered: 1 day, then 6 days, then interval × ease.
 */
export function ratingWasCorrect(rating: FlashcardRating): boolean {
  return rating === 'got_it';
}

/** A batch ends the session at a natural stopping point; "Another batch" continues. */
export const FLASHCARD_BATCH_SIZE = 15;

/** The next batch of cards not shown yet in this session (empty when all have been). */
export function nextBatch<T>(cards: readonly T[], shownCount: number, size = FLASHCARD_BATCH_SIZE): T[] {
  return cards.slice(shownCount, shownCount + size);
}

export interface FlashcardDeck {
  id: string;
  kind: 'due' | 'favorites' | 'category';
  title: string;
  /** Word group ids, due cards first. */
  cardIds: string[];
  dueCount: number;
}

export interface DeckInput {
  /** This profile's progress rows — the words it has practised. */
  progress: ReviewCandidate[];
  /** Favorited word group ids, most recent first. */
  favoriteIds: string[];
  /** Approved word groups only (the data layer filters); anything absent here is never shown. */
  groups: { id: string; unitId: string; sortOrder: number }[];
  units: { id: string; name: string; sortOrder: number }[];
}

/** Due for review now, or struggling — the same rule as fetchReviewQueue. */
export function isDue(row: Pick<ReviewCandidate, 'nextReviewAt' | 'consecutiveIncorrect'>, now: Date): boolean {
  return new Date(row.nextReviewAt).getTime() <= now.getTime() || isStruggling(row);
}

/**
 * Due today, My favorites (both always listed), then one deck per category
 * the learner has practised words in, in curriculum order. Category decks
 * hold only practised words, so nothing from a lesson not reached yet.
 */
export function buildFlashcardDecks({ progress, favoriteIds, groups, units }: DeckInput, now: Date = new Date()): FlashcardDeck[] {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const approvedProgress = progress.filter((p) => groupById.has(p.wordGroupId));
  const progressById = new Map(approvedProgress.map((p) => [p.wordGroupId, p]));
  const dueRows = sortReviewCandidates(approvedProgress.filter((p) => isDue(p, now)));
  const dueIds = dueRows.map((p) => p.wordGroupId);
  const dueSet = new Set(dueIds);

  // Due cards first (most overdue first), then the rest in the given order.
  const dueFirst = (ids: string[]) => [...dueIds.filter((id) => ids.includes(id)), ...ids.filter((id) => !dueSet.has(id))];
  const deckOf = (id: string, kind: FlashcardDeck['kind'], title: string, ids: string[]): FlashcardDeck => ({
    id,
    kind,
    title,
    cardIds: dueFirst(ids),
    dueCount: ids.filter((i) => dueSet.has(i)).length,
  });

  const favorites = favoriteIds.filter((id) => groupById.has(id));

  const practisedByUnit = new Map<string, string[]>();
  for (const group of [...groups].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!progressById.has(group.id)) continue;
    practisedByUnit.set(group.unitId, [...(practisedByUnit.get(group.unitId) ?? []), group.id]);
  }
  const categories = [...units]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((unit) => practisedByUnit.has(unit.id))
    .map((unit) => deckOf(`category-${unit.id}`, 'category', unit.name, practisedByUnit.get(unit.id)!));

  return [deckOf('due', 'due', 'Due today', dueIds), deckOf('favorites', 'favorites', 'My favorites', favorites), ...categories];
}
