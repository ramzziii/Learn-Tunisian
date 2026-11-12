// The Learn screen (real LearnView, real unit cards) with course-wide
// lesson_numbers like the real database (Daily Phrases = 8, Colors = 4,
// Animals = 5): every "Lesson N" label is the position within its unit.
import { render, screen } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
// The account button (top right of each tab) reads these.
jest.mock('@/lib/access/AccessContext', () => ({ useAccess: () => ({ tier: 'free', isResolved: true }) }));
jest.mock('@/lib/account/ActiveProfileContext', () => ({ useActiveProfile: () => ({ activeProfile: { id: 'p1', name: 'Sam' } }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LearnPath } = require('@/components/learn/LearnView');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const lesson = (id: string, unitId: string, unitName: string, lessonNumber: number, state: string, sortOrder = 1) => ({
  id,
  unitId,
  unitName,
  lessonNumber,
  sortOrder,
  title: unitName, // the real seed titles each single lesson after its unit
  state,
  wordCount: 10,
  masteredCount: state === 'completed' ? 10 : 1,
});

const data = {
  unitsWithLessons: [
    { unit: { id: 'u1', name: 'Daily Phrases', sortOrder: 0, isCurriculum: true }, lessons: [lesson('dp', 'u1', 'Daily Phrases', 8, 'completed')] },
    { unit: { id: 'u2', name: 'Colors', sortOrder: 1, isCurriculum: true }, lessons: [lesson('co', 'u2', 'Colors', 4, 'completed')] },
    {
      unit: { id: 'u3', name: 'Animals', sortOrder: 2, isCurriculum: true },
      lessons: [lesson('an1', 'u3', 'Animals', 5, 'unlocked', 1), { ...lesson('an2', 'u3', 'Animals', 11, 'locked', 2), title: 'Farm animals' }],
    },
  ],
  progressSummary: { wordsLearning: 3, wordsMastered: 20, wordsReviewed: 5, totalWordsSeen: 23 },
  progressInsights: { focusArea: null, strongArea: null },
};

it('lesson rows and the Continue card count lessons within their unit', async () => {
  await render(
    <ThemeProvider>
      <LearnPath data={data} isLessonLocked={() => false} onLockedPress={() => undefined} />
    </ThemeProvider>
  );
  // Each unit's first lesson is "Lesson 1" (3 rows), plus the Continue card's
  // subtitle for Animals' first lesson; a titled lesson keeps its title.
  expect(screen.getAllByText('Lesson 1')).toHaveLength(4);
  expect(screen.getByText('Farm animals')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: /^Lesson 2, Farm animals\./ })).toBeOnTheScreen();
  // The Continue card: Animals' first lesson.
  expect(screen.getByRole('button', { name: /^Continue: Animals\. Lesson 1$/ })).toBeOnTheScreen();
  // The course-wide numbers never show.
  expect(screen.queryByText(/Lesson (4|5|8|11)\b/)).toBeNull();
  expect(screen.queryAllByRole('button', { name: /Lesson (4|5|8|11)\b/ })).toHaveLength(0);
});
