// Flashcard decks screens: the deck list (card and due counts, a link to the
// phrasebook browse deck), a deck with nothing in it (friendly empty state),
// and Due today sharing the free plan's daily review allowance. Practice's
// Flashcards card opens the decks.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockFetchDecks = jest.fn();
const mockFetchCards = jest.fn();
const mockMarkFreeReview = jest.fn(async () => undefined);
let mockUsedFreeReview = false;
let mockIsPremium = false;
let mockDeckId = 'category-greet';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ deckId: mockDeckId }),
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useFocusEffect: (effect: () => void | (() => void)) => require('react').useEffect(effect, [effect]),
}));
const mockProfile = { activeProfile: { id: 'p1' } };
jest.mock('@/lib/account/ActiveProfileContext', () => ({ useActiveProfile: () => mockProfile }));
jest.mock('@/lib/premium/PremiumContext', () => ({ usePremium: () => ({ isPremium: mockIsPremium, isResolved: true }) }));
jest.mock('@/lib/premium/freeAllowance', () => ({
  hasUsedFreeReviewToday: jest.fn(async () => mockUsedFreeReview),
  markFreeReviewStarted: (...a: unknown[]) => mockMarkFreeReview(...(a as [])),
}));
jest.mock('@/data/flashcards', () => ({
  fetchFlashcardDecks: (...a: unknown[]) => mockFetchDecks(...a),
  fetchFlashcards: (...a: unknown[]) => mockFetchCards(...a),
}));
jest.mock('@/data/profiles', () => ({ fetchDailyGoalSettings: jest.fn(async () => ({ dailyGoalMinutes: 10 })) }));
jest.mock('@/lib/offline/audioCache', () => ({ prefetchLessonAudio: jest.fn() }));
jest.mock('@/components/flashcards/FlashcardSession', () => ({
  FlashcardSession: ({ cards, goalMinutes }: { cards: { id: string }[]; goalMinutes: number }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return <Text>{`[session ${cards.map((c) => c.id).join(',')} goal=${goalMinutes}]`}</Text>;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const DeckList = require('../../../app/flashcards/index').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DeckScreen = require('../../../app/flashcards/[deckId]').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PracticeHub = require('../../../app/(tabs)/practice').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const themed = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);

const DECKS = [
  { id: 'due', kind: 'due', title: 'Due today', cardIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'], dueCount: 12 },
  { id: 'favorites', kind: 'favorites', title: 'My favorites', cardIds: [], dueCount: 0 },
  { id: 'category-greet', kind: 'category', title: 'Greetings', cardIds: ['a', 'b'], dueCount: 1 },
];

beforeEach(() => {
  [mockPush, mockFetchDecks, mockFetchCards, mockMarkFreeReview].forEach((m) => m.mockClear());
  mockFetchDecks.mockResolvedValue(DECKS);
  mockFetchCards.mockImplementation(async (ids: string[]) => ids.map((id) => ({ id })));
  mockUsedFreeReview = false;
  mockIsPremium = false;
  mockDeckId = 'category-greet';
});

describe('deck list', () => {
  it('shows each deck with its card and due counts', async () => {
    await themed(<DeckList />);
    expect(await screen.findByText('Due today')).toBeOnTheScreen();
    expect(screen.getByText('12 cards · 12 due')).toBeOnTheScreen();
    expect(screen.getByText('My favorites')).toBeOnTheScreen();
    expect(screen.getByText('Greetings')).toBeOnTheScreen();
    expect(screen.getByText('2 cards · 1 due')).toBeOnTheScreen();
    expect(mockFetchDecks).toHaveBeenCalledWith('p1');
  });

  it('opens a deck', async () => {
    await themed(<DeckList />);
    await fireEvent.press(await screen.findByText('Greetings'));
    expect(mockPush).toHaveBeenCalledWith('/flashcards/category-greet');
  });

  it('still links to browsing every phrasebook phrase', async () => {
    await themed(<DeckList />);
    await fireEvent.press(await screen.findByText('Browse all phrasebook phrases'));
    expect(mockPush).toHaveBeenCalledWith('/phrasebook/flashcards');
  });

  it('explains where decks come from when nothing has been practised yet', async () => {
    mockFetchDecks.mockResolvedValue([
      { id: 'due', kind: 'due', title: 'Due today', cardIds: [], dueCount: 0 },
      { id: 'favorites', kind: 'favorites', title: 'My favorites', cardIds: [], dueCount: 0 },
    ]);
    await themed(<DeckList />);
    expect(await screen.findByText(/words you practise in lessons/i)).toBeOnTheScreen();
  });
});

describe('a deck', () => {
  it('loads its cards and starts a session with the saved daily goal', async () => {
    await themed(<DeckScreen />);
    expect(await screen.findByText('[session a,b goal=10]')).toBeOnTheScreen();
    expect(mockFetchCards).toHaveBeenCalledWith(['a', 'b']);
  });

  it('an empty deck shows a friendly empty state, not a session', async () => {
    mockDeckId = 'favorites';
    await themed(<DeckScreen />);
    expect(await screen.findByText('No favorites yet')).toBeOnTheScreen();
    expect(screen.queryByText(/\[session/)).toBeNull();
    expect(mockFetchCards).not.toHaveBeenCalled();
  });

  it('Due today with nothing due says you’re caught up', async () => {
    mockDeckId = 'due';
    mockFetchDecks.mockResolvedValue([{ id: 'due', kind: 'due', title: 'Due today', cardIds: [], dueCount: 0 }]);
    await themed(<DeckScreen />);
    expect(await screen.findByText('All caught up')).toBeOnTheScreen();
  });

  it('free plan: Due today uses the day’s free review — up to 10 cards, and marks it used', async () => {
    mockDeckId = 'due';
    await themed(<DeckScreen />);
    expect(await screen.findByText('[session a,b,c,d,e,f,g,h,i,j goal=10]')).toBeOnTheScreen();
    expect(mockMarkFreeReview).toHaveBeenCalledWith('p1');
  });

  it('free plan: once today’s free review is used, Due today says so', async () => {
    mockDeckId = 'due';
    mockUsedFreeReview = true;
    await themed(<DeckScreen />);
    expect(await screen.findByText(/used today's free review/i)).toBeOnTheScreen();
    expect(mockFetchCards).not.toHaveBeenCalled();
  });

  it('free plan: category and favorites decks aren’t limited', async () => {
    mockUsedFreeReview = true;
    await themed(<DeckScreen />);
    expect(await screen.findByText('[session a,b goal=10]')).toBeOnTheScreen();
    expect(mockMarkFreeReview).not.toHaveBeenCalled();
  });

  it('Premium: Due today is unlimited', async () => {
    mockDeckId = 'due';
    mockIsPremium = true;
    await themed(<DeckScreen />);
    expect(await screen.findByText('[session a,b,c,d,e,f,g,h,i,j,k,l goal=10]')).toBeOnTheScreen();
    expect(mockMarkFreeReview).not.toHaveBeenCalled();
  });

  it('a deck that no longer exists explains itself', async () => {
    mockDeckId = 'category-gone';
    await themed(<DeckScreen />);
    expect(await screen.findByText('Deck not found')).toBeOnTheScreen();
  });
});

it('Practice → Flashcards opens the decks', async () => {
  await themed(<PracticeHub />);
  await fireEvent.press(screen.getByText('Flashcards'));
  expect(mockPush).toHaveBeenCalledWith('/flashcards');
});
