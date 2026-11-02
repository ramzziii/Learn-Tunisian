/**
 * Search keys — the one place that turns text into something to match on.
 * The stored spelling is never modified: these are separate keys built from
 * it (and from the query, the same way).
 *
 * Sounds that differ are never merged: 7 (ح) ≠ h, 3 (ع) ≠ a, 9 (ق) ≠ k,
 * 5 (خ) ≠ k, 8 (غ) ≠ g, 2 (ء) ≠ a. Only LATIN_ALIASES (the same letter
 * written two ways) and alef forms meet, and only in a separate alias key
 * that ranks lower. Not merged (not approved; would need native-reviewer
 * confirmation): sh / ch, u / ou, ة / ه, ى / ي.
 */

/** Approved Latin aliases: each row is one Arabic letter with two common spellings. */
export const LATIN_ALIASES: readonly { sound: string; canonical: string; alternatives: readonly string[] }[] = [
  { sound: 'خ (kh)', canonical: '5', alternatives: ['kh'] },
  { sound: 'غ (gh)', canonical: '8', alternatives: ['gh'] },
  { sound: 'ق (q)', canonical: '9', alternatives: ['q'] },
  { sound: 'ح (ḥ)', canonical: '7', alternatives: ['ḥ'] },
  { sound: 'ع (ʿayn)', canonical: '3', alternatives: ['ʿ', 'ʕ'] },
  // Hamza: written 2 or as an apostrophe. The base key ignores apostrophes;
  // the alias key turns them into 2 instead, so ء never meets a bare vowel.
  { sound: 'ء (hamza)', canonical: '2', alternatives: ["'", '’', 'ʼ'] },
];

const ARABIC_LETTER = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
// Harakat, small superscript alef, and tatweel.
const ARABIC_MARKS = /[\u064B-\u065F\u0670\u0640]/g;
const ALEF_FORMS = /[\u0623\u0625\u0622\u0671]/g; // أ إ آ ٱ
// Apostrophes (incl. curly and modifier forms), backtick, hyphens, whitespace.
const LATIN_IGNORED = /[\s'’‘ʼ`\-‐‑–—]/g;
const HAMZA_APOSTROPHES = /['’ʼ]/g;

export function containsArabic(text: string): boolean {
  return ARABIC_LETTER.test(text);
}

export function englishKey(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function arabicKeys(text: string): { base: string; alias: string } {
  const base = text.normalize('NFC').replace(ARABIC_MARKS, '').replace(/\s+/g, ' ').trim();
  return { base, alias: base.replace(ALEF_FORMS, '\u0627') };
}

export function latinKeys(text: string): { base: string; alias: string } {
  const lower = text.normalize('NFC').toLowerCase();
  const base = lower.replace(LATIN_IGNORED, '');
  let alias = lower.replace(HAMZA_APOSTROPHES, '2').replace(LATIN_IGNORED, '');
  for (const { canonical, alternatives } of LATIN_ALIASES) {
    if (canonical === '2') continue; // handled above, before apostrophes are dropped
    for (const alt of alternatives) alias = alias.split(alt).join(canonical);
  }
  return { base, alias };
}
