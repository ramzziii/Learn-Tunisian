import { findTalkScenario } from '@/constants/talkScenarios';
import { supabase } from '@/lib/supabase/client';
import type { GroundedVocabularyItem, LearnerContext, ConversationDifficulty } from '@/lib/ai/types';
import type { ProgressRow, WordGroupRow, WordVariantRow } from '@/types/database';

const MAX_CONTEXT_WORDS = 6;

/**
 * Every variant (primary/also_heard/masculine/feminine) of a scenario's
 * target word_groups, straight from the existing content tables — this is
 * the entire "vocabulary source" for the AI feature; there is no separate
 * database for it.
 */
export async function fetchScenarioVocabulary(scenarioId: string): Promise<GroundedVocabularyItem[]> {
  const scenario = findTalkScenario(scenarioId);
  if (!scenario || scenario.targetVocabulary.length === 0) return [];

  const { data: groupRows, error: groupsError } = await supabase
    .from('word_groups')
    .select('id, english_meaning')
    .in('id', scenario.targetVocabulary);
  if (groupsError) throw groupsError;
  const meaningByGroupId = new Map(((groupRows as Pick<WordGroupRow, 'id' | 'english_meaning'>[] | null) ?? []).map(
    (g) => [g.id, g.english_meaning]
  ));

  const { data: variantRows, error: variantsError } = await supabase
    .from('word_variants')
    .select('*')
    .in('word_group_id', scenario.targetVocabulary);
  if (variantsError) throw variantsError;

  return ((variantRows as WordVariantRow[] | null) ?? []).map((row) => ({
    wordGroupId: row.word_group_id,
    englishMeaning: meaningByGroupId.get(row.word_group_id) ?? '',
    wordArabic: row.word_arabic,
    transliteration: row.transliteration,
    variantLabel: row.variant_label,
    nativeVerified: row.native_verified,
  }));
}

/**
 * Minimal, non-identifying learner context: track, difficulty, and a
 * handful of English-meaning labels for words the learner knows well or is
 * struggling with — enough for the tutor to personalize without sending
 * anything resembling account/personal information.
 */
export async function fetchLearnerContext(
  profileId: string,
  track: 'kid' | 'adult',
  difficulty: ConversationDifficulty
): Promise<LearnerContext> {
  const { data, error } = await supabase
    .from('progress')
    .select('status, correct_count, incorrect_count, word_group_id')
    .eq('profile_id', profileId);
  if (error) throw error;

  const rows = (data as Pick<ProgressRow, 'status' | 'correct_count' | 'incorrect_count' | 'word_group_id'>[] | null) ?? [];
  const knownGroupIds = rows.filter((r) => r.status === 'known').map((r) => r.word_group_id);
  const strugglingGroupIds = rows
    .filter((r) => r.incorrect_count > r.correct_count)
    .map((r) => r.word_group_id);

  const allIds = [...knownGroupIds, ...strugglingGroupIds].slice(0, MAX_CONTEXT_WORDS * 2);
  const meaningById = new Map<string, string>();
  if (allIds.length > 0) {
    const { data: groupRows, error: groupsError } = await supabase
      .from('word_groups')
      .select('id, english_meaning')
      .in('id', allIds);
    if (groupsError) throw groupsError;
    for (const row of (groupRows as Pick<WordGroupRow, 'id' | 'english_meaning'>[] | null) ?? []) {
      meaningById.set(row.id, row.english_meaning);
    }
  }

  return {
    track,
    difficulty,
    knownWords: knownGroupIds.map((id) => meaningById.get(id)).filter((v): v is string => !!v).slice(0, MAX_CONTEXT_WORDS),
    strugglingWords: strugglingGroupIds
      .map((id) => meaningById.get(id))
      .filter((v): v is string => !!v)
      .slice(0, MAX_CONTEXT_WORDS),
  };
}
