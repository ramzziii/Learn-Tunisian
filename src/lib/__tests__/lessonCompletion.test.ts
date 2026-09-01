import { computeLessonStates, type LessonCompletionInput } from '@/lib/lessonCompletion';

describe('computeLessonStates', () => {
  it('the first lesson is always unlocked, even with zero progress anywhere', () => {
    const lessons: LessonCompletionInput[] = [
      { lessonId: 'l1', wordCount: 5, masteredCount: 0 },
      { lessonId: 'l2', wordCount: 5, masteredCount: 0 },
    ];
    const states = computeLessonStates(lessons);
    expect(states.get('l1')).toBe('unlocked');
    expect(states.get('l2')).toBe('locked');
  });

  it('marks a lesson completed once every word_group in it is mastered', () => {
    const lessons: LessonCompletionInput[] = [{ lessonId: 'l1', wordCount: 5, masteredCount: 5 }];
    expect(computeLessonStates(lessons).get('l1')).toBe('completed');
  });

  it('does not mark a lesson completed while only some words are mastered', () => {
    const lessons: LessonCompletionInput[] = [{ lessonId: 'l1', wordCount: 5, masteredCount: 4 }];
    expect(computeLessonStates(lessons).get('l1')).toBe('unlocked');
  });

  it('unlocks the next lesson only once the previous one is completed', () => {
    const lessons: LessonCompletionInput[] = [
      { lessonId: 'l1', wordCount: 5, masteredCount: 5 },
      { lessonId: 'l2', wordCount: 5, masteredCount: 0 },
      { lessonId: 'l3', wordCount: 5, masteredCount: 0 },
    ];
    const states = computeLessonStates(lessons);
    expect(states.get('l1')).toBe('completed');
    expect(states.get('l2')).toBe('unlocked');
    expect(states.get('l3')).toBe('locked');
  });

  it('a lesson with zero word_groups is never considered completed (avoids the vacuous-truth trap)', () => {
    const lessons: LessonCompletionInput[] = [{ lessonId: 'empty', wordCount: 0, masteredCount: 0 }];
    expect(computeLessonStates(lessons).get('empty')).toBe('unlocked');
  });

  it('a fully completed sequence leaves every lesson completed, none locked', () => {
    const lessons: LessonCompletionInput[] = [
      { lessonId: 'l1', wordCount: 3, masteredCount: 3 },
      { lessonId: 'l2', wordCount: 3, masteredCount: 3 },
      { lessonId: 'l3', wordCount: 3, masteredCount: 3 },
    ];
    const states = computeLessonStates(lessons);
    expect([...states.values()]).toEqual(['completed', 'completed', 'completed']);
  });

  it('handles an empty lesson list', () => {
    expect(computeLessonStates([]).size).toBe(0);
  });
});
