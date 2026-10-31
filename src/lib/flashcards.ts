import { preferredVariant } from '@/lib/display/displayRules';
import { isStruggling, sortReviewCandidates, type ReviewCandidate } from '@/lib/reviewSelection';
import type { FormPreference, WordGroupWithVariants, WordVariant } from '@/types/models';

/**
 * Flashcard decks and quiz questions — a front end onto the existing progress
 * table and spaced-repetition schedule (src/lib/spacedRepetition.ts), not a
 * second review system. Each answer is checked by the app and written with
 * recordWordGroupResult (right → correct, wrong → incorrect), so it moves the
 * same next_review_at the Review screen and lessons use.
 */

export type FlashcardDirection = 'tunisian-first' | 'meaning-first';

/** Choices per question when there are enough other words; fewer than the minimum isn't a fair question. */
export const FLASHCARD_CHOICE_COUNT = 4;
export const MIN_FLASHCARD_CHOICES = 3;

export interface FlashcardChoice {
  groupId: string;
  /** What the choice shows: a meaning, or the Tunisian word's main text. */
  label: string;
  /** The form shown for a Tunisian choice (the learner's preferred form); null for a meaning. */
  variant: WordVariant | null;
}

export interface FlashcardQuestion {
  targetId: string;
  direction: FlashcardDirection;
  choices: FlashcardChoice[];
}

const norm = (text: string | null | undefined) => (text ?? '').trim().toLowerCase();
const tunisianTexts = (group: WordGroupWithVariants) =>
  new Set(group.variants.flatMap((v) => [norm(v.wordArabic), norm(v.transliteration)]).filter(Boolean));

/**
 * Could this word also be a right answer for `target`? Same meaning, or any
 * shared Tunisian text, in either direction — so it's never a fair wrong one.
 * Another form of the target is the target's own group, never a distractor.
 */
function isLookAlike(target: WordGroupWithVariants, other: WordGroupWithVariants): boolean {
  if (other.id === target.id || norm(other.englishMeaning) === norm(target.englishMeaning)) return true;
  const targetTexts = tunisianTexts(target);
  return [...tunisianTexts(other)].some((t) => targetTexts.has(t));
}

function choiceFor(group: WordGroupWithVariants, direction: FlashcardDirection, form: FormPreference): FlashcardChoice | null {
  if (direction === 'tunisian-first') return { groupId: group.id, label: group.englishMeaning, variant: null };
  const variant = preferredVariant(group, form);
  return variant ? { groupId: group.id, label: variant.wordArabic, variant } : null;
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Fair wrong answers for `target`: other words that aren't look-alikes, no two showing the same thing. */
function distractorsFor(target: WordGroupWithVariants, pool: WordGroupWithVariants[], direction: FlashcardDirection, form: FormPreference, random: () => number) {
  const seen = new Set<string>();
  const result: FlashcardChoice[] = [];
  for (const group of shuffled(pool, random)) {
    if (isLookAlike(target, group)) continue;
    const choice = choiceFor(group, direction, form);
    if (!choice || seen.has(norm(choice.label))) continue;
    seen.add(norm(choice.label));
    result.push(choice);
  }
  return result;
}

/**
 * A multiple-choice question for one card, or null when there aren't enough
 * fair wrong answers (then the card is skipped — nothing is invented).
 * Distractors come only from other word groups; the right answer is the
 * target group, so any of its forms counts.
 */
export function buildFlashcardQuestion(
  target: WordGroupWithVariants,
  pool: WordGroupWithVariants[],
  direction: FlashcardDirection,
  form: FormPreference,
  random: () => number = Math.random
): FlashcardQuestion | null {
  const right = choiceFor(target, direction, form);
  if (!right) return null;
  const wrong = distractorsFor(target, pool, direction, form, random).slice(0, FLASHCARD_CHOICE_COUNT - 1);
  if (wrong.length + 1 < MIN_FLASHCARD_CHOICES) return null;
  return { targetId: target.id, direction, choices: shuffled([right, ...wrong], random) };
}

/** Whether a card can be quizzed fairly in both directions (so switching never strands it). */
export function canQuiz(target: WordGroupWithVariants, pool: WordGroupWithVariants[], form: FormPreference): boolean {
  return (['tunisian-first', 'meaning-first'] as const).every(
    (direction) => buildFlashcardQuestion(target, pool, direction, form) !== null
  );
}

/** Right when the chosen answer is the target word group (any of its forms). */
export function isCorrectChoice(question: FlashcardQuestion, groupId: string): boolean {
  return groupId === question.targetId;
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
