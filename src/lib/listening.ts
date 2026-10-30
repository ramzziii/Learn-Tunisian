import { getPrimaryVariant } from '@/lib/wordVariants';
import type { ExerciseItem, ExerciseOption } from '@/types/exercises';
import type { WordGroupWithVariants, WordVariant } from '@/types/models';

/**
 * The listening quiz: questions answered by ear, using native recordings
 * only. Two formats, neither of which existed before (reading match is
 * "hear → pick the written Arabic", which tests reading):
 *   - listen_recording: see the meaning, choose the matching recording
 *     (3–4 recordings, each with its own play button);
 *   - listen_meaning: hear a recording, choose its meaning.
 *
 * Only content that is approved AND has a confirmed native recording can be
 * heard: content_status 'approved' on the group and the variant,
 * native_verified (the admin's approval stamp), is_native_voice (the
 * admin's "native recording" flag) and an audio_path. A path alone is never
 * enough — seeded placeholder audio has one too.
 */

export type ListeningFormat = 'listen_recording' | 'listen_meaning';

/** In lessons and review: one listening question after every 3 regular ones (25% of questions). */
export const LISTENING_EVERY = 3;

const MAX_OPTIONS = 4;
const MIN_OPTIONS = 3;

export function isListenableVariant(variant: WordVariant): boolean {
  return variant.contentStatus === 'approved' && variant.nativeVerified && variant.isNativeVoice && !!variant.audioPath;
}

/** The recording to play for a word group — its primary variant if that one qualifies, else any variant that does — or null. */
export function listeningVariant(group: WordGroupWithVariants): WordVariant | null {
  if (group.contentStatus !== 'approved') return null;
  const eligible = group.variants.filter(isListenableVariant);
  if (eligible.length === 0) return null;
  return eligible.find((v) => v.variantLabel === 'primary') ?? eligible[0];
}

/** Enough to build a fair question at all: at least 3 words with native recordings. */
export function hasEnoughListeningContent(groups: WordGroupWithVariants[]): boolean {
  return groups.filter((g) => listeningVariant(g) !== null).length >= MIN_OPTIONS;
}

/** The answer is the word group, so any variant of the right word counts. */
export function isListeningAnswerCorrect(exercise: ExerciseItem, chosenGroupId: string): boolean {
  return chosenGroupId === exercise.targetGroup.id;
}

const normalizeMeaning = (meaning: string) => meaning.trim().toLowerCase();

/**
 * Wrong options for `target`: other word groups only (never another variant
 * of the target), never a group whose meaning matches another option's (two
 * "right" answers wouldn't be fair), and — for recording choices — only
 * groups that can themselves be heard. Same lesson first, then same unit,
 * then anything; within each, `pool` order is kept.
 */
export function pickDistractorGroups(
  target: WordGroupWithVariants,
  pool: WordGroupWithVariants[],
  count: number,
  { requireAudio }: { requireAudio: boolean }
): WordGroupWithVariants[] {
  const usedIds = new Set([target.id]);
  const usedMeanings = new Set([normalizeMeaning(target.englishMeaning)]);
  const candidates: WordGroupWithVariants[] = [];
  for (const group of pool) {
    if (usedIds.has(group.id) || group.contentStatus !== 'approved' || group.variants.length === 0) continue;
    const meaning = normalizeMeaning(group.englishMeaning);
    if (usedMeanings.has(meaning)) continue;
    if (requireAudio && !listeningVariant(group)) continue;
    usedIds.add(group.id);
    usedMeanings.add(meaning);
    candidates.push(group);
  }
  const closeness = (g: WordGroupWithVariants) => (g.unitId !== target.unitId ? 2 : g.lessonNumber === target.lessonNumber ? 0 : 1);
  return candidates
    .map((group, order) => ({ group, order }))
    .sort((a, b) => closeness(a.group) - closeness(b.group) || a.order - b.order)
    .slice(0, count)
    .map(({ group }) => group);
}

/** A deterministic shuffle (mulberry32), so a session's questions are reproducible from their seed. */
function seededShuffle<T>(items: T[], seed: number): T[] {
  let state = (seed * 2654435761) >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Development-only note about a question that couldn't be made fair. Content reasons only — no learner data, nothing in production. */
function logSkip(reason: string): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.debug(`[listening] skipped a question: ${reason}`);
  }
}

/** One listening question about `target`, or null (with a dev note) when it can't be made fair. */
export function buildListeningExercise(
  target: WordGroupWithVariants,
  pool: WordGroupWithVariants[],
  format: ListeningFormat,
  seed: number
): ExerciseItem | null {
  const prompt = listeningVariant(target);
  if (!prompt) {
    logSkip('the word has no approved native recording');
    return null;
  }
  const requireAudio = format === 'listen_recording';
  const distractors = pickDistractorGroups(target, seededShuffle(pool, seed), MAX_OPTIONS - 1, { requireAudio });
  if (distractors.length < MIN_OPTIONS - 1) {
    logSkip(`only ${distractors.length} other suitable words for a ${format} question`);
    return null;
  }
  const options: ExerciseOption[] = [
    { group: target, variant: prompt },
    ...distractors.map((group) => ({
      group,
      variant: requireAudio ? (listeningVariant(group) as WordVariant) : (getPrimaryVariant(group) ?? group.variants[0]),
    })),
  ];
  return {
    key: `${target.id}-${format}-${seed}`,
    type: format,
    targetGroup: target,
    promptVariant: prompt,
    options: seededShuffle(options, seed + 1),
  };
}

/**
 * Mixes listening questions into a lesson/review pass: after every 3rd
 * regular question, one listening question (formats alternating), when one
 * can be built. Regular questions keep their order; with no recordings the
 * pass is unchanged. `before` carries the counts across passes so the
 * rhythm continues past a pass boundary.
 */
export function interleaveListening(
  items: ExerciseItem[],
  groups: WordGroupWithVariants[],
  seed: number,
  before: { regularCount: number; listeningCount: number } = { regularCount: 0, listeningCount: 0 }
): ExerciseItem[] {
  const targets = seededShuffle(
    groups.filter((g) => listeningVariant(g) !== null),
    seed
  );
  if (targets.length === 0) return [...items];

  const out: ExerciseItem[] = [];
  let regularCount = before.regularCount;
  let listeningCount = before.listeningCount;
  let cursor = 0;
  for (const item of items) {
    out.push(item);
    regularCount += 1;
    if (regularCount % LISTENING_EVERY !== 0) continue;
    const format: ListeningFormat = listeningCount % 2 === 0 ? 'listen_recording' : 'listen_meaning';
    for (let tries = 0; tries < targets.length; tries++) {
      const target = targets[(cursor + tries) % targets.length];
      const question = buildListeningExercise(target, groups, format, seed * 1000 + out.length);
      if (question) {
        out.push(question);
        listeningCount += 1;
        cursor = (cursor + tries + 1) % targets.length;
        break;
      }
    }
  }
  return out;
}

/** Standalone Listening practice: one pass over every word that can be heard, formats alternating; empty if there's too little to be fair. */
export function buildListeningPass(groups: WordGroupWithVariants[], passIndex: number): ExerciseItem[] {
  if (!hasEnoughListeningContent(groups)) return [];
  const targets = seededShuffle(
    groups.filter((g) => listeningVariant(g) !== null),
    passIndex + 1
  );
  const pass: ExerciseItem[] = [];
  targets.forEach((target, i) => {
    const preferred: ListeningFormat = i % 2 === 0 ? 'listen_recording' : 'listen_meaning';
    const other: ListeningFormat = preferred === 'listen_recording' ? 'listen_meaning' : 'listen_recording';
    const seed = passIndex * 1000 + i;
    const question = buildListeningExercise(target, groups, preferred, seed) ?? buildListeningExercise(target, groups, other, seed);
    if (question) pass.push(question);
  });
  return pass;
}
