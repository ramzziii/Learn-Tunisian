import { sortReviewCandidates, type ReviewCandidate } from '@/lib/reviewSelection';

function candidate(overrides: Partial<ReviewCandidate>): ReviewCandidate {
  return {
    wordGroupId: 'word',
    nextReviewAt: '2026-01-01T00:00:00.000Z',
    consecutiveIncorrect: 0,
    correctCount: 0,
    ...overrides,
  };
}

describe('sortReviewCandidates', () => {
  it('puts the most overdue item (oldest next_review_at) first', () => {
    const veryOverdue = candidate({ wordGroupId: 'old', nextReviewAt: '2026-01-01T00:00:00.000Z' });
    const justDue = candidate({ wordGroupId: 'new', nextReviewAt: '2026-01-03T00:00:00.000Z' });
    const sorted = sortReviewCandidates([justDue, veryOverdue]);
    expect(sorted.map((c) => c.wordGroupId)).toEqual(['old', 'new']);
  });

  it('breaks ties on due date by most consecutive incorrect answers', () => {
    const struggling = candidate({ wordGroupId: 'struggling', consecutiveIncorrect: 3 });
    const fine = candidate({ wordGroupId: 'fine', consecutiveIncorrect: 0 });
    const sorted = sortReviewCandidates([fine, struggling]);
    expect(sorted.map((c) => c.wordGroupId)).toEqual(['struggling', 'fine']);
  });

  it('breaks remaining ties by lowest mastery (correct_count)', () => {
    const lowMastery = candidate({ wordGroupId: 'low', correctCount: 1 });
    const highMastery = candidate({ wordGroupId: 'high', correctCount: 5 });
    const sorted = sortReviewCandidates([highMastery, lowMastery]);
    expect(sorted.map((c) => c.wordGroupId)).toEqual(['low', 'high']);
  });

  it('applies the full priority order together: overdue > incorrect > mastery', () => {
    const items: ReviewCandidate[] = [
      candidate({ wordGroupId: 'due-today-low-mastery', nextReviewAt: '2026-01-02T00:00:00.000Z', correctCount: 0 }),
      candidate({ wordGroupId: 'most-overdue', nextReviewAt: '2026-01-01T00:00:00.000Z' }),
      candidate({
        wordGroupId: 'due-today-struggling',
        nextReviewAt: '2026-01-02T00:00:00.000Z',
        consecutiveIncorrect: 2,
      }),
    ];
    const sorted = sortReviewCandidates(items);
    expect(sorted.map((c) => c.wordGroupId)).toEqual([
      'most-overdue',
      'due-today-struggling',
      'due-today-low-mastery',
    ]);
  });

  it('does not mutate the input array', () => {
    const items = [candidate({ wordGroupId: 'b', nextReviewAt: '2026-01-02T00:00:00.000Z' }), candidate({ wordGroupId: 'a', nextReviewAt: '2026-01-01T00:00:00.000Z' })];
    const original = [...items];
    sortReviewCandidates(items);
    expect(items).toEqual(original);
  });

  it('returns an empty array unchanged', () => {
    expect(sortReviewCandidates([])).toEqual([]);
  });
});
