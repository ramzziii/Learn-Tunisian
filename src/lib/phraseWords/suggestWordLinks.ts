import { arabicKeys, latinKeys } from '@/lib/search/searchKeys';
import type { WordGroupWithVariants, WordVariant } from '@/types/models';

/**
 * "Words used" suggestions for a phrase (admin only — nothing is linked until
 * the admin saves).
 *
 * - match: a word's Arabic or Latin spelling equals one or more words of the
 *   phrase, compared with the search keys (src/lib/search/searchKeys.ts:
 *   diacritics ignored, the approved letter aliases like kh = 5). Starts ticked.
 * - possible: a changed form — the article in front (el / l / ال), or the
 *   word with letters added before or after ("sakker" in the phrase, "nsakker"
 *   in the word list). Never ticked.
 * Sounds that differ are never merged: keys keep 7, 3, 9, 5, 8, 2 apart from
 * h, a, k, g, and an added part that is only one of those sounds doesn't count.
 */
export type SuggestionKind = 'match' | 'possible';

export interface WordLinkSuggestion {
  wordId: string;
  kind: SuggestionKind;
  ticked: boolean;
  /** The word as it appears in this phrase. */
  shownArabic: string;
  shownLatin: string;
  /** Where it appears in the phrase (0 = start, 1 = end) — suggestions are sorted by this. */
  order: number;
}

interface Token {
  text: string;
  key: string;
  alias: string;
}
interface Hit {
  kind: SuggestionKind;
  start: number;
  length: number;
}

const MAX_WORDS_IN_A_WORD = 3;
const LATIN_ARTICLES = ['el', 'l'];
const ARABIC_ARTICLE = 'ال';
// An added part made only of these isn't a changed form — it's a different sound.
const LATIN_SOUND_DIGITS = /^[235789]+$/;
const ARABIC_SOUND_LETTERS = /^[ءأإآعحقخغ]+$/;
const MIN_CONTAINED = { latin: 4, arabic: 3 };
const LATIN_EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const ARABIC_EDGE_PUNCTUATION = /^[\s،؛؟!.,:;"«»()-]+|[\s،؛؟!.,:;"«»()-]+$/g;

const isGone = (status: string) => status === 'rejected' || status === 'archived';

function tokenize(text: string, script: 'latin' | 'arabic'): Token[] {
  const keysOf = script === 'latin' ? latinKeys : arabicKeys;
  const edge = script === 'latin' ? LATIN_EDGE_PUNCTUATION : ARABIC_EDGE_PUNCTUATION;
  return text
    .split(/\s+/)
    .map((raw) => raw.replace(edge, ''))
    .filter((t) => t.length > 0)
    .map((t) => {
      const { base, alias } = keysOf(t);
      return { text: t, key: base, alias };
    });
}

function joinKeys(tokens: Token[], script: 'latin' | 'arabic') {
  const text = tokens.map((t) => t.text).join(' ');
  return script === 'latin' ? latinKeys(text) : arabicKeys(text);
}

/** A changed form: one key is the other plus an added part at the start or the end. */
function isChangedForm(a: string, b: string, script: 'latin' | 'arabic'): boolean {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter === longer || shorter.length < MIN_CONTAINED[script]) return false;
  const added = longer.startsWith(shorter) ? longer.slice(shorter.length) : longer.endsWith(shorter) ? longer.slice(0, -shorter.length) : null;
  if (!added) return false;
  return !(script === 'latin' ? LATIN_SOUND_DIGITS : ARABIC_SOUND_LETTERS).test(added);
}

function withoutArticle(key: string, script: 'latin' | 'arabic'): string | null {
  if (script === 'arabic') return key.startsWith(ARABIC_ARTICLE) && key.length > ARABIC_ARTICLE.length + 1 ? key.slice(ARABIC_ARTICLE.length) : null;
  const article = LATIN_ARTICLES.find((a) => key.startsWith(a) && key.length > a.length + 1);
  return article ? key.slice(article.length) : null;
}

/** The best place a form appears in the phrase's tokens, if anywhere. */
function findForm(tokens: Token[], formText: string, script: 'latin' | 'arabic'): Hit | null {
  if (!formText.trim()) return null;
  const form = script === 'latin' ? latinKeys(formText) : arabicKeys(formText);
  const formWords = formText.trim().split(/\s+/).length;
  const isArticleToken = (t: Token) => (script === 'latin' ? LATIN_ARTICLES.includes(t.key) : t.key === ARABIC_ARTICLE);

  // Exact first: the form's own number of words, anywhere in the phrase.
  if (formWords <= MAX_WORDS_IN_A_WORD) {
    for (let start = 0; start + formWords <= tokens.length; start++) {
      const span = tokens.slice(start, start + formWords);
      if (span.some(isArticleToken)) continue;
      const keys = joinKeys(span, script);
      if (keys.base === form.base || keys.alias === form.alias) return { kind: 'match', start, length: formWords };
    }
  }
  if (formWords !== 1) return null;
  for (let start = 0; start < tokens.length; start++) {
    const t = tokens[start];
    if (isArticleToken(t)) continue;
    const bare = withoutArticle(t.key, script);
    if (bare && (bare === form.base || withoutArticle(t.alias, script) === form.alias)) return { kind: 'possible', start, length: 1 };
    if (isChangedForm(t.key, form.base, script)) return { kind: 'possible', start, length: 1 };
  }
  return null;
}

const better = (a: Hit | null, b: Hit | null) => (!a ? b : !b ? a : a.kind === 'match' || b.kind !== 'match' ? a : b);

export function suggestWordLinks(phrase: WordGroupWithVariants, candidates: readonly WordGroupWithVariants[]): WordLinkSuggestion[] {
  const phraseForm = phrase.variants.find((v) => v.variantLabel === 'primary') ?? phrase.variants[0];
  if (!phraseForm) return [];
  const latin = tokenize(phraseForm.transliteration ?? '', 'latin');
  const arabic = tokenize(phraseForm.wordArabic ?? '', 'arabic');
  const aligned = latin.length === arabic.length;

  const suggestions: WordLinkSuggestion[] = [];
  for (const word of candidates) {
    if (word.id === phrase.id || isGone(word.contentStatus)) continue;
    let latinHit: Hit | null = null;
    let arabicHit: Hit | null = null;
    let matchedForm: WordVariant | null = null;
    for (const form of word.variants) {
      if (isGone(form.contentStatus)) continue;
      const l = findForm(latin, form.transliteration ?? '', 'latin');
      const a = findForm(arabic, form.wordArabic ?? '', 'arabic');
      const nextLatin = better(latinHit, l);
      const nextArabic = better(arabicHit, a);
      if (nextLatin !== latinHit || nextArabic !== arabicHit) matchedForm = form;
      latinHit = nextLatin;
      arabicHit = nextArabic;
    }
    if (!latinHit && !arabicHit) continue;

    const kind: SuggestionKind = latinHit?.kind === 'match' || arabicHit?.kind === 'match' ? 'match' : 'possible';
    const span = (tokens: Token[], hit: Hit) => tokens.slice(hit.start, hit.start + hit.length).map((t) => t.text).join(' ');
    const shownLatin = latinHit
      ? span(latin, latinHit)
      : aligned && arabicHit
        ? span(latin, arabicHit)
        : (matchedForm?.transliteration ?? '');
    const shownArabic = arabicHit
      ? span(arabic, arabicHit)
      : aligned && latinHit
        ? span(arabic, latinHit)
        : (matchedForm?.wordArabic ?? '');
    const lead = latinHit ?? arabicHit!;
    const tokensOfLead = latinHit ? latin : arabic;
    suggestions.push({
      wordId: word.id,
      kind,
      ticked: kind === 'match',
      shownArabic,
      shownLatin,
      order: tokensOfLead.length > 0 ? lead.start / tokensOfLead.length : 0,
    });
  }
  return suggestions.sort((a, b) => a.order - b.order || a.wordId.localeCompare(b.wordId));
}
