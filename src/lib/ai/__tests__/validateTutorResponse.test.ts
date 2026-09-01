import { validateTutorResponse } from '@/lib/ai/validateTutorResponse';

const MINIMAL_VALID = {
  tunisian: 'عسلامة!',
  english: 'Hello!',
  continueConversation: true,
};

describe('validateTutorResponse', () => {
  it('accepts a minimal valid response', () => {
    const result = validateTutorResponse(MINIMAL_VALID);
    expect(result).toEqual({
      tunisian: 'عسلامة!',
      english: 'Hello!',
      transliteration: undefined,
      correction: null,
      suggestedReplies: undefined,
      continueConversation: true,
    });
  });

  it('accepts a fully populated response', () => {
    const raw = {
      tunisian: 'قريب!',
      english: 'Close!',
      transliteration: '9rib!',
      correction: { original: 'أنا يحب', corrected: 'أنا نحب', explanation: 'use "n-" for "I" in Tunisian' },
      suggestedReplies: [{ tunisian: 'نحب قهوة', english: 'I want coffee' }],
      continueConversation: true,
    };
    expect(validateTutorResponse(raw)).toEqual(raw);
  });

  it('rejects null and non-object input', () => {
    expect(validateTutorResponse(null)).toBeNull();
    expect(validateTutorResponse('a string')).toBeNull();
    expect(validateTutorResponse(42)).toBeNull();
    expect(validateTutorResponse(undefined)).toBeNull();
  });

  it('rejects a response missing required fields', () => {
    expect(validateTutorResponse({ english: 'Hello!', continueConversation: true })).toBeNull();
    expect(validateTutorResponse({ tunisian: 'x', continueConversation: true })).toBeNull();
    expect(validateTutorResponse({ tunisian: 'x', english: 'y' })).toBeNull();
  });

  it('rejects empty-string required fields (an AI returning "" is not a valid reply)', () => {
    expect(validateTutorResponse({ ...MINIMAL_VALID, tunisian: '' })).toBeNull();
    expect(validateTutorResponse({ ...MINIMAL_VALID, tunisian: '   ' })).toBeNull();
  });

  it('rejects a non-boolean continueConversation', () => {
    expect(validateTutorResponse({ ...MINIMAL_VALID, continueConversation: 'true' })).toBeNull();
  });

  it('rejects a malformed correction object rather than silently dropping it', () => {
    expect(validateTutorResponse({ ...MINIMAL_VALID, correction: { original: 'x' } })).toBeNull();
  });

  it('accepts an explicit null correction', () => {
    const result = validateTutorResponse({ ...MINIMAL_VALID, correction: null });
    expect(result?.correction).toBeNull();
  });

  it('rejects malformed suggestedReplies entries', () => {
    expect(validateTutorResponse({ ...MINIMAL_VALID, suggestedReplies: [{ tunisian: 'x' }] })).toBeNull();
    expect(validateTutorResponse({ ...MINIMAL_VALID, suggestedReplies: 'not an array' })).toBeNull();
  });

  it('accepts an empty suggestedReplies array', () => {
    const result = validateTutorResponse({ ...MINIMAL_VALID, suggestedReplies: [] });
    expect(result?.suggestedReplies).toEqual([]);
  });

  it('rejects a response wrapped in markdown code fences (a common AI failure mode) rather than trying to unwrap it', () => {
    // Callers are responsible for JSON.parse before this is called — this just
    // documents that a raw string, even valid-looking JSON text, is not accepted.
    expect(validateTutorResponse('```json\n{"tunisian":"x"}\n```')).toBeNull();
  });
});
