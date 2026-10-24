import { buildRevisitExercises, SPEAKING_MISSES_BEFORE_REVISIT, updateRevisitList } from '@/lib/speakingRevisit';
import type { WordGroupWithVariants } from '@/types/models';

const speaking = { type: 'speaking' as const };
const revisitPass = { type: 'speaking' as const, isRevisit: true };

const group = (id: string) =>
  ({
    id,
    englishMeaning: id,
    variants: [{ id: `${id}-v`, variantLabel: 'primary', wordArabic: 'كلمة', transliteration: id }],
  }) as unknown as WordGroupWithVariants;

it('moves on by itself after 4 misses', () => {
  expect(SPEAKING_MISSES_BEFORE_REVISIT).toBe(4);
});

describe('updateRevisitList', () => {
  it('queues a word left mispronounced, once, in the order missed', () => {
    let list = updateRevisitList([], 'b', speaking, { mispronounced: true });
    list = updateRevisitList(list, 'a', speaking, { mispronounced: true });
    list = updateRevisitList(list, 'b', speaking, { mispronounced: true });
    expect(list).toEqual(['b', 'a']);
  });

  it('drops a word the learner later says correctly in the same session', () => {
    const list = updateRevisitList(['a', 'b'], 'a', speaking, {});
    expect(list).toEqual(['b']);
  });

  it('ignores non-speaking exercises (a wrong typing answer is not a pronunciation miss)', () => {
    expect(updateRevisitList(['a'], 'a', { type: 'typing_spelling' }, {})).toEqual(['a']);
    expect(updateRevisitList([], 'x', { type: 'reading_match' }, { mispronounced: true })).toEqual([]);
  });

  it('a miss during the revisit pass never re-queues the word (no endless loop)', () => {
    expect(updateRevisitList([], 'a', revisitPass, { mispronounced: true })).toEqual([]);
  });
});

describe('buildRevisitExercises', () => {
  it('one speaking exercise per missed word, in order, marked as the revisit pass', () => {
    const items = buildRevisitExercises(['c', 'a'], [group('a'), group('b'), group('c')]);
    expect(items.map((i) => i.targetGroup.id)).toEqual(['c', 'a']);
    expect(items.every((i) => i.type === 'speaking' && i.isRevisit)).toBe(true);
    expect(new Set(items.map((i) => i.key)).size).toBe(2);
  });

  it('skips ids whose word is no longer in the session', () => {
    expect(buildRevisitExercises(['gone', 'a'], [group('a')]).map((i) => i.targetGroup.id)).toEqual(['a']);
  });
});
