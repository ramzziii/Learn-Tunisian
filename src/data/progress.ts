import { supabase } from '@/lib/supabase/client';
import type { ProgressStatus } from '@/types/models';

/**
 * Records the outcome of one exercise attempt against a word_group, upserting
 * the (profile_id, word_group_id) progress row. Called after every exercise,
 * kid and adult tracks alike, so progress stays comparable across exercise
 * types. Mastery is tracked per concept (word_group), not per variant —
 * answering with any variant of the group demonstrates the same knowledge.
 */
export async function recordWordGroupResult(
  profileId: string,
  wordGroupId: string,
  wasCorrect: boolean
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('progress')
    .select('correct_count, incorrect_count')
    .eq('profile_id', profileId)
    .eq('word_group_id', wordGroupId)
    .maybeSingle<{ correct_count: number; incorrect_count: number }>();
  if (fetchError) throw fetchError;

  const correctCount = (existing?.correct_count ?? 0) + (wasCorrect ? 1 : 0);
  const incorrectCount = (existing?.incorrect_count ?? 0) + (wasCorrect ? 0 : 1);
  const status: ProgressStatus = correctCount > 0 ? (correctCount >= 3 ? 'known' : 'learning') : 'new';

  const { error } = await supabase.from('progress').upsert(
    {
      profile_id: profileId,
      word_group_id: wordGroupId,
      correct_count: correctCount,
      incorrect_count: incorrectCount,
      status,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id,word_group_id' }
  );
  if (error) throw error;
}

export interface ProfileProgressSummary {
  wordsKnown: number;
  wordsLearning: number;
  totalWordsSeen: number;
}

export async function fetchProgressSummary(profileId: string): Promise<ProfileProgressSummary> {
  const { data, error } = await supabase
    .from('progress')
    .select('status')
    .eq('profile_id', profileId);
  if (error) throw error;

  const rows = data ?? [];
  return {
    wordsKnown: rows.filter((r) => r.status === 'known').length,
    wordsLearning: rows.filter((r) => r.status === 'learning').length,
    totalWordsSeen: rows.length,
  };
}
