// The redesigned unit card on Learn: a numbered header with lesson progress,
// then the lessons as a vertical path. Each lesson says what state it's in
// (done / up next / locked / Premium) in words, not just icons; order, lock
// rules and Premium gating come straight from the data and are unchanged.
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { UnitSection } = require('@/components/lesson-map/UnitSection');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const lesson = (id: string, n: number, title: string, state: string, masteredCount = 0) => ({
  id,
  unitId: 'u1',
  unitName: 'Daily Phrases',
  lessonNumber: n,
  sortOrder: n,
  title,
  state,
  wordCount: 4,
  masteredCount,
});

const UNIT = {
  unit: { id: 'u1', name: 'Daily Phrases', sortOrder: 1, isCurriculum: true },
  lessons: [
    lesson('l1', 1, 'Greetings', 'completed', 4),
    lesson('l2', 2, 'At the café', 'unlocked', 1),
    lesson('l3', 3, 'Shopping', 'locked'),
    lesson('l4', 4, 'Directions', 'locked'),
  ],
};

let onSelectLesson: jest.Mock;
let onBrowseWords: jest.Mock;
let onPremiumLockedPress: jest.Mock;

const renderUnit = (premium: string[] = []) =>
  render(
    <ThemeProvider>
      <UnitSection
        unitWithLessons={UNIT}
        unitNumber={1}
        onSelectLesson={onSelectLesson}
        onBrowseWords={onBrowseWords}
        isPremiumLocked={(id: string) => premium.includes(id)}
        onPremiumLockedPress={onPremiumLockedPress}
      />
    </ThemeProvider>
  );

beforeEach(() => {
  onSelectLesson = jest.fn();
  onBrowseWords = jest.fn();
  onPremiumLockedPress = jest.fn();
});

it('a numbered header with the unit name and how many lessons are done', async () => {
  await renderUnit();
  expect(screen.getByText('Unit 1')).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Daily Phrases' })).toBeOnTheScreen();
  expect(screen.getByText('1 of 4 lessons done')).toBeOnTheScreen();
});

it('lessons in their original order, each saying its state in words', async () => {
  await renderUnit(['l4']);
  const labels = screen.getAllByRole('button', { name: /^Lesson \d/ }).map((b) => b.props.accessibilityLabel);
  expect(labels).toEqual([
    'Lesson 1, Greetings. Completed, 4 of 4 words',
    'Lesson 2, At the café. Up next, 1 of 4 words',
    'Lesson 3, Shopping. Locked — finish the lesson before it',
    'Lesson 4, Directions. Premium',
  ]);
});

it('done and up-next lessons open; a locked one does nothing; a Premium one opens the upgrade flow', async () => {
  await renderUnit(['l4']);
  await fireEvent.press(screen.getByRole('button', { name: /^Lesson 1,/ }));
  await fireEvent.press(screen.getByRole('button', { name: /^Lesson 2,/ }));
  expect(onSelectLesson.mock.calls).toEqual([['l1'], ['l2']]);

  const locked = screen.getByRole('button', { name: /^Lesson 3,/ });
  expect(locked).toBeDisabled();
  await fireEvent.press(locked);
  expect(onSelectLesson).toHaveBeenCalledTimes(2);

  await fireEvent.press(screen.getByRole('button', { name: /^Lesson 4,/ }));
  expect(onPremiumLockedPress).toHaveBeenCalledTimes(1);
});

it('See words opens the first lesson the learner can open', async () => {
  await renderUnit();
  await fireEvent.press(screen.getByRole('button', { name: 'See words in Daily Phrases' }));
  expect(onBrowseWords).toHaveBeenCalledWith('l1');
});

it('no See words when nothing in the unit can be opened yet', async () => {
  await render(
    <ThemeProvider>
      <UnitSection
        unitWithLessons={{ ...UNIT, lessons: [lesson('l3', 1, 'Shopping', 'locked')] }}
        unitNumber={2}
        onSelectLesson={onSelectLesson}
        onBrowseWords={onBrowseWords}
      />
    </ThemeProvider>
  );
  expect(screen.queryByRole('button', { name: /^See words/ })).toBeNull();
  expect(screen.getByText('0 of 1 lesson done')).toBeOnTheScreen();
});

it('a lesson titled the same as its unit is shown as “Lesson N” — the name appears once, in the header', async () => {
  await render(
    <ThemeProvider>
      <UnitSection
        unitWithLessons={{ ...UNIT, unit: { ...UNIT.unit, name: 'Colors' }, lessons: [{ ...lesson('c1', 1, 'Colors', 'completed', 4), unitName: 'Colors' }] }}
        unitNumber={2}
        onSelectLesson={onSelectLesson}
        onBrowseWords={onBrowseWords}
      />
    </ThemeProvider>
  );
  expect(screen.getAllByText('Colors')).toHaveLength(1);
  expect(screen.getByText('Lesson 1')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Lesson 1. Completed, 4 of 4 words' })).toBeOnTheScreen();
});

it('“Lesson N” is the position in the unit, not the course-wide lesson_number', async () => {
  // Real data: Colors' only lesson has lesson_number 4; Animals' has 5.
  await render(
    <ThemeProvider>
      <UnitSection
        unitWithLessons={{
          ...UNIT,
          unit: { ...UNIT.unit, name: 'Colors' },
          lessons: [
            { ...lesson('c1', 4, 'Colors', 'completed', 4), unitName: 'Colors' },
            { ...lesson('c2', 9, 'Colors', 'unlocked', 1), unitName: 'Colors' },
          ],
        }}
        unitNumber={2}
        onSelectLesson={onSelectLesson}
        onBrowseWords={onBrowseWords}
      />
    </ThemeProvider>
  );
  expect(screen.getByText('Lesson 1')).toBeOnTheScreen();
  expect(screen.getByText('Lesson 2')).toBeOnTheScreen();
  expect(screen.queryByText(/Lesson [49]/)).toBeNull();
  const labels = screen.getAllByRole('button', { name: /^Lesson \d/ }).map((b) => b.props.accessibilityLabel);
  expect(labels).toEqual(['Lesson 1. Completed, 4 of 4 words', 'Lesson 2. Up next, 1 of 4 words']);
});
