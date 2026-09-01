import { supabase } from '@/lib/supabase/client';
import { mapProgress, mapWordGroup, mapWordVariant } from '@/data/mappers';
import { calculateMasteryStatus } from '@/lib/masteryStatus';
import { sortReviewCandidates } from '@/lib/reviewSelection';
import { calculateNextReview, INITIAL_SPACED_REPETITION_STATE } from '@/lib/spacedRepetition';
import type { ProgressRow, WordGroupRow, WordVariantRow } from '@/types/database';
import type { Progress, WordGroupWithVariants } from '@/types/models';

export async function fetchProgressForWordGroup(profileId: string, wordGroupId: string): Promise<Progress | null> {
  const { data, error } = await supabase
    .from('progress')
    .select('*')
    .eq('profile_id', profileId)
    .eq('word_group_id', wordGroupId)
    .maybeSingle<ProgressRow>();
  if (error) throw error;
  return data ? mapProgress(data) : null;
}

type SpacedRepetitionRow = Pick<
  ProgressRow,
  'correct_count' | 'incorrect_count' | 'review_interval_days' | 'ease_factor' | 'consecutive_correct' | 'consecutive_incorrect'
>;

/**
 * Records the outcome of one exercise attempt against a word_group, upserting
 * the (profile_id, word_group_id) progress row and advancing its spaced-
 * repetition schedule. Called after every exercise, kid and adult tracks
 * alike, so progress stays comparable across exercise types.
 */
export async function recordWordGroupResult(
  profileId: string,
  wordGroupId: string,
  wasCorrect: boolean
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('progress')
    .select('correct_count, incorrect_count, review_interval_days, ease_factor, consecutive_correct, consecutive_incorrect')
    .eq('profile_id', profileId)
    .eq('word_group_id', wordGroupId)
    .maybeSingle<SpacedRepetitionRow>();
  if (fetchError) throw fetchError;

  const correctCount = (existing?.correct_count ?? 0) + (wasCorrect ? 1 : 0);
  const incorrectCount = (existing?.incorrect_count ?? 0) + (wasCorrect ? 0 : 1);
  const status = calculateMasteryStatus(correctCount);

  const schedule = calculateNextReview(
    existing
      ? {
          reviewIntervalDays: existing.review_interval_days,
          easeFactor: existing.ease_factor,
          consecutiveCorrect: existing.consecutive_correct,
          consecutiveIncorrect: existing.consecutive_incorrect,
        }
      : INITIAL_SPACED_REPETITION_STATE,
    wasCorrect
  );

  const { error } = await supabase.from('progress').upsert(
    {
      profile_id: profileId,
      word_group_id: wordGroupId,
      correct_count: correctCount,
      incorrect_count: incorrectCount,
      status,
      next_review_at: schedule.nextReviewAt.toISOString(),
      review_interval_days: schedule.reviewIntervalDays,
      ease_factor: schedule.easeFactor,
      consecutive_correct: schedule.consecutiveCorrect,
      consecutive_incorrect: schedule.consecutiveIncorrect,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id,word_group_id' }
  );
  if (error) throw error;
}

export interface ProfileProgressSummary {
  wordsLearning: number;
  wordsMastered: number;
  wordsReviewed: number;
  totalWordsSeen: number;
}

export async function fetchProgressSummary(profileId: string): Promise<ProfileProgressSummary> {
  const { data, error } = await supabase
    .from('progress')
    .select('status, correct_count, incorrect_count')
    .eq('profile_id', profileId);
  if (error) throw error;

  const rows = data ?? [];
  return {
    wordsMastered: rows.filter((r) => r.status === 'known').length,
    wordsLearning: rows.filter((r) => r.status === 'learning').length,
    // "Reviewed" means seen more than once — i.e. it's gone through at least one review, not just the first exposure.
    wordsReviewed: rows.filter((r) => r.correct_count + r.incorrect_count >= 2).length,
    totalWordsSeen: rows.length,
  };
}

/**
 * Word_groups due for review right now, ordered most-overdue first, then by
 * how recently they were answered incorrectly, then by lowest mastery — the
 * priority order from the product spec. Only strictly-due items are
 * included (rather than padding out the queue with not-yet-due content),
 * so an empty result is a genuine "you're all caught up," not a fallback
 * needed.
 */
export async function fetchReviewQueue(profileId: string): Promise<WordGroupWithVariants[]> {
  const { data: dueRows, error: dueError } = await supabase
    .from('progress')
    .select('word_group_id, next_review_at, consecutive_incorrect, correct_count')
    .eq('profile_id', profileId)
    .lte('next_review_at', new Date().toISOString());
  if (dueError) throw dueError;

  const due = dueRows ?? [];
  if (due.length === 0) return [];

  const sorted = sortReviewCandidates(
    due.map((row) => ({
      wordGroupId: row.word_group_id as string,
      nextReviewAt: row.next_review_at as string,
      consecutiveIncorrect: row.consecutive_incorrect as number,
      correctCount: row.correct_count as number,
    }))
  );

  const groupIds = sorted.map((row) => row.wordGroupId);

  const { data: groupRows, error: groupsError } = await supabase.from('word_groups').select('*').in('id', groupIds);
  if (groupsError) throw groupsError;
  const groupsById = new Map(((groupRows as WordGroupRow[] | null) ?? []).map((g) => [g.id, g]));

  const { data: variantRows, error: variantsError } = await supabase
    .from('word_variants')
    .select('*')
    .in('word_group_id', groupIds);
  if (variantsError) throw variantsError;
  const variantsByGroup = new Map<string, WordVariantRow[]>();
  for (const variant of (variantRows as WordVariantRow[] | null) ?? []) {
    const list = variantsByGroup.get(variant.word_group_id) ?? [];
    list.push(variant);
    variantsByGroup.set(variant.word_group_id, list);
  }

  // Re-assemble in the priority order computed above (the DB queries above don't preserve it).
  return groupIds
    .map((id) => groupsById.get(id))
    .filter((g): g is WordGroupRow => g !== undefined)
    .map((group) => ({
      ...mapWordGroup(group),
      variants: (variantsByGroup.get(group.id) ?? []).map(mapWordVariant),
    }));
}

export async function fetchReviewDueCount(profileId: string): Promise<number> {
  const { count, error } = await supabase
    .from('progress')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .lte('next_review_at', new Date().toISOString());
  if (error) throw error;
  return count ?? 0;
}
