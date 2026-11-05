// What a lesson is called on screen. Lessons are numbered by their position
// within their own unit (Lesson 1, Lesson 2, …) — never by lessons.lesson_number,
// which the database counts across the whole course (Colors = 4, Animals = 5…).
// A lesson's own title is used unless it just repeats its unit's name.
import { hasOwnLessonTitle, lessonDisplayTitle, lessonPositions } from '@/lib/lessonTitle';

const lesson = (id: string, lessonNumber: number, title: string | null = null, unitName = 'Unit') => ({
  id,
  lessonNumber,
  title,
  unitName,
});

describe('lessonPositions', () => {
  it('numbers lessons 1, 2, … within each unit, in map order, whatever lesson_number says', () => {
    const units = [
      { lessons: [lesson('dp', 8)] }, // a unit with one lesson, course-wide number 8
      { lessons: [lesson('c1', 4), lesson('c2', 9), lesson('c3', 12)] }, // three lessons
      { lessons: [lesson('a1', 5), lesson('a2', 6)] }, // two lessons
    ];
    const positions = lessonPositions(units);
    expect(Object.fromEntries(positions)).toEqual({ dp: 1, c1: 1, c2: 2, c3: 3, a1: 1, a2: 2 });
  });

  it('an empty map gives no positions', () => {
    expect(lessonPositions([]).size).toBe(0);
    expect(lessonPositions([{ lessons: [] }]).size).toBe(0);
  });
});

describe('lessonDisplayTitle', () => {
  it('uses the lesson’s own title when it’s different from the unit', () => {
    expect(lessonDisplayTitle(lesson('x', 4, 'Basic colors', 'Colors'), 1)).toBe('Basic colors');
  });

  it('otherwise “Lesson N” by position in the unit — not the course-wide number', () => {
    expect(lessonDisplayTitle(lesson('x', 4, 'Colors', 'Colors'), 1)).toBe('Lesson 1');
    expect(lessonDisplayTitle(lesson('x', 9, '  colors ', 'Colors'), 2)).toBe('Lesson 2');
    expect(lessonDisplayTitle(lesson('x', 5, null, 'Animals'), 1)).toBe('Lesson 1');
    expect(lessonDisplayTitle(lesson('x', 5, '   ', 'Animals'), 3)).toBe('Lesson 3');
  });
});

describe('hasOwnLessonTitle', () => {
  it('true only for a non-empty title that isn’t the unit name', () => {
    expect(hasOwnLessonTitle(lesson('x', 4, 'Basic colors', 'Colors'))).toBe(true);
    expect(hasOwnLessonTitle(lesson('x', 4, 'Colors', 'Colors'))).toBe(false);
    expect(hasOwnLessonTitle(lesson('x', 4, null, 'Colors'))).toBe(false);
  });
});
