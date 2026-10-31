// The lesson/review session's exercise stream: what a learner is actually
// asked, in what order, and whether the session can run out mid-goal.
import { act, renderHook } from '@testing-library/react-native';

import { useExerciseQueue } from '@/hooks/useExerciseQueue';
import type { WordGroupWithVariants } from '@/types/models';

function group(id: string): WordGroupWithVariants {
  return {
    id,
    unitId: 'u1',
    lessonNumber: 1,
    englishMeaning: `meaning ${id}`,
    imageKeyword: null,
    imagePath: null,
    sortOrder: 0,
    contentStatus: 'approved',
    createdBy: null,
    updatedBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    variants: [
      {
        id: `${id}-primary`,
        wordGroupId: id,
        variantLabel: 'primary',
        wordArabic: 'كلمة',
        transliteration: id,
        audioPath: null,
        notes: null,
        sortOrder: 0,
        nativeVerified: false,
        contentStatus: 'approved',
        createdBy: null,
        updatedBy: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        speakerName: null,
        dialectNotes: null,
        isNativeVoice: false,
        approvedBy: null,
        approvedAt: null,
      },
    ],
  } as WordGroupWithVariants;
}

const groups = ['a', 'b', 'c', 'd', 'e'].map(group);
const NO_GROUPS: WordGroupWithVariants[] = [];

async function takeExercises(count: number) {
  const { result } = await renderHook(() => useExerciseQueue(groups));
  const seen = [];
  for (let i = 0; i < count; i++) {
    seen.push(result.current.currentExercise!);
    await act(async () => result.current.next());
  }
  return seen;
}

it('the first pass covers every word in the lesson exactly once', async () => {
  const firstPass = await takeExercises(groups.length);
  expect(firstPass.map((e) => e.targetGroup.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
});

it('every question includes the correct answer, and distractors are other words (never duplicates of it)', async () => {
  const exercises = await takeExercises(groups.length);
  for (const exercise of exercises) {
    const optionGroupIds = exercise.options.map((o) => o.group.id);
    expect(optionGroupIds.filter((id) => id === exercise.targetGroup.id)).toHaveLength(1);
    expect(new Set(optionGroupIds).size).toBe(optionGroupIds.length);
    expect(exercise.options).toHaveLength(4);
  }
});

it('never runs dry during a time-based session — keeps serving exercises past one pass', async () => {
  const exercises = await takeExercises(groups.length * 3 + 2);
  expect(exercises.every((e) => e !== null)).toBe(true);
  expect(new Set(exercises.map((e) => e.key)).size).toBe(exercises.length);
});

it('rotates through reading, typing and speaking (the only exercise types)', async () => {
  const exercises = await takeExercises(groups.length);
  expect(new Set(exercises.map((e) => e.type))).toEqual(new Set(['reading_match', 'typing_spelling', 'speaking']));
});

it('an empty lesson yields no exercise rather than crashing', async () => {
  // Hoisted: callers pass state-held (stable) arrays — an inline [] would be a
  // new identity every render and re-trigger the hook's reset effect forever.
  const { result } = await renderHook(() => useExerciseQueue(NO_GROUPS));
  expect(result.current.currentExercise).toBeNull();
});

// --- Listening questions -----------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { makeGroup } = require('@/test-utils/wordGroupFixtures');

const listenable: WordGroupWithVariants[] = ['a', 'b', 'c', 'd', 'e'].map((id) => makeGroup(id, { listenable: true }));

async function take(groupsIn: WordGroupWithVariants[], count: number, mode?: 'mixed' | 'listening') {
  const { result } = await renderHook(() => useExerciseQueue(groupsIn, mode));
  const seen = [];
  for (let i = 0; i < count; i++) {
    seen.push(result.current.currentExercise);
    await act(async () => result.current.next());
  }
  return seen;
}

it('lessons with native recordings get one listening question after every 3 regular ones', async () => {
  const exercises = await take(listenable, 12);
  const isListening = exercises.map((e) => e!.type === 'listen_recording' || e!.type === 'listen_meaning');
  expect(isListening).toEqual([false, false, false, true, false, false, false, true, false, false, false, true]);
});

it('listening-only mode (standalone practice) serves only listening questions, endlessly', async () => {
  const exercises = await take(listenable, 11, 'listening');
  expect(exercises.every((e) => e && (e.type === 'listen_recording' || e.type === 'listen_meaning'))).toBe(true);
  expect(new Set(exercises.map((e) => e!.key)).size).toBe(exercises.length);
});

it('listening-only mode with too few recordings yields no exercise (the screen shows its empty state)', async () => {
  const twoOnly = listenable.slice(0, 2);
  const { result } = await renderHook(() => useExerciseQueue(twoOnly, 'listening'));
  expect(result.current.currentExercise).toBeNull();
});
