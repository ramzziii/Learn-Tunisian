import type { AiProvider, ConversationRequest, GroundedVocabularyItem, SuggestedReply, TutorResponse } from '@/lib/ai/types';

const MAX_MOCK_TURNS = 6;

function buildSuggestedReplies(vocabulary: GroundedVocabularyItem[]): SuggestedReply[] {
  return vocabulary.slice(0, 3).map((item) => ({ tunisian: item.wordArabic, english: item.englishMeaning }));
}

function buildMockResponse(request: ConversationRequest): TutorResponse {
  const tutorTurnCount = request.history.filter((turn) => turn.role === 'tutor').length;
  const vocabulary = request.vocabulary;

  if (!request.learnerMessage) {
    return {
      tunisian: 'عسلامة! شنوّة تحب؟',
      english: 'Hello! What would you like?',
      transliteration: 'Aslema! Chnowa t7eb?',
      correction: null,
      suggestedReplies: buildSuggestedReplies(vocabulary),
      continueConversation: true,
    };
  }

  const primary = vocabulary[tutorTurnCount % vocabulary.length];
  const tunisian = primary ? `${primary.wordArabic}؟` : 'طيب!';
  const english = primary ? `Got it — how about "${primary.englishMeaning}"?` : 'Got it!';

  return {
    tunisian,
    english,
    correction: null,
    suggestedReplies: buildSuggestedReplies(vocabulary),
    continueConversation: tutorTurnCount < MAX_MOCK_TURNS,
  };
}

/**
 * A fully offline AI provider used by default (see aiConfig.ts) so the
 * conversation UI can be built, demoed, and tested without an AI provider
 * API key or network access at all. Grounds its (canned) replies in the
 * real scenario vocabulary passed in, so it's not just generic placeholder
 * text — swapping in the live provider later shouldn't require any UI changes.
 */
export const mockAiProvider: AiProvider = {
  async generateReply(request) {
    return { ok: true, response: buildMockResponse(request) };
  },
};
