// Persisted Repeat After Me progress: attempts, learner-reported results and
// session completion, per profile — and never any audio.
const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockStore.get(key) ?? null,
    setItem: async (key: string, value: string) => void mockStore.set(key, value),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const progress = require('@/lib/repeatAfterMe/progress');

beforeEach(() => mockStore.clear());

it('starts empty', async () => {
  await expect(progress.getRepeatAfterMeProgress('p1')).resolves.toEqual({
    items: {},
    sessionsCompleted: 0,
    lastCompletedAt: null,
  });
});

it('records attempts and the learner-reported result per item, accumulating attempts across sessions', async () => {
  await progress.recordRepeatAfterMeItemResult('p1', 'v1', { attempts: 3, result: 'needs_review' });
  await progress.recordRepeatAfterMeItemResult('p1', 'v1', { attempts: 1, result: 'correct' });

  const saved = await progress.getRepeatAfterMeProgress('p1');
  expect(saved.items.v1).toMatchObject({ attempts: 4, lastResult: 'correct' });
  expect(Date.parse(saved.items.v1.lastPracticedAt)).not.toBeNaN();
});

it('counts completed sessions', async () => {
  await progress.markRepeatAfterMeSessionCompleted('p1');
  await progress.markRepeatAfterMeSessionCompleted('p1');

  const saved = await progress.getRepeatAfterMeProgress('p1');
  expect(saved.sessionsCompleted).toBe(2);
  expect(saved.lastCompletedAt).not.toBeNull();
});

it('is kept per profile', async () => {
  await progress.recordRepeatAfterMeItemResult('p1', 'v1', { attempts: 1, result: 'correct' });
  expect((await progress.getRepeatAfterMeProgress('p2')).items).toEqual({});
});

it('stores no audio, file paths, or recording URIs', async () => {
  await progress.recordRepeatAfterMeItemResult('p1', 'v1', { attempts: 2, result: 'correct' });
  await progress.markRepeatAfterMeSessionCompleted('p1');

  const raw = [...mockStore.values()].join('');
  expect(raw).not.toMatch(/file:|blob:|\.m4a|\.webm|uri/i);
});

it('survives corrupt stored data', async () => {
  mockStore.set('learn-tunisian.repeat-after-me-progress.p1', '{not json');
  await expect(progress.getRepeatAfterMeProgress('p1')).resolves.toMatchObject({ items: {}, sessionsCompleted: 0 });
});
