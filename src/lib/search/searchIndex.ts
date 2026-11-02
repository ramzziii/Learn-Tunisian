import { arabicKeys, containsArabic, englishKey, latinKeys } from '@/lib/search/searchKeys';
import type { VariantLabel, WordGroupWithVariants } from '@/types/models';

/**
 * The in-memory dictionary index. Built only from words the learner can
 * open (src/data/search.ts) and never saved anywhere. One result per word
 * group, whichever of its forms matched.
 *
 * Ranks (lower is better): 0 exact · 1 starts with · 2 contains · 3–5 the
 * same on alias keys (approved aliases, alef forms) · 6 English with one typo.
 * Arabic and Latin never get typo tolerance.
 */
export const RANK = { exact: 0, prefix: 1, contains: 2, alias: 3, englishTypo: 6 } as const;

interface IndexedForm {
  label: VariantLabel;
  latin: { base: string; alias: string };
  arabic: { base: string; alias: string };
}

interface IndexEntry {
  group: WordGroupWithVariants;
  order: number;
  english: string;
  englishTokens: string[];
  forms: IndexedForm[];
}

export interface SearchIndex {
  entries: IndexEntry[];
}

export interface SearchResult {
  group: WordGroupWithVariants;
  rank: number;
  /** Set only when the best match came from a non-primary form. */
  matchedLabel: VariantLabel | null;
}

export function buildSearchIndex(groups: readonly WordGroupWithVariants[]): SearchIndex {
  return {
    entries: groups.map((group, order) => {
      const english = englishKey(group.englishMeaning);
      return {
        group,
        order,
        english,
        englishTokens: english.split(' ').filter(Boolean),
        forms: group.variants.map((v) => ({
          label: v.variantLabel,
          latin: latinKeys(v.transliteration),
          arabic: arabicKeys(v.wordArabic),
        })),
      };
    }),
  };
}

function textRank(key: string, query: string): number | null {
  if (!key || !query) return null;
  if (key === query) return RANK.exact;
  if (key.startsWith(query)) return RANK.prefix;
  if (key.includes(query)) return RANK.contains;
  return null;
}

function keyedRank(keys: { base: string; alias: string }, query: { base: string; alias: string }): number | null {
  const base = textRank(keys.base, query.base);
  if (base !== null) return base;
  const alias = textRank(keys.alias, query.alias);
  return alias === null ? null : RANK.alias + alias;
}

/** True when a and b differ by at most one insertion, deletion or substitution. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const better = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));

export function searchWords(index: SearchIndex, rawQuery: string, limit = 50): SearchResult[] {
  if (!rawQuery.trim()) return [];
  const arabicQuery = containsArabic(rawQuery);
  const qArabic = arabicQuery ? arabicKeys(rawQuery) : null;
  const qLatin = arabicQuery ? null : latinKeys(rawQuery);
  const qEnglish = arabicQuery ? '' : englishKey(rawQuery);
  if (!qArabic?.base && !qLatin?.base && !qEnglish) return [];
  const englishTypoAllowed = qEnglish.length >= 5 && !qEnglish.includes(' ');

  const results: (SearchResult & { order: number })[] = [];
  for (const entry of index.entries) {
    // Best rank from the English meaning and from primary forms, and separately
    // from the other forms — the note is shown only when the latter wins.
    let primaryBest: number | null = qEnglish ? textRank(entry.english, qEnglish) : null;
    let otherBest: number | null = null;
    let otherLabel: VariantLabel | null = null;
    for (const f of entry.forms) {
      const rank = qArabic ? keyedRank(f.arabic, qArabic) : keyedRank(f.latin, qLatin!);
      if (rank === null) continue;
      if (f.label === 'primary') primaryBest = better(primaryBest, rank);
      else if (otherBest === null || rank < otherBest) {
        otherBest = rank;
        otherLabel = f.label;
      }
    }
    if (primaryBest === null && otherBest === null && englishTypoAllowed) {
      if (entry.englishTokens.some((t) => t.length >= 4 && withinOneEdit(t, qEnglish))) primaryBest = RANK.englishTypo;
    }
    const rank = better(primaryBest, otherBest);
    if (rank === null) continue;
    const fromOther = otherBest !== null && (primaryBest === null || otherBest < primaryBest);
    results.push({ group: entry.group, rank, matchedLabel: fromOther ? otherLabel : null, order: entry.order });
  }
  return results
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, limit)
    .map(({ group, rank, matchedLabel }) => ({ group, rank, matchedLabel }));
}
