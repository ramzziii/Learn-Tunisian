import { buildProgressInsights } from '@/lib/progressInsights';
import type { LessonWithState } from '@/types/models';

function makeLesson(overrides: Partial<LessonWithState>): LessonWithState {
  return {
    id: 'lesson',
    unitId: 'unit',
    lessonNumber: 1,
    title: null,
    sortOrder: 0,
    unitName: 'Unit',
    wordCount: 5,
    masteredCount: 0,
    state: 'unlocked',
    ...overrides,
  };
}

describe('buildProgressInsights', () => {
  it('returns nulls when nothing has been started', () => {
    const lessons = [makeLesson({ unitName: 'Greetings', masteredCount: 0 })];
    expect(buildProgressInsights(lessons)).toEqual({ focusArea: null, strongArea: null });
  });

  it('picks the weakest started (but not fully complete) unit as the focus area', () => {
    const lessons = [
      makeLesson({ unitName: 'Greetings', wordCount: 10, masteredCount: 8 }),
      makeLesson({ unitName: 'Food', wordCount: 10, masteredCount: 2 }),
    ];
    const insights = buildProgressInsights(lessons);
    expect(insights.focusArea?.unitName).toBe('Food');
  });

  it('does not treat an unstarted unit as a focus area, even at 0% completion', () => {
    const lessons = [
      makeLesson({ unitName: 'Greetings', wordCount: 10, masteredCount: 5 }),
      makeLesson({ unitName: 'Numbers', wordCount: 10, masteredCount: 0 }),
    ];
    const insights = buildProgressInsights(lessons);
    expect(insights.focusArea?.unitName).toBe('Greetings');
  });

  it('names a strong area only when it clearly leads the rest', () => {
    const closeRace = [
      makeLesson({ unitName: 'A', wordCount: 10, masteredCount: 6 }),
      makeLesson({ unitName: 'B', wordCount: 10, masteredCount: 5 }),
    ];
    expect(buildProgressInsights(closeRace).strongArea).toBeNull();

    const clearLead = [
      makeLesson({ unitName: 'A', wordCount: 10, masteredCount: 9 }),
      makeLesson({ unitName: 'B', wordCount: 10, masteredCount: 3 }),
    ];
    expect(buildProgressInsights(clearLead).strongArea?.unitName).toBe('A');
  });

  it('aggregates multiple lessons within the same unit before comparing', () => {
    const lessons = [
      makeLesson({ id: 'l1', unitName: 'Greetings', wordCount: 5, masteredCount: 5 }),
      makeLesson({ id: 'l2', unitName: 'Greetings', wordCount: 5, masteredCount: 0 }),
    ];
    const insights = buildProgressInsights(lessons);
    // Combined: 5/10 = 50% — started, not fully complete.
    expect(insights.focusArea?.unitName).toBe('Greetings');
    expect(insights.focusArea?.completedRatio).toBeCloseTo(0.5);
  });

  it('ignores units with zero total words', () => {
    const lessons = [makeLesson({ unitName: 'Empty', wordCount: 0, masteredCount: 0 })];
    expect(buildProgressInsights(lessons)).toEqual({ focusArea: null, strongArea: null });
  });
});
