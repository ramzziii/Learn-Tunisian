// Deep link / direct navigation to /lesson/[lessonId] and /words/[lessonId]:
// the lesson is "opened" through the access layer *before* any of its
// content is fetched. A curriculum lesson counts as a lesson; a phrasebook
// category's lesson counts as that category. At the limit a free account gets
// the Premium gate and a guest the create-account prompt — and the lesson's
// words are never requested. A completed lesson always reopens.
import { fireEvent, render, screen } from '@testing-library/react-native';

let mockLessonId = 'lesson-2';
let mockTier: 'guest' | 'free' | 'premium' = 'free';
const mockOpen = jest.fn(async () => true);
const mockFetchWordGroups = jest.fn(async () => [{ id: 'g1', variants: [] }]);
let mockTarget: unknown = { feature: 'lesson', key: 'lesson-2', completed: false };
const mockFetchTarget = jest.fn(async () => mockTarget);

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ lessonId: mockLessonId }),
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('@/lib/supabase/client', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
const mockProfile = { activeProfile: { id: 'p1' } };
jest.mock('@/lib/account/ActiveProfileContext', () => ({ useActiveProfile: () => mockProfile }));
jest.mock('@/lib/access/AccessContext', () => ({
  useAccess: () => ({ tier: mockTier, isResolved: true, loadError: false, open: mockOpen }),
}));
jest.mock('@/data/lessonAccess', () => ({ fetchLessonAccessTarget: (...a: unknown[]) => mockFetchTarget(...(a as [])) }));
jest.mock('@/data/content', () => ({ fetchWordGroupsForLesson: (...a: unknown[]) => mockFetchWordGroups(...(a as [])) }));
jest.mock('@/data/profiles', () => ({ fetchDailyGoalSettings: jest.fn(async () => null) }));
jest.mock('@/data/favorites', () => ({ fetchFavoriteWordGroupIds: jest.fn(async () => new Set()) }));
jest.mock('@/lib/display/useDisplayPreferences', () => ({ useDisplayPreferences: () => ({ preferences: { script: 'both', form: 'default' } }) }));
jest.mock('@/lib/offline/audioCache', () => ({ prefetchLessonAudio: jest.fn() }));
jest.mock('@/components/session/SessionRunner', () => ({
  SessionRunner: ({ groups, onComplete }: { groups: unknown[]; onComplete?: () => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text: RNText, Pressable } = require('react-native');
    return (
      <Pressable onPress={() => onComplete?.()}>
        <RNText>{`Session started with ${groups.length} words`}</RNText>
      </Pressable>
    );
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const LessonSession = require('../../../app/lesson/[lessonId]').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const renderRoute = () => render(<ThemeProvider><LessonSession /></ThemeProvider>);

beforeEach(() => {
  mockPush.mockReset();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('@/lib/guest/nudge').resetGuestNudgeForTests();
  mockLessonId = 'lesson-2';
  mockTier = 'free';
  mockTarget = { feature: 'lesson', key: 'lesson-2', completed: false };
  mockOpen.mockReset().mockResolvedValue(true);
  mockFetchWordGroups.mockClear();
  mockFetchTarget.mockClear();
});

it('opens the lesson through the access layer, then starts the session', async () => {
  await renderRoute();
  expect(await screen.findByText('Session started with 1 words')).toBeOnTheScreen();
  expect(mockFetchTarget).toHaveBeenCalledWith('p1', 'lesson-2');
  expect(mockOpen).toHaveBeenCalledWith('lesson', 'lesson-2', { completed: false });
});

it('a completed lesson is opened as completed (always reopens)', async () => {
  mockTarget = { feature: 'lesson', key: 'lesson-2', completed: true };
  await renderRoute();
  await screen.findByText(/Session started/);
  expect(mockOpen).toHaveBeenCalledWith('lesson', 'lesson-2', { completed: true });
});

it('a phrasebook category lesson counts as that category', async () => {
  mockTarget = { feature: 'phrasebook_category', key: 'pb-greetings', completed: false };
  await renderRoute();
  await screen.findByText(/Session started/);
  expect(mockOpen).toHaveBeenCalledWith('phrasebook_category', 'pb-greetings', { completed: false });
});

it('free account at the limit: the Premium gate, and the words are never requested', async () => {
  mockOpen.mockResolvedValue(false);
  await renderRoute();
  expect(await screen.findByText(/used your 5 free lessons/i)).toBeOnTheScreen();
  expect(screen.getByText('See Premium plans')).toBeOnTheScreen();
  expect(screen.queryByText(/Session started/)).toBeNull();
  expect(mockFetchWordGroups).not.toHaveBeenCalled();
});

it('guest at the limit: the create-account prompt, nothing fetched', async () => {
  mockTier = 'guest';
  mockOpen.mockResolvedValue(false);
  await renderRoute();
  expect(await screen.findByText('Create a free account to keep learning')).toBeOnTheScreen();
  expect(mockFetchWordGroups).not.toHaveBeenCalled();
});

it('an unknown (or not-in-preview) lesson is not available, nothing fetched or counted', async () => {
  mockTarget = null;
  await renderRoute();
  expect(await screen.findByText(/isn.t available/i)).toBeOnTheScreen();
  expect(mockOpen).not.toHaveBeenCalled();
  expect(mockFetchWordGroups).not.toHaveBeenCalled();
});

it('if access can’t be checked, an explicit error — never the lesson', async () => {
  mockOpen.mockRejectedValue(new Error('offline'));
  await renderRoute();
  expect(await screen.findByText(/couldn.t check/i)).toBeOnTheScreen();
  expect(mockFetchWordGroups).not.toHaveBeenCalled();
});

describe('the guest nudge after finishing a lesson', () => {
  it('guest: once per launch, "Create a free account to keep learning" — never blocks', async () => {
    mockTier = 'guest';
    await renderRoute();
    await fireEvent.press(await screen.findByText(/Session started/));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/guest/create-account', params: { reason: 'keep-learning' } });

    mockPush.mockReset();
    await renderRoute();
    await fireEvent.press(await screen.findByText(/Session started/));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('a signed-in learner is never nudged', async () => {
    await renderRoute();
    await fireEvent.press(await screen.findByText(/Session started/));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('/words/[lessonId] uses the same check', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const WordList = require('../../../app/words/[lessonId]').default;

  it('at the limit shows the gate and never loads the words', async () => {
    mockOpen.mockResolvedValue(false);
    await render(<ThemeProvider><WordList /></ThemeProvider>);
    expect(await screen.findByText(/used your 5 free lessons/i)).toBeOnTheScreen();
    expect(mockFetchWordGroups).not.toHaveBeenCalled();
  });

  it('when open, loads the words', async () => {
    await render(<ThemeProvider><WordList /></ThemeProvider>);
    await screen.findAllByText(/./);
    expect(mockOpen).toHaveBeenCalledWith('lesson', 'lesson-2', { completed: false });
    expect(mockFetchWordGroups).toHaveBeenCalledWith('lesson-2');
  });
});
