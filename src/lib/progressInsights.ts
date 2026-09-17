import type { LessonWithState } from '@/types/models';

export interface UnitProgressInsight {
  unitName: string;
  completedRatio: number; // 0-1
}

export interface ProgressInsights {
  /** The unit with the most room to grow, among units the learner has
   * actually started (at least one word answered correctly) — a unit not
   * yet begun isn't a "gap," it's just content still ahead. Null if nothing
   * has been started yet, or everything's already fully done. */
  focusArea: UnitProgressInsight | null;
  /** The unit furthest along — only shown once it's genuinely ahead of the
   * rest (a small lead over the pack isn't worth calling out). */
  strongArea: UnitProgressInsight | null;
}

// A unit needs a real lead (in percentage points) over the next one to be
// worth calling out as a "strength" — otherwise every profile's top unit
// would get labeled a strength even when everything's roughly even.
const STRONG_AREA_LEAD = 0.15;

/**
 * Derives "which unit needs more attention / which one's going well" purely
 * from each lesson's masteredCount/wordCount (already computed by
 * fetchLessonMap — see src/data/content.ts) — no new query. Note this is
 * "answered correctly at least once" progress (the same signal that drives
 * lesson unlocking), not the stricter 3-correct-answers mastery status used
 * elsewhere; that distinction is intentional; see the function doc.
 */
export function buildProgressInsights(lessons: LessonWithState[]): ProgressInsights {
  const byUnit = new Map<string, { masteredCount: number; wordCount: number }>();
  for (const lesson of lessons) {
    const entry = byUnit.get(lesson.unitName) ?? { masteredCount: 0, wordCount: 0 };
    entry.masteredCount += lesson.masteredCount;
    entry.wordCount += lesson.wordCount;
    byUnit.set(lesson.unitName, entry);
  }

  const units: UnitProgressInsight[] = Array.from(byUnit.entries())
    .filter(([, v]) => v.wordCount > 0)
    .map(([unitName, v]) => ({ unitName, completedRatio: v.masteredCount / v.wordCount }));

  const started = units.filter((u) => u.completedRatio > 0);
  const focusCandidates = started.filter((u) => u.completedRatio < 1);
  const focusArea =
    focusCandidates.length > 0
      ? focusCandidates.reduce((weakest, u) => (u.completedRatio < weakest.completedRatio ? u : weakest))
      : null;

  let strongArea: UnitProgressInsight | null = null;
  if (started.length >= 2) {
    const sorted = [...started].sort((a, b) => b.completedRatio - a.completedRatio);
    if (sorted[0].completedRatio - sorted[1].completedRatio >= STRONG_AREA_LEAD) {
      strongArea = sorted[0];
    }
  } else if (started.length === 1 && started[0].completedRatio >= 1) {
    strongArea = started[0];
  }

  return { focusArea, strongArea };
}
