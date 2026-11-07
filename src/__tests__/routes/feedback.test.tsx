// Profile → Send feedback (0029): signed-in accounts send a note (with the
// screen it came from and the app version); guests are asked to create a
// free account; a refusal is shown in plain words. Admin → Feedback lists
// the notes and marks them read.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockSend = jest.fn();
const mockFetchFeedback = jest.fn();
const mockMarkRead = jest.fn();
let mockTier: 'guest' | 'free' = 'free';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ from: '/profile' }),
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0' } } }));
jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));
jest.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'acc-1' } } }) }));
jest.mock('@/lib/access/AccessContext', () => ({ useAccess: () => ({ tier: mockTier, isResolved: true }) }));
jest.mock('@/data/feedback', () => ({
  ...jest.requireActual('@/data/feedback'),
  sendFeedback: (...a: unknown[]) => mockSend(...a),
}));
jest.mock('@/data/admin/feedback', () => ({
  fetchFeedback: (...a: unknown[]) => mockFetchFeedback(...a),
  markFeedbackRead: (...a: unknown[]) => mockMarkRead(...a),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Feedback = require('../../../app/feedback').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdminFeedback = require('../../../app/admin/feedback').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');
const themed = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);

beforeEach(() => {
  mockTier = 'free';
  mockSend.mockReset().mockResolvedValue(undefined);
  mockMarkRead.mockReset().mockResolvedValue(undefined);
  mockFetchFeedback.mockReset().mockResolvedValue([
    { id: 'f1', message: 'The audio is quiet', screen: '/profile', appVersion: '1.0.0', createdAt: '2026-11-07T10:00:00Z', readAt: null },
  ]);
});

describe('Send feedback', () => {
  it('sends the note with where it came from and the app version, then thanks you', async () => {
    await themed(<Feedback />);
    await fireEvent.changeText(screen.getByLabelText('Your feedback'), '  The audio is quiet  ');
    await fireEvent.press(screen.getByText('Send'));
    expect(mockSend).toHaveBeenCalledWith({ accountId: 'acc-1', message: '  The audio is quiet  ', screen: '/profile', appVersion: '1.0.0' });
    expect(await screen.findByText('Thank you!')).toBeOnTheScreen();
  });

  it('too many today: says so in plain words, keeps the note', async () => {
    mockSend.mockRejectedValue(new Error('feedback_limit'));
    await themed(<Feedback />);
    await fireEvent.changeText(screen.getByLabelText('Your feedback'), 'again');
    await fireEvent.press(screen.getByText('Send'));
    expect(await screen.findByText(/sent a lot of notes today/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Your feedback').props.value).toBe('again');
  });

  it('guests are asked to create a free account (they never write to the server)', async () => {
    mockTier = 'guest';
    await themed(<Feedback />);
    expect(screen.getByText('This needs an account')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Your feedback')).toBeNull();
  });
});

describe('Admin → Feedback', () => {
  it('lists notes with where they came from, and marks one read', async () => {
    await themed(<AdminFeedback />);
    expect(await screen.findByText('The audio is quiet')).toBeOnTheScreen();
    expect(screen.getByText('1 unread')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Mark as read'));
    expect(mockMarkRead).toHaveBeenCalledWith('f1');
    expect(await screen.findByText('All read')).toBeOnTheScreen();
  });
});
