// Reviewer membership from the client: the app can only ask whether the
// signed-in user is a reviewer (is_reviewer() takes no arguments), and a
// failed lookup is an error, never "yes". submitReview surfaces the review
// function's own error message.
const mockRpc = jest.fn();
const mockInvoke = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchIsReviewer } = require('@/data/reviewers');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { submitReview } = require('@/data/corrections');

beforeEach(() => {
  mockRpc.mockReset();
  mockInvoke.mockReset();
});

describe('fetchIsReviewer', () => {
  it('asks only about the signed-in user — no user id is sent', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    await expect(fetchIsReviewer()).resolves.toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('is_reviewer');
    expect(mockRpc.mock.calls[0]).toHaveLength(1);
  });

  it('anything but an explicit true is "not a reviewer"', async () => {
    for (const data of [false, null, 'true', 1]) {
      mockRpc.mockResolvedValueOnce({ data, error: null });
      await expect(fetchIsReviewer()).resolves.toBe(false);
    }
  });

  it('a failed lookup throws instead of answering', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network' } });
    await expect(fetchIsReviewer()).rejects.toBeTruthy();
  });
});

describe('submitReview', () => {
  const decision = {
    correctionId: 'c1',
    action: 'approve',
    targetTable: 'phrase',
    tunisianText: 'aslema',
    englishText: 'hello',
    transliteration: 'aslema',
    reviewerName: 'R',
  };

  it('sends the decision to talk-review', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    await submitReview(decision);
    expect(mockInvoke).toHaveBeenCalledWith('talk-review', { body: decision });
  });

  it('shows the function’s own message for a refused review (e.g. 403)', async () => {
    // supabase-js puts the function's HTTP response on error.context.
    const context = {
      status: 403,
      json: async () => ({ error: { kind: 'forbidden', message: 'Only approved language reviewers can review content.' } }),
    };
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context } });

    await expect(submitReview(decision)).rejects.toThrow('Only approved language reviewers can review content.');
  });

  it('falls back to the generic error when the body isn’t readable', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Failed to send a request to the Edge Function' } });
    await expect(submitReview(decision)).rejects.toThrow('Failed to send a request to the Edge Function');
  });
});
