// The listening quiz's content rules (src/lib/listening.ts):
// - only approved content with a confirmed native recording can be heard —
//   an audio path alone is never enough;
// - distractors come from other word groups only (never another variant of
//   the right word, never a group with the same meaning), preferring the
//   same lesson, then the same unit;
// - a question that can't be made fair is skipped, never padded;
// - in mixed sessions, one listening question follows every 3 regular ones.
import { makeGroup, makeVariant } from '@/test-utils/wordGroupFixtures';
import type { ExerciseItem } from '@/types/exercises';
import type { WordVariant } from '@/types/models';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const listening = require('@/lib/listening');

describe('which content can be heard', () => {
  it('needs an approved group and variant, native_verified, a native recording and an audio path', () => {
    expect(listening.listeningVariant(makeGroup('a', { listenable: true }))).not.toBeNull();

    const brokenCases: Partial<WordVariant>[] = [
      { nativeVerified: false },
      { isNativeVoice: false },
      { audioPath: null },
      { contentStatus: 'draft' },
      { contentStatus: 'pending_review' },
    ];
    for (const broken of brokenCases) {
      const group = makeGroup('a', { variants: [makeVariant('a', { listenable: true, ...broken })] });
      expect(listening.listeningVariant(group)).toBeNull();
    }
    expect(listening.listeningVariant(makeGroup('a', { listenable: true, contentStatus: 'draft' }))).toBeNull();
  });

  it('an audio path alone is not proof of a native, approved recording', () => {
    const group = makeGroup('a', { variants: [makeVariant('a', { audioPath: 'a/x.m4a' })] });
    expect(listening.listeningVariant(group)).toBeNull();
  });

  it('prefers the primary variant, but any eligible variant of the group will do', () => {
    const both = makeGroup('a', {
      variants: [
        makeVariant('a', { variantLabel: 'feminine', listenable: true }),
        makeVariant('a', { variantLabel: 'primary', listenable: true }),
      ],
    });
    expect(listening.listeningVariant(both).variantLabel).toBe('primary');

    const onlyFeminine = makeGroup('a', {
      variants: [makeVariant('a', { variantLabel: 'primary' }), makeVariant('a', { variantLabel: 'feminine', listenable: true })],
    });
    expect(listening.listeningVariant(onlyFeminine).variantLabel).toBe('feminine');
  });
});

describe('distractors', () => {
  const target = makeGroup('t', { listenable: true, unitId: 'u1', lessonNumber: 1 });

  it('come only from other word groups, never the target or a group with the same meaning', () => {
    const pool = [
      target,
      makeGroup('same-meaning', { listenable: true, englishMeaning: '  MEANING t ' }),
      makeGroup('b', { listenable: true }),
      makeGroup('c', { listenable: true }),
    ];
    const picked = listening.pickDistractorGroups(target, pool, 3, { requireAudio: true });
    expect(picked.map((g: { id: string }) => g.id).sort()).toEqual(['b', 'c']);
  });

  it('prefer the same lesson, then the same unit, then anything else', () => {
    const pool = [
      makeGroup('other-unit', { listenable: true, unitId: 'u2', lessonNumber: 1 }),
      makeGroup('same-unit', { listenable: true, unitId: 'u1', lessonNumber: 2 }),
      makeGroup('same-lesson', { listenable: true, unitId: 'u1', lessonNumber: 1 }),
    ];
    expect(listening.pickDistractorGroups(target, pool, 1, { requireAudio: true }).map((g: { id: string }) => g.id)).toEqual(['same-lesson']);
    expect(listening.pickDistractorGroups(target, pool, 2, { requireAudio: true }).map((g: { id: string }) => g.id)).toEqual([
      'same-lesson',
      'same-unit',
    ]);
  });

  it('for recording choices, every distractor must itself be listenable', () => {
    const pool = [makeGroup('silent'), makeGroup('heard', { listenable: true })];
    expect(listening.pickDistractorGroups(target, pool, 3, { requireAudio: true }).map((g: { id: string }) => g.id)).toEqual(['heard']);
    expect(listening.pickDistractorGroups(target, pool, 3, { requireAudio: false })).toHaveLength(2);
  });
});

describe('building a question', () => {
  const pool = (n: number) => Array.from({ length: n }, (_, i) => makeGroup(`g${i}`, { listenable: true }));

  it('meaning → recording: 4 options when possible, each a different group with its own native clip', () => {
    const groups = pool(6);
    const q: ExerciseItem = listening.buildListeningExercise(groups[0], groups, 'listen_recording', 0);
    expect(q.type).toBe('listen_recording');
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options.map((o) => o.group.id)).size).toBe(4);
    expect(q.options.filter((o) => o.group.id === 'g0')).toHaveLength(1);
    for (const option of q.options) {
      expect(option.variant).toBe(listening.listeningVariant(option.group));
    }
    expect(q.promptVariant).toBe(listening.listeningVariant(groups[0]));
  });

  it('meaning → recording: falls back to 3 options, and is skipped below that', () => {
    expect(listening.buildListeningExercise(pool(3)[0], pool(3), 'listen_recording', 0).options).toHaveLength(3);
    const two = pool(2);
    expect(listening.buildListeningExercise(two[0], [...two, makeGroup('silent')], 'listen_recording', 0)).toBeNull();
  });

  it('listen → meaning: the target needs a native clip; the other options are just meanings of other groups', () => {
    const target = makeGroup('t', { listenable: true });
    const others = [makeGroup('x'), makeGroup('y'), makeGroup('z')];
    const q: ExerciseItem = listening.buildListeningExercise(target, [target, ...others], 'listen_meaning', 0);
    expect(q.type).toBe('listen_meaning');
    expect(q.options).toHaveLength(4);
    expect(listening.buildListeningExercise(makeGroup('silent'), others, 'listen_meaning', 0)).toBeNull();
    expect(listening.buildListeningExercise(target, [target, makeGroup('only-one')], 'listen_meaning', 0)).toBeNull();
  });

  it('any variant of the correct group counts as correct; another group never does', () => {
    const target = makeGroup('t', {
      variants: [makeVariant('t', { listenable: true }), makeVariant('t', { variantLabel: 'feminine', listenable: true })],
    });
    const groups = [target, ...pool(3)];
    const q: ExerciseItem = listening.buildListeningExercise(target, groups, 'listen_recording', 0);
    expect(listening.isListeningAnswerCorrect(q, 't')).toBe(true);
    expect(listening.isListeningAnswerCorrect(q, 'g0')).toBe(false);
  });
});

describe('mixing into lessons and review', () => {
  const regular = (ids: string[]): ExerciseItem[] =>
    ids.map((id, i) => ({ key: `${id}-r${i}`, type: 'reading_match', targetGroup: makeGroup(id), promptVariant: makeVariant(id), options: [] }));

  it('adds one listening question after every 3 regular ones (25% of questions), alternating the two formats', () => {
    const groups = Array.from({ length: 6 }, (_, i) => makeGroup(`g${i}`, { listenable: true }));
    const items = regular(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
    const mixed: ExerciseItem[] = listening.interleaveListening(items, groups, 0);

    expect(mixed).toHaveLength(12);
    expect(mixed.map((e) => e.type)).toEqual([
      'reading_match', 'reading_match', 'reading_match', 'listen_recording',
      'reading_match', 'reading_match', 'reading_match', 'listen_meaning',
      'reading_match', 'reading_match', 'reading_match', 'listen_recording',
    ]);
    // The regular questions keep their order.
    expect(mixed.filter((e) => e.type === 'reading_match')).toEqual(items);
  });

  it('with no listenable content, the session is exactly what it was', () => {
    const items = regular(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(listening.interleaveListening(items, [makeGroup('a'), makeGroup('b')], 0)).toEqual(items);
  });

  it('each inserted question has a unique key', () => {
    const groups = Array.from({ length: 5 }, (_, i) => makeGroup(`g${i}`, { listenable: true }));
    const mixed: ExerciseItem[] = listening.interleaveListening(regular(['a', 'b', 'c', 'd', 'e', 'f']), groups, 7);
    expect(new Set(mixed.map((e) => e.key)).size).toBe(mixed.length);
  });

  it('a listening-only pass alternates formats and covers each listenable word once', () => {
    const groups = [...Array.from({ length: 4 }, (_, i) => makeGroup(`g${i}`, { listenable: true })), makeGroup('silent')];
    const pass: ExerciseItem[] = listening.buildListeningPass(groups, 0);
    expect(pass.map((e) => e.targetGroup.id).sort()).toEqual(['g0', 'g1', 'g2', 'g3']);
    expect(pass.every((e) => e.type === 'listen_recording' || e.type === 'listen_meaning')).toBe(true);
    expect(new Set(pass.map((e) => e.type)).size).toBe(2);
  });

  it('too little listenable content → an empty listening-only pass', () => {
    expect(listening.buildListeningPass([makeGroup('a', { listenable: true }), makeGroup('b', { listenable: true })], 0)).toEqual([]);
    expect(listening.hasEnoughListeningContent([makeGroup('a', { listenable: true }), makeGroup('b', { listenable: true })])).toBe(false);
    expect(listening.hasEnoughListeningContent(Array.from({ length: 3 }, (_, i) => makeGroup(`g${i}`, { listenable: true })))).toBe(true);
  });
});

describe('skip diagnostics', () => {
  const g = globalThis as unknown as { __DEV__: boolean };
  const original = g.__DEV__;
  afterEach(() => {
    g.__DEV__ = original;
    jest.restoreAllMocks();
  });

  it('logs a skipped question in development, with the reason and no learner data', () => {
    g.__DEV__ = true;
    const debug = jest.spyOn(console, 'debug').mockImplementation(() => {});
    listening.buildListeningExercise(makeGroup('silent'), [], 'listen_recording', 0);
    expect(debug).toHaveBeenCalledTimes(1);
    expect(String(debug.mock.calls[0][0])).toMatch(/\[listening\] skipped/);
    expect(JSON.stringify(debug.mock.calls[0])).not.toMatch(/profile|account|user/i);
  });

  it('stays silent in production builds', () => {
    g.__DEV__ = false;
    const spies = ['debug', 'log', 'warn', 'error'].map((m) => jest.spyOn(console, m as 'debug').mockImplementation(() => {}));
    listening.buildListeningExercise(makeGroup('silent'), [], 'listen_recording', 0);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
