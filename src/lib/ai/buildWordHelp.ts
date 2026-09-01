import type { GroundedVocabularyItem } from '@/lib/ai/types';

export interface WordHelpEntry {
  word: string;
  meaning: string;
}

/**
 * "I don't understand" doesn't need a second AI call — the tutor's message
 * is built from the same vocabulary list already fetched from the app's own
 * database, so a simple substring match against it gives an accurate
 * word-by-word breakdown for free, grounded in the source of truth rather
 * than another (costly, and no more authoritative) model response.
 */
export function buildWordHelp(tunisianMessage: string, vocabulary: GroundedVocabularyItem[]): WordHelpEntry[] {
  const seen = new Set<string>();
  const entries: WordHelpEntry[] = [];

  for (const item of vocabulary) {
    if (!item.wordArabic || seen.has(item.wordArabic)) continue;
    if (tunisianMessage.includes(item.wordArabic)) {
      entries.push({ word: item.wordArabic, meaning: item.englishMeaning });
      seen.add(item.wordArabic);
    }
  }

  return entries;
}
