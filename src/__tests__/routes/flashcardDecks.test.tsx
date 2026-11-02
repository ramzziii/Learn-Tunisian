// Flashcard decks screens: the deck list (card and due counts, a link to the
// phrasebook browse deck), a deck with nothing in it (friendly empty state),
// decks built only from the practice scope (open lessons / categories).
// Practice's Flashcards card opens the decks.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockFetchDecks = jest.fn();
const mockFetchCards = jest.fn();
let mockIsPremium = false;
const mockScopeState = { scope: { all: true, lessonKeys: new Set(), unitIds: new Set() }, error: false, reload: jest.fn() };
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
jest.mock('@/lib/access/usePracticeScope', () => ({ usePracticeScope: () => mockScopeState }));
jest.mock('@/lib/access/AccessContext', () => ({
  useAccess: () => ({ tier: mockIsPremium ? 'premium' : 'free', isResolved: true }),
}));
jest.mock('@/data/flashcards', () => ({
  fetchFlashcardDecks: (...a: unknown[]) => mockFetchDecks(...a),
  fetchFlashcards: (...a: unknown[]) => mockFetchCards(...a),
}));
jest.mock('@/data/profiles', () => ({ fetchDailyGoalSettings: jest.fn(async () => ({ dailyGoalMinutes: 10 })) }));
jest.mock('@/lib/offline/audioCache', () => ({ prefetchLessonAudio: jest.fn() }));
jest.mock('@/components/flashcards/FlashcardSession', () => ({
  FlashcardSession: ({
    cards,
    distractorPool,
    goalMinutes,
  }: {
    cards: { id: string }[];
    distractorPool: { id: string }[];
    goalMinutes: number;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return (
      <Text>{`[session ${cards.map((c) => c.id).join(',')} goal=${goalMinutes} pool=${distractorPool.length}]`}</Text>
    );
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
  { id: 'favorites', kind: 'favorites', title: 'My favorites', cardIds: [], dueCount: 0 },
  { id: 'category-greet', kind: 'category', title: 'Greetings', cardIds: ['a', 'b'], dueCount: 1 },
  { id: 'category-food', kind: 'category', title: 'Food', cardIds: ['c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n'], dueCount: 0 },
];

beforeEach(() => {
  [mockPush, mockFetchDecks, mockFetchCards].forEach((m) => m.mockClear());
  mockFetchDecks.mockResolvedValue(DECKS);
  mockFetchCards.mockImplementation(async (ids: string[]) => ids.map((id) => ({ id })));
  mockIsPremium = false;
  mockDeckId = 'category-greet';
});

describe('deck list', () => {
  it('shows the favorites and category decks with their card and due counts — no Due today deck', async () => {
    await themed(<DeckList />);
    expect(await screen.findByText('My favorites')).toBeOnTheScreen();
    expect(screen.queryByText('Due today')).toBeNull();
    expect(screen.getByText('12 cards · 0 due')).toBeOnTheScreen();
    expect(screen.getByText('Greetings')).toBeOnTheScreen();
    expect(screen.getByText('2 cards · 1 due')).toBeOnTheScreen();
    expect(mockFetchDecks).toHaveBeenCalledWith('p1', mockScopeState.scope);
  });

  it('opens a deck', async () => {
    await themed(<DeckList />);
    await fireEvent.press(await screen.findByText('Greetings'));
    expect(mockPush).toHaveBeenCalledWith('/flashcards/category-greet');
  });

  it('links to the Phrasebook browse cards, a separate flow', async () => {
    await themed(<DeckList />);
    await fireEvent.press(await screen.findByRole('button', { name: /^Phrase cards — listen and browse/ }));
    expect(mockPush).toHaveBeenCalledWith('/phrasebook/flashcards');
  });

  it('links to the full saved-words list', async () => {
    await themed(<DeckList />);
    await fireEvent.press(await screen.findByRole('button', { name: /^Saved words/ }));
    expect(mockPush).toHaveBeenCalledWith('/favorites');
  });

  it('no copy about sharing Review’s daily allowance', async () => {
    await themed(<DeckList />);
    await screen.findByText('My favorites');
    expect(screen.queryByText(/allowance|Due today/i)).toBeNull();
  });

  it('explains where decks come from when nothing has been practised yet', async () => {
    mockFetchDecks.mockResolvedValue([{ id: 'favorites', kind: 'favorites', title: 'My favorites', cardIds: [], dueCount: 0 }]);
    await themed(<DeckList />);
    expect(await screen.findByText(/words you practise in lessons/i)).toBeOnTheScreen();
  });
});

describe('a deck', () => {
  it('loads its cards and starts a session with the saved daily goal', async () => {
    await themed(<DeckScreen />);
    expect(await screen.findByText('[session a,b goal=10 pool=14]')).toBeOnTheScreen();
  });

  it('wrong answers come from every word in the learner’s decks — nothing they haven’t met', async () => {
    await themed(<DeckScreen />);
    await screen.findByText(/\[session/);
    expect(mockFetchCards).toHaveBeenCalledTimes(1);
    expect(mockFetchCards).toHaveBeenCalledWith(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n']);
  });

  it('an empty deck shows a friendly empty state, not a session', async () => {
    mockDeckId = 'favorites';
    await themed(<DeckScreen />);
    expect(await screen.findByText('No favorites yet')).toBeOnTheScreen();
    expect(screen.queryByText(/\[session/)).toBeNull();
    expect(mockFetchCards).not.toHaveBeenCalled();
  });

  it('decks aren’t limited on the free plan and never use up Review’s daily allowance', async () => {
    mockDeckId = 'category-food';
    await themed(<DeckScreen />);
    expect(await screen.findByText('[session c,d,e,f,g,h,i,j,k,l,m,n goal=10 pool=14]')).toBeOnTheScreen();
  });

  it('an old link to the removed Due today deck explains itself (Review is the place for due words)', async () => {
    mockDeckId = 'due';
    await themed(<DeckScreen />);
    expect(await screen.findByText('Deck not found')).toBeOnTheScreen();
    expect(mockFetchCards).not.toHaveBeenCalled();
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
