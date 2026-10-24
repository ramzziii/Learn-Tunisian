// The Repeat After Me screen end to end: free limit + upgrade gate, review
// pass after the gate, Premium access, and what progress gets persisted.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

type Item = { id: string; englishMeaning: string };

const mockLoad = jest.fn();
const mockGetProgress = jest.fn();
const mockRecordItem = jest.fn();
const mockMarkCompleted = jest.fn();
const mockOpenUpgrade = jest.fn();
let mockPremium = { isPremium: false, isResolved: true };
const mockProfile = { id: 'p1', track: 'adult' };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true } }));
jest.mock('@/lib/account/ActiveProfileContext', () => ({ useActiveProfile: () => ({ activeProfile: mockProfile }) }));
jest.mock('@/lib/premium/PremiumContext', () => ({ usePremium: () => mockPremium }));
jest.mock('@/data/repeatAfterMe', () => ({ loadRepeatAfterMeSession: (...a: unknown[]) => mockLoad(...a) }));
jest.mock('@/lib/repeatAfterMe/progress', () => ({
  getRepeatAfterMeProgress: (...a: unknown[]) => mockGetProgress(...a),
  recordRepeatAfterMeItemResult: (...a: unknown[]) => mockRecordItem(...a),
  markRepeatAfterMeSessionCompleted: (...a: unknown[]) => mockMarkCompleted(...a),
}));
jest.mock('@/components/premium/Premium', () => ({
  openUpgradeFlow: () => mockOpenUpgrade(),
  PremiumBadge: () => null,
}));
// Stand-in for the per-item exercise (tested on its own).
jest.mock('@/components/repeatAfterMe/RepeatAfterMeExercise', () => ({
  RepeatAfterMeExercise: (props: {
    item: Item;
    attemptsUsed: number;
    isReview: boolean;
    notice: string | null;
    onAssess: (gotIt: boolean) => void;
    onContinue: () => void;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text, Pressable } = require('react-native');
    return (
      <>
        <Text>{`Item: ${props.item.id}${props.isReview ? ' (review)' : ''} attempts=${props.attemptsUsed}`}</Text>
        {props.notice ? (
          <Pressable onPress={props.onContinue}>
            <Text>Continue</Text>
          </Pressable>
        ) : (
          <>
            <Pressable onPress={() => props.onAssess(true)}>
              <Text>Got it</Text>
            </Pressable>
            <Pressable onPress={() => props.onAssess(false)}>
              <Text>Not yet</Text>
            </Pressable>
          </>
        )}
      </>
    );
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RepeatAfterMeScreen = require('../../../app/repeat-after-me').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const items = (n: number): Item[] => Array.from({ length: n }, (_, i) => ({ id: `v${i + 1}`, englishMeaning: `w${i + 1}` }));

const renderScreen = () =>
  render(
    <ThemeProvider>
      <RepeatAfterMeScreen />
    </ThemeProvider>
  );

const gotIt = async () => fireEvent.press(await screen.findByText('Got it'));
const notYet = async () => fireEvent.press(await screen.findByText('Not yet'));

beforeEach(() => {
  mockPremium = { isPremium: false, isResolved: true };
  mockLoad.mockReset();
  mockGetProgress.mockReset().mockResolvedValue({ items: {}, sessionsCompleted: 0, lastCompletedAt: null });
  mockRecordItem.mockReset().mockResolvedValue(undefined);
  mockMarkCompleted.mockReset().mockResolvedValue(undefined);
  mockOpenUpgrade.mockReset();
});

it('loads with the learner’s saved progress and their entitlement', async () => {
  const saved = { items: { v1: { attempts: 1, lastResult: 'correct', lastPracticedAt: 'x' } }, sessionsCompleted: 1, lastCompletedAt: 'x' };
  mockGetProgress.mockResolvedValue(saved);
  mockLoad.mockResolvedValue({ items: items(1), lockedCount: 0 });

  await renderScreen();

  await waitFor(() => expect(mockLoad).toHaveBeenCalledWith({ isPremium: false, progress: saved.items }));
});

it('waits for the entitlement to resolve before loading (no free-limit flash for Premium/admins)', async () => {
  mockPremium = { isPremium: false, isResolved: false };
  mockLoad.mockResolvedValue({ items: items(1), lockedCount: 0 });

  await renderScreen();

  expect(mockLoad).not.toHaveBeenCalled();
});

it('free: five items, then the upgrade screen instead of a sixth', async () => {
  mockLoad.mockResolvedValue({ items: items(5), lockedCount: 3 });
  await renderScreen();

  for (let i = 1; i <= 5; i++) {
    expect(await screen.findByText(new RegExp(`^Item: v${i} `))).toBeOnTheScreen();
    await gotIt();
  }

  expect(await screen.findByText(/3 more with Premium/)).toBeOnTheScreen();
  expect(screen.queryByText(/^Item: v6/)).toBeNull();
  await fireEvent.press(screen.getByText('See Premium plans'));
  expect(mockOpenUpgrade).toHaveBeenCalled();
});

it('free: after the upgrade screen, items missed this session still get their review try', async () => {
  mockLoad.mockResolvedValue({ items: items(5), lockedCount: 2 });
  await renderScreen();

  await notYet();
  await notYet();
  await notYet();
  await fireEvent.press(await screen.findByText('Continue')); // "we'll revisit this later"
  for (let i = 0; i < 4; i++) await gotIt();

  await fireEvent.press(await screen.findByText('Continue to review'));
  expect(await screen.findByText('Item: v1 (review) attempts=3')).toBeOnTheScreen();
  await gotIt();

  expect(await screen.findByText(/Session complete/)).toBeOnTheScreen();
});

it('Premium: every item, no upgrade screen', async () => {
  mockPremium = { isPremium: true, isResolved: true };
  mockLoad.mockResolvedValue({ items: items(7), lockedCount: 0 });
  await renderScreen();

  for (let i = 0; i < 7; i++) await gotIt();

  expect(await screen.findByText(/Session complete/)).toBeOnTheScreen();
  expect(screen.queryByText('See Premium plans')).toBeNull();
  expect(mockLoad).toHaveBeenCalledWith(expect.objectContaining({ isPremium: true }));
});

it('persists each item’s attempts and self-reported result, and the session completion', async () => {
  mockPremium = { isPremium: true, isResolved: true };
  mockLoad.mockResolvedValue({ items: items(2), lockedCount: 0 });
  await renderScreen();

  await notYet(); // v1 attempt 1
  await gotIt(); // v1 attempt 2 → correct
  await notYet();
  await notYet();
  await notYet(); // v2 missed after 3
  await fireEvent.press(await screen.findByText('Continue'));
  await notYet(); // v2 review → still needs review

  await screen.findByText(/Session complete/);
  expect(mockRecordItem.mock.calls).toEqual([
    ['p1', 'v1', { attempts: 2, result: 'correct' }],
    ['p1', 'v2', { attempts: 3, result: 'needs_review' }],
    ['p1', 'v2', { attempts: 1, result: 'needs_review' }],
  ]);
  expect(mockMarkCompleted).toHaveBeenCalledTimes(1);
  expect(mockMarkCompleted).toHaveBeenCalledWith('p1');
  expect(screen.getByText(/1 of 2/)).toBeOnTheScreen(); // got right
});

it('nothing published yet → a clear empty state', async () => {
  mockLoad.mockResolvedValue({ items: [], lockedCount: 0 });
  await renderScreen();
  expect(await screen.findByText(/No recordings yet/)).toBeOnTheScreen();
});

it('a load failure shows an error with retry, not an empty section', async () => {
  mockLoad.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ items: items(1), lockedCount: 0 });
  await renderScreen();

  await fireEvent.press(await screen.findByText('Try again'));

  expect(await screen.findByText(/^Item: v1 /)).toBeOnTheScreen();
});
