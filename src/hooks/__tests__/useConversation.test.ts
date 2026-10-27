// Talk to a Tunisian is available to every learner now (the app is 18+, so
// the old under-13 block is gone): starting a conversation loads its grounding
// and asks the AI tutor for the opening turn, for any profile.
import { act, renderHook } from '@testing-library/react-native';

const mockGenerateReply = jest.fn();
const mockFetchLevel = jest.fn();
const mockFetchVocabulary = jest.fn();
const mockFetchContext = jest.fn();

jest.mock('@/lib/ai', () => ({ aiProvider: { generateReply: (...a: unknown[]) => mockGenerateReply(...a) } }));
jest.mock('@/data/talkContext', () => ({
  fetchTalkLevel: (...a: unknown[]) => mockFetchLevel(...a),
  fetchScenarioVocabulary: (...a: unknown[]) => mockFetchVocabulary(...a),
  fetchLearnerContext: (...a: unknown[]) => mockFetchContext(...a),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useConversation } = require('@/hooks/useConversation');

const reply = { tunisian: 'ahla', english: 'hello', transliteration: 'ahla', suggestedReplies: [] };

beforeEach(() => {
  mockFetchLevel.mockReset().mockResolvedValue('beginner');
  mockFetchVocabulary.mockReset().mockResolvedValue([]);
  mockFetchContext.mockReset().mockResolvedValue({ level: 'beginner', knownWords: [], strugglingWords: [] });
  mockGenerateReply.mockReset().mockResolvedValue({ ok: true, response: reply });
});

it('loads the grounding and the tutor’s opening turn — no per-profile block', async () => {
  const { result } = await renderHook(() => useConversation('cafe', 'p1'));
  await act(async () => {});

  expect(mockFetchContext).toHaveBeenCalledWith('p1', 'beginner');
  expect(mockGenerateReply).toHaveBeenCalledTimes(1);
  expect(mockGenerateReply.mock.calls[0][0].learnerContext).not.toHaveProperty('track');
  expect(result.current.status).not.toBe('error');
  expect(result.current.messages[0]).toMatchObject({ role: 'tutor' });
});

it('sending a message asks the tutor again with it', async () => {
  const { result } = await renderHook(() => useConversation('cafe', 'p1'));
  await act(async () => {});

  await act(async () => result.current.sendMessage('  sbah el khir  '));

  expect(mockGenerateReply).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(mockGenerateReply.mock.calls[1][0])).toContain('sbah el khir');
});
