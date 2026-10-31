// A lesson's own title, unless it just repeats its unit's name (common when a
// unit has a single lesson) — then screens say "Lesson N" instead.
import { lessonDisplayTitle } from '@/lib/lessonTitle';

const lesson = (title: string | null, unitName = 'Colors', lessonNumber = 1) => ({ title, unitName, lessonNumber });

it('uses the lesson’s own title when it’s different from the unit', () => {
  expect(lessonDisplayTitle(lesson('Basic colors'))).toBe('Basic colors');
});

it('falls back to “Lesson N” when the title repeats the unit name (any case/spacing)', () => {
  expect(lessonDisplayTitle(lesson('Colors'))).toBe('Lesson 1');
  expect(lessonDisplayTitle(lesson('  colors '))).toBe('Lesson 1');
  expect(lessonDisplayTitle(lesson('Colors', 'Colors', 3))).toBe('Lesson 3');
});

it('falls back to “Lesson N” when there’s no title', () => {
  expect(lessonDisplayTitle(lesson(null))).toBe('Lesson 1');
  expect(lessonDisplayTitle(lesson('   '))).toBe('Lesson 1');
});
