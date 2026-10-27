import {
  createClientRequestId,
  MAX_ANSWER_FIELD_LENGTH,
  MAX_REQUEST_LENGTH,
  validateAnswer,
  validateRequestText,
} from '@/lib/translationRequests/validation';

describe('validateRequestText', () => {
  it('trims and accepts ordinary text', () => {
    expect(validateRequestText('  Where is the market?  ')).toEqual({ ok: true, text: 'Where is the market?' });
  });

  it.each(['', '   ', '\n\t'])('rejects empty text (%p)', (text) => {
    expect(validateRequestText(text)).toEqual({ ok: false, message: expect.stringMatching(/Type the English/) });
  });

  it('accepts exactly the limit and rejects one more', () => {
    expect(MAX_REQUEST_LENGTH).toBe(500);
    expect(validateRequestText('a'.repeat(500)).ok).toBe(true);
    expect(validateRequestText('a'.repeat(501))).toEqual({ ok: false, message: expect.stringMatching(/500 characters/) });
  });
});

describe('validateAnswer', () => {
  const good = { arabic: ' وين السوق؟ ', transliteration: ' win es-souk? ', english: ' Where is the market? ' };

  it('trims and accepts a complete answer', () => {
    expect(validateAnswer(good)).toEqual({
      ok: true,
      answer: { arabic: 'وين السوق؟', transliteration: 'win es-souk?', english: 'Where is the market?' },
    });
  });

  it.each(['arabic', 'transliteration', 'english'] as const)('requires %s', (field) => {
    expect(validateAnswer({ ...good, [field]: '  ' })).toEqual({ ok: false, message: expect.stringMatching(/required/i) });
  });

  it('limits each field', () => {
    expect(MAX_ANSWER_FIELD_LENGTH).toBe(500);
    expect(validateAnswer({ ...good, english: 'a'.repeat(501) })).toEqual({ ok: false, message: expect.stringMatching(/500/) });
  });
});

it('createClientRequestId makes a fresh UUID each time (the submit idempotency key)', () => {
  const a = createClientRequestId();
  const b = createClientRequestId();
  expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(a).not.toBe(b);
});
