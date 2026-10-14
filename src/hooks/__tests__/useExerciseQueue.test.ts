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

async function takeExercises(track: 'adult' | 'kid', count: number) {
  const { result } = await renderHook(() => useExerciseQueue(groups, track));
  const seen = [];
  for (let i = 0; i < count; i++) {
    seen.push(result.current.currentExercise!);
    await act(async () => result.current.next());
  }
  return seen;
}

it('the first pass covers every word in the lesson exactly once', async () => {
  const firstPass = await takeExercises('adult', groups.length);
  expect(firstPass.map((e) => e.targetGroup.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
});

it('every question includes the correct answer, and distractors are other words (never duplicates of it)', async () => {
  const exercises = await takeExercises('adult', groups.length);
  for (const exercise of exercises) {
    const optionGroupIds = exercise.options.map((o) => o.group.id);
    expect(optionGroupIds.filter((id) => id === exercise.targetGroup.id)).toHaveLength(1);
    expect(new Set(optionGroupIds).size).toBe(optionGroupIds.length);
    expect(exercise.options).toHaveLength(4);
  }
});

it('never runs dry during a time-based session — keeps serving exercises past one pass', async () => {
  const exercises = await takeExercises('adult', groups.length * 3 + 2);
  expect(exercises.every((e) => e !== null)).toBe(true);
  expect(new Set(exercises.map((e) => e.key)).size).toBe(exercises.length);
});

it('kids only get the listen-and-tap exercise; adults rotate through reading, typing, and speaking', async () => {
  const kid = await takeExercises('kid', groups.length);
  expect(new Set(kid.map((e) => e.type))).toEqual(new Set(['listen_and_tap']));

  const adult = await takeExercises('adult', groups.length);
  expect(new Set(adult.map((e) => e.type))).toEqual(new Set(['reading_match', 'typing_spelling', 'speaking']));
});

it('an empty lesson yields no exercise rather than crashing', async () => {
  // Hoisted: callers pass state-held (stable) arrays — an inline [] would be a
  // new identity every render and re-trigger the hook's reset effect forever.
  const { result } = await renderHook(() => useExerciseQueue(NO_GROUPS, 'adult'));
  expect(result.current.currentExercise).toBeNull();
});
