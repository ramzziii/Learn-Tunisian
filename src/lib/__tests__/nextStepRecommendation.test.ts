import { recommendNextStep } from '@/lib/nextStepRecommendation';
import type { LessonWithState } from '@/types/models';

function makeLesson(overrides: Partial<LessonWithState>): LessonWithState {
  return {
    id: 'lesson-1',
    unitId: 'unit-1',
    lessonNumber: 1,
    title: 'Greetings',
    sortOrder: 0,
    unitName: 'Basics',
    wordCount: 5,
    masteredCount: 0,
    state: 'unlocked',
    ...overrides,
  };
}

describe('recommendNextStep', () => {
  it('recommends review when anything is due, regardless of lesson progress', () => {
    const lessons = [makeLesson({ id: 'a' })];
    expect(recommendNextStep(lessons, 3)).toEqual({ type: 'review', dueCount: 3 });
  });

  it('recommends the weakest unlocked lesson when nothing is due', () => {
    const strong = makeLesson({ id: 'strong', wordCount: 5, masteredCount: 4 });
    const weak = makeLesson({ id: 'weak', wordCount: 5, masteredCount: 1 });
    const locked = makeLesson({ id: 'locked', state: 'locked', wordCount: 5, masteredCount: 0 });
    const completed = makeLesson({ id: 'completed', state: 'completed', wordCount: 5, masteredCount: 5 });

    const result = recommendNextStep([strong, weak, locked, completed], 0);
    expect(result).toEqual({ type: 'lesson', lesson: weak, reason: 'weak_spot' });
  });

  it('labels an untouched lesson "continue" rather than "weak_spot"', () => {
    const untouched = makeLesson({ id: 'untouched', wordCount: 5, masteredCount: 0 });
    const result = recommendNextStep([untouched], 0);
    expect(result).toEqual({ type: 'lesson', lesson: untouched, reason: 'continue' });
  });

  it('returns null when there is nothing due and nothing unlocked', () => {
    const locked = makeLesson({ id: 'locked', state: 'locked' });
    const completed = makeLesson({ id: 'completed', state: 'completed', masteredCount: 5 });
    expect(recommendNextStep([locked, completed], 0)).toBeNull();
  });

  it('treats a zero-word lesson as fully unmastered (ratio 0) rather than dividing by zero', () => {
    const empty = makeLesson({ id: 'empty', wordCount: 0, masteredCount: 0 });
    const withProgress = makeLesson({ id: 'withProgress', wordCount: 5, masteredCount: 1 });
    const result = recommendNextStep([withProgress, empty], 0);
    expect(result).toEqual({ type: 'lesson', lesson: empty, reason: 'continue' });
  });
});
