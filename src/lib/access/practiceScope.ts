/**
 * Which words practice may use. Practice (Review, Flashcards, Listening,
 * Speaking, Favorites, Today's Practice) isn't counted: it only uses approved
 * words from lessons / phrasebook categories the learner has open — every
 * approved word with Premium. Rules: src/lib/access/accessRules.ts.
 */
export interface PracticeScope {
  /** Premium: every approved word. */
  all: boolean;
  /** Open curriculum lessons, as lessonKey(unitId, lessonNumber). */
  lessonKeys: ReadonlySet<string>;
  /** Open phrasebook categories (each is one unit). */
  unitIds: ReadonlySet<string>;
}

export const lessonKey = (unitId: string, lessonNumber: number) => `${unitId}#${lessonNumber}`;

export function buildPracticeScope(input: {
  all: boolean;
  openLessons: readonly { unitId: string; lessonNumber: number }[];
  openUnitIds: readonly string[];
}): PracticeScope {
  return {
    all: input.all,
    lessonKeys: new Set(input.openLessons.map((l) => lessonKey(l.unitId, l.lessonNumber))),
    unitIds: new Set(input.openUnitIds),
  };
}

interface ScopedWord {
  unitId: string;
  lessonNumber: number;
  contentStatus: string;
}

export function inPracticeScope(scope: PracticeScope, word: ScopedWord): boolean {
  if (word.contentStatus !== 'approved') return false;
  return scope.all || scope.unitIds.has(word.unitId) || scope.lessonKeys.has(lessonKey(word.unitId, word.lessonNumber));
}

export function filterToPracticeScope<T extends ScopedWord>(scope: PracticeScope, words: readonly T[]): T[] {
  return words.filter((w) => inPracticeScope(scope, w));
}
