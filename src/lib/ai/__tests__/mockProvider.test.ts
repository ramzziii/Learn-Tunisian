import { mockAiProvider } from '@/lib/ai/mockProvider';
import { validateTutorResponse } from '@/lib/ai/validateTutorResponse';
import type { ConversationRequest, ConversationTurn, GroundedVocabularyItem } from '@/lib/ai/types';

function vocabItem(wordArabic: string, englishMeaning: string): GroundedVocabularyItem {
  return {
    wordGroupId: englishMeaning,
    englishMeaning,
    wordArabic,
    transliteration: englishMeaning,
    variantLabel: 'primary',
    nativeVerified: false,
  };
}

const vocabulary = [vocabItem('ما', 'water'), vocabItem('حليب', 'milk')];

function request(overrides: Partial<ConversationRequest>): ConversationRequest {
  return {
    scenarioId: 'cafe',
    profileId: 'profile-1',
    vocabulary,
    learnerContext: { track: 'adult', level: 'beginner', knownWords: [], strugglingWords: [] },
    history: [],
    learnerMessage: null,
    retrievalQuery: 'water',
    ...overrides,
  };
}

describe('mockAiProvider', () => {
  it('always succeeds — the mock never simulates a provider failure', async () => {
    const result = await mockAiProvider.generateReply(request({}));
    expect(result.ok).toBe(true);
  });

  it('always returns a response that passes the same validator the live provider uses', async () => {
    const result = await mockAiProvider.generateReply(request({}));
    if (!result.ok) throw new Error('expected ok');
    expect(validateTutorResponse(result.response)).not.toBeNull();
  });

  it('opens with a greeting when there is no learner message yet', async () => {
    const result = await mockAiProvider.generateReply(request({ learnerMessage: null, history: [] }));
    if (!result.ok) throw new Error('expected ok');
    expect(result.response.continueConversation).toBe(true);
    expect(result.response.suggestedReplies?.length).toBeGreaterThan(0);
  });

  it('grounds suggested replies in the vocabulary that was actually passed in', async () => {
    const result = await mockAiProvider.generateReply(request({}));
    if (!result.ok) throw new Error('expected ok');
    const suggested = result.response.suggestedReplies ?? [];
    for (const reply of suggested) {
      expect(vocabulary.some((v) => v.wordArabic === reply.tunisian)).toBe(true);
    }
  });

  it('eventually ends the conversation rather than continuing forever', async () => {
    let history: ConversationTurn[] = [];
    let continued = true;
    for (let i = 0; i < 20 && continued; i++) {
      const result = await mockAiProvider.generateReply(
        request({ history, learnerMessage: i === 0 ? null : 'ok' })
      );
      if (!result.ok) throw new Error('expected ok');
      history = [...history, { role: 'tutor', text: result.response.tunisian }];
      continued = result.response.continueConversation;
    }
    expect(continued).toBe(false);
  });

  it('produces no correction (mock never simulates one)', async () => {
    const result = await mockAiProvider.generateReply(request({ learnerMessage: 'نحب قهوة' }));
    if (!result.ok) throw new Error('expected ok');
    expect(result.response.correction).toBeNull();
  });

  it('omits suggestedReplies at the advanced level, matching the live prompt rules', async () => {
    const result = await mockAiProvider.generateReply(
      request({ learnerContext: { track: 'adult', level: 'advanced', knownWords: [], strugglingWords: [] } })
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.response.suggestedReplies).toBeUndefined();
  });
});
