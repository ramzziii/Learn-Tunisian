// The Today's Practice session screen: runs the composed steps with the
// existing activities, updates progress through the existing systems, logs
// daily-goal minutes exactly once, and handles empty/error states.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockLoad = jest.fn();
const mockRecordWord = jest.fn();
const mockRecordRam = jest.fn();
const mockMarkRamSession = jest.fn();
const mockRecordSessionLog = jest.fn();
const mockMarkFreeReviewStarted = jest.fn();
const mockMarkReviewCompletedToday = jest.fn();
const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true };
let mockPremium = { isPremium: true, isResolved: true };
const mockProfile = { id: 'p1', track: 'adult' };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({ router: mockRouter }));
jest.mock('@/lib/account/ActiveProfileContext', () => ({ useActiveProfile: () => ({ activeProfile: mockProfile }) }));
jest.mock('@/lib/premium/PremiumContext', () => ({ usePremium: () => mockPremium }));
jest.mock('@/data/todaysPractice', () => ({ loadTodaysPractice: (...a: unknown[]) => mockLoad(...a) }));
jest.mock('@/data/progress', () => ({ recordWordGroupResult: (...a: unknown[]) => mockRecordWord(...a) }));
jest.mock('@/data/sessionLogs', () => ({ recordSessionLog: (...a: unknown[]) => mockRecordSessionLog(...a) }));
jest.mock('@/lib/repeatAfterMe/progress', () => ({
  recordRepeatAfterMeItemResult: (...a: unknown[]) => mockRecordRam(...a),
  markRepeatAfterMeSessionCompleted: (...a: unknown[]) => mockMarkRamSession(...a),
}));
jest.mock('@/lib/premium/freeAllowance', () => ({ markFreeReviewStarted: (...a: unknown[]) => mockMarkFreeReviewStarted(...a) }));
jest.mock('@/lib/dailyChallengeProgress', () => ({
  markReviewCompletedToday: (...a: unknown[]) => mockMarkReviewCompletedToday(...a),
}));
// The activities themselves are tested on their own; these stubs expose
// their completion callbacks.
jest.mock('@/components/exercises/shared/ExerciseRenderer', () => ({
  ExerciseRenderer: ({ exercise, onComplete }: { exercise: { targetGroup: { id: string } }; onComplete: (c: boolean, o?: object) => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text, Pressable } = require('react-native');
    return (
      <>
        <Text>{`Word: ${exercise.targetGroup.id}${(exercise as { isRevisit?: boolean }).isRevisit ? ' (revisit)' : ''}`}</Text>
        <Pressable onPress={() => onComplete(true)}>
          <Text>Answer right</Text>
        </Pressable>
        <Pressable onPress={() => onComplete(true, { mispronounced: true })}>
          <Text>Say it wrong, move on</Text>
        </Pressable>
        <Pressable onPress={() => onComplete(false)}>
          <Text>Answer wrong</Text>
        </Pressable>
      </>
    );
  },
}));
jest.mock('@/components/repeatAfterMe/RepeatAfterMeExercise', () => ({
  RepeatAfterMeExercise: (props: {
    item: { id: string };
    maxAttempts: number;
    isReview: boolean;
    onFinish: (r: { correct: boolean; attempts: number }) => void;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text, Pressable } = require('react-native');
    return (
      <>
        <Text>{`Repeat: ${props.item.id}${props.isReview ? ' (revisit)' : ''} max=${props.maxAttempts}`}</Text>
        <Pressable onPress={() => props.onFinish({ correct: true, attempts: 1 })}>
          <Text>Got it</Text>
        </Pressable>
        <Pressable onPress={() => props.onFinish({ correct: false, attempts: props.maxAttempts })}>
          <Text>Missed</Text>
        </Pressable>
      </>
    );
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TodaysPracticeScreen = require('../../../app/todays-practice').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const wordStep = (id: string, source: 'review' | 'new', type = 'typing_spelling') => ({
  kind: 'word',
  key: `${source}-${id}`,
  source,
  group: { id },
  exercise: { key: `${source}-${id}`, type, targetGroup: { id }, promptVariant: {}, options: [] },
});
const repeatStep = (id: string) => ({ kind: 'repeat', key: `repeat-${id}`, item: { id, wordGroupId: `rg-${id}`, englishMeaning: id, variant: {} } });

const renderScreen = () =>
  render(
    <ThemeProvider>
      <TodaysPracticeScreen />
    </ThemeProvider>
  );

beforeEach(() => {
  mockPremium = { isPremium: true, isResolved: true };
  [mockLoad, mockRecordWord, mockRecordRam, mockMarkRamSession, mockRecordSessionLog, mockMarkFreeReviewStarted, mockMarkReviewCompletedToday].forEach((m) => m.mockReset());
  mockRecordWord.mockResolvedValue({ correctCount: 1, status: 'learning' });
  mockRecordRam.mockResolvedValue(undefined);
  mockRecordSessionLog.mockResolvedValue(undefined);
  mockMarkFreeReviewStarted.mockResolvedValue(undefined);
  mockRouter.replace.mockReset();
  mockRouter.back.mockReset();
});

it('loads for this profile with its entitlement, once the entitlement is known', async () => {
  mockPremium = { isPremium: false, isResolved: false };
  mockLoad.mockResolvedValue({ steps: [], usesFreeReview: false });
  const view = await renderScreen();
  expect(mockLoad).not.toHaveBeenCalled();

  mockPremium = { isPremium: false, isResolved: true };
  await view.rerender(
    <ThemeProvider>
      <TodaysPracticeScreen />
    </ThemeProvider>
  );
  await waitFor(() => expect(mockLoad).toHaveBeenCalledWith({ profileId: 'p1', isPremium: false, track: 'adult' }));
});

it('runs the steps in order through to a clear completion state', async () => {
  mockLoad.mockResolvedValue({ steps: [wordStep('r1', 'review'), wordStep('n1', 'new'), repeatStep('a1')], usesFreeReview: false });
  await renderScreen();

  expect(await screen.findByText('Word: r1')).toBeOnTheScreen();
  expect(screen.getByText('1 of 3')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Answer right'));
  expect(await screen.findByText('Word: n1')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Answer wrong'));
  expect(await screen.findByText('Repeat: a1 max=3')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Got it'));

  expect(await screen.findByText(/Today.s practice complete/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Back to home'));
  expect(mockRouter.replace).toHaveBeenCalledWith('/home');
});

it('word answers update progress through the existing word progress system', async () => {
  mockLoad.mockResolvedValue({ steps: [wordStep('r1', 'review'), wordStep('n1', 'new')], usesFreeReview: false });
  await renderScreen();

  await fireEvent.press(await screen.findByText('Answer right'));
  await fireEvent.press(await screen.findByText('Answer wrong'));

  expect(mockRecordWord.mock.calls).toEqual([
    ['p1', 'r1', true],
    ['p1', 'n1', false],
  ]);
});

it('Repeat After Me steps keep their rules (3 tries) and their own progress', async () => {
  mockLoad.mockResolvedValue({ steps: [repeatStep('a1'), repeatStep('a2')], usesFreeReview: false });
  await renderScreen();

  expect(await screen.findByText('Repeat: a1 max=3')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Missed'));
  await fireEvent.press(await screen.findByText('Got it'));
  await fireEvent.press(await screen.findByText('Skip for now')); // skip the end revisit

  await screen.findByText(/Today.s practice complete/);
  expect(mockRecordRam.mock.calls).toEqual([
    ['p1', 'a1', { attempts: 3, result: 'needs_review' }],
    ['p1', 'a2', { attempts: 1, result: 'correct' }],
  ]);
  // Not a Repeat After Me session of its own — its session count is untouched.
  expect(mockMarkRamSession).not.toHaveBeenCalled();
});

describe('end-of-session revisit', () => {
  it('words said wrong and Repeat After Me items missed come back once, then the session completes', async () => {
    mockLoad.mockResolvedValue({ steps: [wordStep('w1', 'review', 'speaking'), repeatStep('a1'), wordStep('w2', 'new')], usesFreeReview: false });
    await renderScreen();

    await fireEvent.press(await screen.findByText('Say it wrong, move on')); // w1
    await fireEvent.press(await screen.findByText('Missed')); // a1
    await fireEvent.press(await screen.findByText('Answer right')); // w2

    expect(await screen.findByText(/revisit the tricky/)).toBeOnTheScreen();
    expect(screen.queryByText(/Today.s practice complete/)).toBeNull();
    await fireEvent.press(screen.getByText('Start'));

    expect(await screen.findByText('Word: w1 (revisit)')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Answer right'));
    expect(await screen.findByText('Repeat: a1 (revisit) max=1')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Missed')); // no third round

    expect(await screen.findByText(/Today.s practice complete/)).toBeOnTheScreen();
    expect(mockRecordWord).toHaveBeenCalledTimes(3); // w1, w2, w1 again
    expect(mockRecordRam).toHaveBeenLastCalledWith('p1', 'a1', { attempts: 1, result: 'needs_review' });
    expect(mockRecordSessionLog).toHaveBeenCalledTimes(1);
  });

  it('nothing missed → straight to completion', async () => {
    mockLoad.mockResolvedValue({ steps: [wordStep('w1', 'review')], usesFreeReview: false });
    await renderScreen();

    await fireEvent.press(await screen.findByText('Answer right'));

    expect(await screen.findByText(/Today.s practice complete/)).toBeOnTheScreen();
    expect(screen.queryByText(/revisit the tricky/)).toBeNull();
  });
});

it('logs daily-goal minutes exactly once at completion, as an existing session type', async () => {
  mockLoad.mockResolvedValue({ steps: [wordStep('r1', 'review')], usesFreeReview: false });
  await renderScreen();

  await fireEvent.press(await screen.findByText('Answer right'));
  await screen.findByText(/Today.s practice complete/);
  await fireEvent.press(screen.getByText('Back to home'));

  expect(mockRecordSessionLog).toHaveBeenCalledTimes(1);
  expect(mockRecordSessionLog).toHaveBeenCalledWith('p1', 'review', expect.any(Number));
});

it('a session with no review words logs as a lesson session', async () => {
  mockLoad.mockResolvedValue({ steps: [wordStep('n1', 'new')], usesFreeReview: false });
  await renderScreen();

  await fireEvent.press(await screen.findByText('Answer right'));
  await screen.findByText(/Today.s practice complete/);

  expect(mockRecordSessionLog).toHaveBeenCalledWith('p1', 'lesson', expect.any(Number));
});

it('leaving early still logs the time once, and keeps answers already recorded', async () => {
  mockLoad.mockResolvedValue({ steps: [wordStep('r1', 'review'), wordStep('r2', 'review')], usesFreeReview: false });
  await renderScreen();

  await fireEvent.press(await screen.findByText('Answer right'));
  await fireEvent.press(await screen.findByLabelText('Exit practice'));

  expect(mockRecordSessionLog).toHaveBeenCalledTimes(1);
  expect(mockRecordWord).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).toHaveBeenCalledWith('/home');
});

it('does not touch unrelated daily-challenge or review-completion flags', async () => {
  mockLoad.mockResolvedValue({ steps: [wordStep('r1', 'review')], usesFreeReview: false });
  await renderScreen();

  await fireEvent.press(await screen.findByText('Answer right'));
  await screen.findByText(/Today.s practice complete/);

  expect(mockMarkReviewCompletedToday).not.toHaveBeenCalled();
});

it('free: uses up today’s free review only when the session actually includes review words', async () => {
  mockPremium = { isPremium: false, isResolved: true };
  mockLoad.mockResolvedValue({ steps: [wordStep('r1', 'review')], usesFreeReview: true });
  await renderScreen();

  await screen.findByText('Word: r1');
  expect(mockMarkFreeReviewStarted).toHaveBeenCalledWith('p1');
});

it('no review words → the free review allowance is left alone', async () => {
  mockPremium = { isPremium: false, isResolved: true };
  mockLoad.mockResolvedValue({ steps: [wordStep('n1', 'new')], usesFreeReview: false });
  await renderScreen();

  await screen.findByText('Word: n1');
  expect(mockMarkFreeReviewStarted).not.toHaveBeenCalled();
});

it('nothing to practice: a clear empty state pointing to the Practice tab — no session, nothing logged', async () => {
  mockLoad.mockResolvedValue({ steps: [], usesFreeReview: false });
  await renderScreen();

  expect(await screen.findByText(/all caught up/i)).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Browse Practice'));
  expect(mockRouter.replace).toHaveBeenCalledWith('/practice');
  expect(mockRecordSessionLog).not.toHaveBeenCalled();
});

it('load failure: an error with retry, not a broken session', async () => {
  mockLoad.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ steps: [wordStep('r1', 'review')], usesFreeReview: false });
  await renderScreen();

  await fireEvent.press(await screen.findByText('Try again'));

  expect(await screen.findByText('Word: r1')).toBeOnTheScreen();
});
