// Talk stays visible to everyone but only Premium can use it:
// - Talk tab: every scenario is listed; Premium opens any of the 5 (no level
//   lock); a free account sees a Premium lock and gets the upgrade flow; a
//   guest gets the create-account explanation;
// - a Talk session route can't be reached around the lock: for a guest or a
//   free account, the conversation never starts (no AI hooks run at all).
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
let mockTier: 'guest' | 'free' | 'premium' = 'premium';
const mockUseConversation = jest.fn();
const mockUseTutorSpeech = jest.fn();
const mockUseVoiceRecorder = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ scenarioId: 'cafe' }),
}));
jest.mock('@/lib/access/AccessContext', () => ({ useAccess: () => ({ tier: mockTier, isResolved: true }) }));
const mockProfile = { activeProfile: { id: 'p1', name: 'Sam', learningGoal: null } };
jest.mock('@/lib/account/ActiveProfileContext', () => ({ useActiveProfile: () => mockProfile }));
jest.mock('@/hooks/useConversation', () => ({
  useConversation: (...a: unknown[]) => {
    mockUseConversation(...a);
    return { messages: [], isLoading: false, error: null, send: jest.fn(), start: jest.fn(), retry: jest.fn() };
  },
}));
jest.mock('@/hooks/useTutorSpeech', () => ({
  useTutorSpeech: (...a: unknown[]) => {
    mockUseTutorSpeech(...a);
    return { speak: jest.fn(), stop: jest.fn(), isSpeaking: false };
  },
}));
jest.mock('@/hooks/useVoiceRecorder', () => ({
  useVoiceRecorder: (...a: unknown[]) => {
    mockUseVoiceRecorder(...a);
    return { start: jest.fn(), stop: jest.fn(), isRecording: false, durationMillis: 0 };
  },
}));
jest.mock('@/lib/supabase/client', () => ({ supabase: { from: jest.fn(), rpc: jest.fn(), functions: { invoke: jest.fn() } } }));
jest.mock('@/lib/ai/functionsClient', () => ({ transcribeAudio: jest.fn(), fetchTtsAudio: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TalkTab = require('../../../app/(tabs)/talk').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TalkSession = require('../../../app/talk/[scenarioId]').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TALK_SCENARIOS } = require('@/constants/talkScenarios');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const themed = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);

beforeEach(() => {
  [mockPush, mockUseConversation, mockUseTutorSpeech, mockUseVoiceRecorder].forEach((m) => m.mockReset());
  mockTier = 'premium';
});

describe('Talk tab', () => {
  it('Premium: all 5 scenarios open, whatever the learner’s level', async () => {
    await themed(<TalkTab />);
    expect(TALK_SCENARIOS).toHaveLength(5);
    for (const s of TALK_SCENARIOS) {
      mockPush.mockReset();
      await fireEvent.press(await screen.findByRole('button', { name: new RegExp(`^${s.title}`) }));
      expect(mockPush).toHaveBeenCalledWith(`/talk/${s.id}`);
    }
  });

  it('free account: visible, marked Premium; tapping opens the upgrade flow, not a session', async () => {
    mockTier = 'free';
    await themed(<TalkTab />);
    expect(await screen.findByText(/Talk is part of Premium/i)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${TALK_SCENARIOS[0].title}`) }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/onboarding/plans', params: { source: 'premium' } });
    expect(mockPush).not.toHaveBeenCalledWith(expect.stringMatching(/^\/talk\//));
  });

  it('guest: visible; tapping explains it needs an account (and Premium)', async () => {
    mockTier = 'guest';
    await themed(<TalkTab />);
    await fireEvent.press(await screen.findByRole('button', { name: new RegExp(`^${TALK_SCENARIOS[0].title}`) }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/guest/create-account', params: { reason: 'talk' } });
  });
});

describe('Talk session route', () => {
  it('guest: the create-account explanation; no conversation, voice or recorder starts', async () => {
    mockTier = 'guest';
    await themed(<TalkSession />);
    expect(screen.getAllByText(/create a free account/i)[0]).toBeOnTheScreen();
    expect(mockUseConversation).not.toHaveBeenCalled();
    expect(mockUseTutorSpeech).not.toHaveBeenCalled();
    expect(mockUseVoiceRecorder).not.toHaveBeenCalled();
  });

  it('free account: the Premium lock with an upgrade action; nothing starts', async () => {
    mockTier = 'free';
    await themed(<TalkSession />);
    expect(screen.getByText(/Talk is part of Premium/i)).toBeOnTheScreen();
    expect(mockUseConversation).not.toHaveBeenCalled();
    expect(mockUseTutorSpeech).not.toHaveBeenCalled();
  });

  it('Premium: the conversation is set up as before', async () => {
    await themed(<TalkSession />);
    expect(mockUseConversation).toHaveBeenCalled();
  });
});
