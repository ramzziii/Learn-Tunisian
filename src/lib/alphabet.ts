export type LetterForms = {
  isolated: string;
  initial: string;
  medial: string;
  final: string;
};

export type LetterExample = {
  arabic: string;
  transliteration: string;
  english: string;
  /** A cosmetic emoji stand-in for a real photo — same "placeholder picture" convention as src/constants/placeholderVisuals.ts uses for word_groups. */
  emoji?: string;
};

export type PhoneticCue = {
  /** Romanized reading of the letter + a short "a" vowel, e.g. "Ba", "Tha". */
  sound: string;
  /** A common English word carrying that same sound, e.g. "Bank" for "Ba". */
  exampleWord: string;
};

export type DiacriticId = 'fatha' | 'damma' | 'kasra';

export type ArabicLetter = {
  id: string;
  label: string;
  name: string;
  transliteration: string;
  sound: string;
  forms: LetterForms;
  examples: [LetterExample, LetterExample];
  phoneticCue: PhoneticCue;
  /** Groups letters that share the same base glyph shape (differing only in dot count/placement) — the classic beginner mix-up set, used to pick distractors that actually test visual discrimination instead of random letters. */
  similarShapeGroup: string;
  /** One example word per short vowel, for the per-letter diacritics screen. */
  vowelExamples: Record<DiacriticId, LetterExample>;
};

export type Diacritic = {
  id: string;
  symbol: string;
  name: string;
  soundHint: string;
  exampleLetter: string;
  exampleReading: string;
};

// U+0640 ARABIC TATWEEL. Arabic text shaping is contextual — a letter's
// glyph shape depends on its connecting neighbors, not on any separate
// "form" codepoint. Padding a letter with tatweel on either side gives the
// platform's own Arabic text shaper (CoreText/HarfBuzz) the neighbors it
// needs to render the initial/medial/final connected shapes, without us
// having to hardcode presentation-form glyphs per letter.
const TATWEEL = 'ـ';

// U+064E ARABIC FATHA — the short "a" vowel diacritic, used to render a
// letter's vocalized "consonant + a" reading (e.g. ب + fatha = "ba").
export const FATHA_SYMBOL = 'َ';

function formsOf(letter: string): LetterForms {
  return {
    isolated: letter,
    initial: `${letter}${TATWEEL}`,
    medial: `${TATWEEL}${letter}${TATWEEL}`,
    final: `${TATWEEL}${letter}`,
  };
}

/** A letter's isolated form with a fatha, e.g. "بَ" — how the sound-match exercise displays each option. */
export function withFatha(letter: ArabicLetter): string {
  return `${letter.label}${FATHA_SYMBOL}`;
}

const VOWEL_SUFFIX: Record<DiacriticId, string> = { fatha: 'aa', damma: 'oo', kasra: 'ee' };

/**
 * A friendly phonetic spelling of a letter vocalized with one short vowel —
 * e.g. baa/boo/bee for ب — built from its transliteration rather than
 * authored per letter, so it stays consistent across all 27 letters.
 * ع (Ayn) is the one special case: its transliteration is itself a vowel
 * ("a"), so the consonant is dropped to avoid a doubled-up "aaa"/"aoo".
 */
export function buildVocalizedReading(letter: ArabicLetter, diacriticId: DiacriticId): string {
  const base = letter.id === 'ain' ? '' : letter.transliteration;
  const reading = base + VOWEL_SUFFIX[diacriticId];
  return reading.charAt(0).toUpperCase() + reading.slice(1);
}

export interface VocalizedForm {
  diacritic: Diacritic;
  glyph: string;
  reading: string;
  example: LetterExample;
}

/** The three vocalized forms (fatha/damma/kasra) of a letter, for the per-letter diacritics screen. */
export function getVocalizedForms(letter: ArabicLetter): VocalizedForm[] {
  return DIACRITICS.map((diacritic) => ({
    diacritic,
    glyph: `${letter.label}${diacritic.symbol}`,
    reading: buildVocalizedReading(letter, diacritic.id as DiacriticId),
    example: letter.vowelExamples[diacritic.id as DiacriticId],
  }));
}

// Arabic diacritic/combining-mark ranges (harakat, tanween, sukoon, etc.) —
// used to keep a highlighted letter's own vowel mark attached to it instead
// of splitting the glyph from its diacritic across two differently-styled
// <Text> spans.
const ARABIC_COMBINING_MARK = /[ؐ-ًؚ-ٰٟۖ-ۭ]/;

export interface HighlightedWord {
  before: string;
  match: string;
  after: string;
}

/**
 * Splits a word around the first occurrence of a letter's base glyph (plus
 * any diacritic immediately following it), so the UI can render that one
 * letter highlighted inline within the word. Returns null if the letter
 * doesn't appear (shouldn't happen for this app's own example data, but a
 * word typed elsewhere could legitimately not contain the letter).
 */
export function splitAtLetter(word: string, letter: ArabicLetter): HighlightedWord | null {
  const index = word.indexOf(letter.label);
  if (index === -1) return null;

  let end = index + letter.label.length;
  while (end < word.length && ARABIC_COMBINING_MARK.test(word[end])) {
    end += 1;
  }

  return { before: word.slice(0, index), match: word.slice(index, end), after: word.slice(end) };
}

// Pedagogical order matches how the letters are taught: the 6 non-connecting
// letters (dal/dhal/raa/zaay/waw + alif, which isn't quizzed as its own
// consonant) fall out of formsOf() naturally — they simply won't visually
// change shape in the initial/medial slots, which is the linguistically
// correct behavior, not a bug.
export const ARABIC_LETTERS: ArabicLetter[] = [
  { id: 'baa', label: 'ب', name: 'Baa', transliteration: 'b', sound: 'b', forms: formsOf('ب'), similarShapeGroup: 'teeth', phoneticCue: { sound: 'Ba', exampleWord: 'Bank' }, vowelExamples: {
    fatha: { arabic: 'بَطة', transliteration: 'batta', english: 'duck', emoji: '🦆' },
    damma: { arabic: 'بُرتقال', transliteration: 'burtuqal', english: 'orange', emoji: '🍊' },
    kasra: { arabic: 'بِنت', transliteration: 'bint', english: 'girl', emoji: '👧' },
  }, examples: [
    { arabic: 'بيت', transliteration: 'bayt', english: 'house' },
    { arabic: 'باب', transliteration: 'baab', english: 'door' },
  ] },
  { id: 'taa', label: 'ت', name: 'Taa', transliteration: 't', sound: 't', forms: formsOf('ت'), similarShapeGroup: 'teeth', phoneticCue: { sound: 'Ta', exampleWord: 'Tank' }, vowelExamples: {
    fatha: { arabic: 'تَفاح', transliteration: 'tuffah', english: 'apple', emoji: '🍎' },
    damma: { arabic: 'تُوت', transliteration: 'toot', english: 'berry', emoji: '🍓' },
    kasra: { arabic: 'تِمساح', transliteration: 'timsah', english: 'crocodile', emoji: '🐊' },
  }, examples: [
    { arabic: 'تفاح', transliteration: 'tuffah', english: 'apple' },
    { arabic: 'تمر', transliteration: 'tamr', english: 'dates' },
  ] },
  { id: 'thaa', label: 'ث', name: 'Thaa', transliteration: 'th', sound: 'th', forms: formsOf('ث'), similarShapeGroup: 'teeth', phoneticCue: { sound: 'Tha', exampleWord: 'Thanks' }, vowelExamples: {
    fatha: { arabic: 'ثَعلب', transliteration: "tha'lab", english: 'fox', emoji: '🦊' },
    damma: { arabic: 'ثُعبان', transliteration: "thu'ban", english: 'snake', emoji: '🐍' },
    kasra: { arabic: 'ثِمار', transliteration: 'thimar', english: 'fruits', emoji: '🍇' },
  }, examples: [
    { arabic: 'ثعلب', transliteration: "tha'lab", english: 'fox' },
    { arabic: 'ثلج', transliteration: 'thalj', english: 'snow' },
  ] },
  { id: 'jeem', label: 'ج', name: 'Jeem', transliteration: 'j', sound: 'j', forms: formsOf('ج'), similarShapeGroup: 'hook', phoneticCue: { sound: 'Ja', exampleWord: 'Jar' }, vowelExamples: {
    fatha: { arabic: 'جَمل', transliteration: 'jamal', english: 'camel', emoji: '🐫' },
    damma: { arabic: 'جُبن', transliteration: 'jubn', english: 'cheese', emoji: '🧀' },
    kasra: { arabic: 'جِسم', transliteration: 'jism', english: 'body', emoji: '🧍' },
  }, examples: [
    { arabic: 'جمل', transliteration: 'jamal', english: 'camel' },
    { arabic: 'جبل', transliteration: 'jabal', english: 'mountain' },
  ] },
  { id: 'haa', label: 'ح', name: 'Haa', transliteration: 'h', sound: 'h', forms: formsOf('ح'), similarShapeGroup: 'hook', phoneticCue: { sound: 'Ha', exampleWord: 'Hat' }, vowelExamples: {
    fatha: { arabic: 'حَليب', transliteration: 'haleeb', english: 'milk', emoji: '🥛' },
    damma: { arabic: 'حُوت', transliteration: 'hoot', english: 'whale', emoji: '🐋' },
    kasra: { arabic: 'حِصان', transliteration: 'hisan', english: 'horse', emoji: '🐎' },
  }, examples: [
    { arabic: 'حصان', transliteration: 'hisan', english: 'horse' },
    { arabic: 'حليب', transliteration: 'haleeb', english: 'milk' },
  ] },
  { id: 'khaa', label: 'خ', name: 'Khaa', transliteration: 'kh', sound: 'kh', forms: formsOf('خ'), similarShapeGroup: 'hook', phoneticCue: { sound: 'Kha', exampleWord: 'Khaki' }, vowelExamples: {
    fatha: { arabic: 'خَروف', transliteration: 'kharoof', english: 'sheep', emoji: '🐑' },
    damma: { arabic: 'خُبز', transliteration: 'khubz', english: 'bread', emoji: '🍞' },
    kasra: { arabic: 'خِيار', transliteration: 'khiyar', english: 'cucumber', emoji: '🥒' },
  }, examples: [
    { arabic: 'خبز', transliteration: 'khubz', english: 'bread' },
    { arabic: 'خروف', transliteration: 'kharoof', english: 'sheep' },
  ] },
  { id: 'dal', label: 'د', name: 'Dal', transliteration: 'd', sound: 'd', forms: formsOf('د'), similarShapeGroup: 'dal', phoneticCue: { sound: 'Da', exampleWord: 'Dad' }, vowelExamples: {
    fatha: { arabic: 'دَجاجة', transliteration: 'dajaja', english: 'chicken', emoji: '🐔' },
    damma: { arabic: 'دُب', transliteration: 'dubb', english: 'bear', emoji: '🐻' },
    kasra: { arabic: 'ديك', transliteration: 'deek', english: 'rooster', emoji: '🐓' },
  }, examples: [
    { arabic: 'دار', transliteration: 'daar', english: 'house' },
    { arabic: 'ديك', transliteration: 'deek', english: 'rooster' },
  ] },
  { id: 'dhaal', label: 'ذ', name: 'Dhal', transliteration: 'dh', sound: 'dh', forms: formsOf('ذ'), similarShapeGroup: 'dal', phoneticCue: { sound: 'Dha', exampleWord: 'That' }, vowelExamples: {
    fatha: { arabic: 'ذَهب', transliteration: 'dhahab', english: 'gold', emoji: '🪙' },
    damma: { arabic: 'ذُباب', transliteration: 'dhubab', english: 'fly', emoji: '🪰' },
    kasra: { arabic: 'ذِئب', transliteration: "dhi'b", english: 'wolf', emoji: '🐺' },
  }, examples: [
    { arabic: 'ذيل', transliteration: 'dhayl', english: 'tail' },
    { arabic: 'ذهب', transliteration: 'dhahab', english: 'gold' },
  ] },
  { id: 'ra', label: 'ر', name: 'Raa', transliteration: 'r', sound: 'r', forms: formsOf('ر'), similarShapeGroup: 'raa', phoneticCue: { sound: 'Ra', exampleWord: 'Rat' }, vowelExamples: {
    fatha: { arabic: 'رَمل', transliteration: 'raml', english: 'sand', emoji: '🏖️' },
    damma: { arabic: 'رُمان', transliteration: 'rumman', english: 'pomegranate', emoji: '🍈' },
    kasra: { arabic: 'رِجل', transliteration: 'rijl', english: 'leg', emoji: '🦵' },
  }, examples: [
    { arabic: 'رمل', transliteration: 'raml', english: 'sand' },
    { arabic: 'ريح', transliteration: 'reeh', english: 'wind' },
  ] },
  { id: 'zaay', label: 'ز', name: 'Zay', transliteration: 'z', sound: 'z', forms: formsOf('ز'), similarShapeGroup: 'raa', phoneticCue: { sound: 'Za', exampleWord: 'Zap' }, vowelExamples: {
    fatha: { arabic: 'زَهرة', transliteration: 'zahra', english: 'flower', emoji: '🌸' },
    damma: { arabic: 'زُبدة', transliteration: 'zubda', english: 'butter', emoji: '🧈' },
    kasra: { arabic: 'زِينة', transliteration: 'zeena', english: 'decoration', emoji: '🎀' },
  }, examples: [
    { arabic: 'زيت', transliteration: 'zayt', english: 'oil' },
    { arabic: 'زهرة', transliteration: 'zahra', english: 'flower' },
  ] },
  { id: 'seen', label: 'س', name: 'Seen', transliteration: 's', sound: 's', forms: formsOf('س'), similarShapeGroup: 'seen', phoneticCue: { sound: 'Sa', exampleWord: 'Sad' }, vowelExamples: {
    fatha: { arabic: 'سَمك', transliteration: 'samak', english: 'fish', emoji: '🐟' },
    damma: { arabic: 'سُكر', transliteration: 'sukkar', english: 'sugar', emoji: '🍬' },
    kasra: { arabic: 'سِكين', transliteration: 'sikkeen', english: 'knife', emoji: '🔪' },
  }, examples: [
    { arabic: 'سمك', transliteration: 'samak', english: 'fish' },
    { arabic: 'سيارة', transliteration: 'sayyara', english: 'car' },
  ] },
  { id: 'sheen', label: 'ش', name: 'Sheen', transliteration: 'sh', sound: 'sh', forms: formsOf('ش'), similarShapeGroup: 'seen', phoneticCue: { sound: 'Sha', exampleWord: 'Shark' }, vowelExamples: {
    fatha: { arabic: 'شَمس', transliteration: 'shams', english: 'sun', emoji: '☀️' },
    damma: { arabic: 'شُجاع', transliteration: "shuja'", english: 'brave', emoji: '🦁' },
    kasra: { arabic: 'شِتاء', transliteration: "shita'", english: 'winter', emoji: '❄️' },
  }, examples: [
    { arabic: 'شمس', transliteration: 'shams', english: 'sun' },
    { arabic: 'شجرة', transliteration: 'shajara', english: 'tree' },
  ] },
  { id: 'saad', label: 'ص', name: 'Saad', transliteration: 's', sound: 's', forms: formsOf('ص'), similarShapeGroup: 'saad', phoneticCue: { sound: 'Sa', exampleWord: 'Sun' }, vowelExamples: {
    fatha: { arabic: 'صَقر', transliteration: 'saqr', english: 'falcon', emoji: '🦅' },
    damma: { arabic: 'صُورة', transliteration: 'soora', english: 'picture', emoji: '🖼️' },
    kasra: { arabic: 'صِغير', transliteration: 'sagheer', english: 'small', emoji: '🤏' },
  }, examples: [
    { arabic: 'صقر', transliteration: 'saqr', english: 'falcon' },
    { arabic: 'صورة', transliteration: "soora", english: 'picture' },
  ] },
  { id: 'daad', label: 'ض', name: 'Dhad', transliteration: 'dh', sound: 'dh', forms: formsOf('ض'), similarShapeGroup: 'saad', phoneticCue: { sound: 'Da', exampleWord: 'Dot' }, vowelExamples: {
    fatha: { arabic: 'ضَوء', transliteration: "daw'", english: 'light', emoji: '💡' },
    damma: { arabic: 'ضُحى', transliteration: 'duha', english: 'morning', emoji: '🌄' },
    kasra: { arabic: 'ضِفدع', transliteration: "difda'", english: 'frog', emoji: '🐸' },
  }, examples: [
    { arabic: 'ضفدع', transliteration: "difda'", english: 'frog' },
    { arabic: 'ضوء', transliteration: "daw'", english: 'light' },
  ] },
  { id: 'taa2', label: 'ط', name: 'Taa', transliteration: 't', sound: 't', forms: formsOf('ط'), similarShapeGroup: 'taa2', phoneticCue: { sound: 'Ta', exampleWord: 'Top' }, vowelExamples: {
    fatha: { arabic: 'طاولة', transliteration: 'tawila', english: 'table', emoji: '🍽️' },
    damma: { arabic: 'طُول', transliteration: 'tool', english: 'height', emoji: '📏' },
    kasra: { arabic: 'طِفل', transliteration: 'tifl', english: 'child', emoji: '👶' },
  }, examples: [
    { arabic: 'طائرة', transliteration: "ta'ira", english: 'airplane' },
    { arabic: 'طاولة', transliteration: 'tawila', english: 'table' },
  ] },
  { id: 'dhaa', label: 'ظ', name: 'Dhaa', transliteration: 'dh', sound: 'dh', forms: formsOf('ظ'), similarShapeGroup: 'taa2', phoneticCue: { sound: 'Dha', exampleWord: 'Then' }, vowelExamples: {
    fatha: { arabic: 'ظَبي', transliteration: 'dhabee', english: 'deer', emoji: '🦌' },
    damma: { arabic: 'ظُهر', transliteration: 'dhuhr', english: 'noon', emoji: '🕛' },
    kasra: { arabic: 'ظِل', transliteration: 'dhill', english: 'shadow', emoji: '🌑' },
  }, examples: [
    { arabic: 'ظل', transliteration: 'dhill', english: 'shadow' },
    { arabic: 'ظرف', transliteration: 'dharf', english: 'envelope' },
  ] },
  { id: 'ain', label: 'ع', name: 'Ayn', transliteration: 'a', sound: 'a', forms: formsOf('ع'), similarShapeGroup: 'ain', phoneticCue: { sound: 'A', exampleWord: 'Arm' }, vowelExamples: {
    fatha: { arabic: 'عَين', transliteration: 'ayn', english: 'eye', emoji: '👁️' },
    damma: { arabic: 'عُصفور', transliteration: 'asfoor', english: 'bird', emoji: '🐦' },
    kasra: { arabic: 'عِلم', transliteration: 'ilm', english: 'knowledge', emoji: '📚' },
  }, examples: [
    { arabic: 'عين', transliteration: 'ayn', english: 'eye' },
    { arabic: 'عصفور', transliteration: 'asfoor', english: 'bird' },
  ] },
  { id: 'ghayn', label: 'غ', name: 'Ghayn', transliteration: 'gh', sound: 'gh', forms: formsOf('غ'), similarShapeGroup: 'ain', phoneticCue: { sound: 'Gha', exampleWord: 'Guard' }, vowelExamples: {
    fatha: { arabic: 'غَزال', transliteration: 'ghazal', english: 'gazelle', emoji: '🦌' },
    damma: { arabic: 'غُراب', transliteration: 'ghurab', english: 'crow', emoji: '🐦‍⬛' },
    kasra: { arabic: 'غِطاء', transliteration: "ghita'", english: 'cover', emoji: '🫙' },
  }, examples: [
    { arabic: 'غزال', transliteration: 'ghazal', english: 'gazelle' },
    { arabic: 'غيمة', transliteration: 'ghayma', english: 'cloud' },
  ] },
  { id: 'faa', label: 'ف', name: 'Faa', transliteration: 'f', sound: 'f', forms: formsOf('ف'), similarShapeGroup: 'faa', phoneticCue: { sound: 'Fa', exampleWord: 'Fan' }, vowelExamples: {
    fatha: { arabic: 'فَراشة', transliteration: 'farasha', english: 'butterfly', emoji: '🦋' },
    damma: { arabic: 'فُستان', transliteration: 'fustan', english: 'dress', emoji: '👗' },
    kasra: { arabic: 'فيل', transliteration: 'feel', english: 'elephant', emoji: '🐘' },
  }, examples: [
    { arabic: 'فيل', transliteration: 'feel', english: 'elephant' },
    { arabic: 'فراشة', transliteration: 'farasha', english: 'butterfly' },
  ] },
  { id: 'qaaf', label: 'ق', name: 'Qaaf', transliteration: 'q', sound: 'q', forms: formsOf('ق'), similarShapeGroup: 'faa', phoneticCue: { sound: 'Qa', exampleWord: 'Cup' }, vowelExamples: {
    fatha: { arabic: 'قَمر', transliteration: 'qamar', english: 'moon', emoji: '🌙' },
    damma: { arabic: 'قُطن', transliteration: 'qutn', english: 'cotton', emoji: '☁️' },
    kasra: { arabic: 'قِطة', transliteration: 'qitta', english: 'cat', emoji: '🐱' },
  }, examples: [
    { arabic: 'قمر', transliteration: 'qamar', english: 'moon' },
    { arabic: 'قطة', transliteration: 'qitta', english: 'cat' },
  ] },
  { id: 'kaaf', label: 'ك', name: 'Kaaf', transliteration: 'k', sound: 'k', forms: formsOf('ك'), similarShapeGroup: 'kaaf', phoneticCue: { sound: 'Ka', exampleWord: 'Cat' }, vowelExamples: {
    fatha: { arabic: 'كَلب', transliteration: 'kalb', english: 'dog', emoji: '🐶' },
    damma: { arabic: 'كُرة', transliteration: 'kura', english: 'ball', emoji: '⚽' },
    kasra: { arabic: 'كتاب', transliteration: 'kitab', english: 'book', emoji: '📖' },
  }, examples: [
    { arabic: 'كتاب', transliteration: 'kitab', english: 'book' },
    { arabic: 'كلب', transliteration: 'kalb', english: 'dog' },
  ] },
  { id: 'laam', label: 'ل', name: 'Laam', transliteration: 'l', sound: 'l', forms: formsOf('ل'), similarShapeGroup: 'laam', phoneticCue: { sound: 'La', exampleWord: 'Lamp' }, vowelExamples: {
    fatha: { arabic: 'ليمون', transliteration: 'laymoon', english: 'lemon', emoji: '🍋' },
    damma: { arabic: 'لعبة', transliteration: "lu'ba", english: 'toy', emoji: '🧸' },
    kasra: { arabic: 'لِسان', transliteration: 'lisan', english: 'tongue', emoji: '👅' },
  }, examples: [
    { arabic: 'ليمون', transliteration: 'laymoon', english: 'lemon' },
    { arabic: 'لعبة', transliteration: "lu'ba", english: 'toy' },
  ] },
  { id: 'meem', label: 'م', name: 'Meem', transliteration: 'm', sound: 'm', forms: formsOf('م'), similarShapeGroup: 'meem', phoneticCue: { sound: 'Ma', exampleWord: 'Map' }, vowelExamples: {
    fatha: { arabic: 'موز', transliteration: 'mawz', english: 'banana', emoji: '🍌' },
    damma: { arabic: 'مُمتاز', transliteration: 'mumtaz', english: 'excellent', emoji: '🌟' },
    kasra: { arabic: 'مفتاح', transliteration: 'miftah', english: 'key', emoji: '🔑' },
  }, examples: [
    { arabic: 'موز', transliteration: 'mawz', english: 'banana' },
    { arabic: 'مفتاح', transliteration: 'miftah', english: 'key' },
  ] },
  { id: 'noon', label: 'ن', name: 'Noon', transliteration: 'n', sound: 'n', forms: formsOf('ن'), similarShapeGroup: 'teeth', phoneticCue: { sound: 'Na', exampleWord: 'Nap' }, vowelExamples: {
    fatha: { arabic: 'نجمة', transliteration: 'najma', english: 'star', emoji: '⭐' },
    damma: { arabic: 'نُور', transliteration: 'noor', english: 'light', emoji: '💡' },
    kasra: { arabic: 'نمر', transliteration: 'nimr', english: 'tiger', emoji: '🐯' },
  }, examples: [
    { arabic: 'نجمة', transliteration: 'najma', english: 'star' },
    { arabic: 'نمر', transliteration: 'nimr', english: 'tiger' },
  ] },
  { id: 'heh', label: 'ه', name: 'Ha', transliteration: 'h', sound: 'h', forms: formsOf('ه'), similarShapeGroup: 'heh', phoneticCue: { sound: 'Ha', exampleWord: 'Home' }, vowelExamples: {
    fatha: { arabic: 'هدية', transliteration: 'hadiya', english: 'gift', emoji: '🎁' },
    damma: { arabic: 'هُدهد', transliteration: 'hudhud', english: 'hoopoe bird', emoji: '🐦' },
    kasra: { arabic: 'هلال', transliteration: 'hilal', english: 'crescent', emoji: '🌙' },
  }, examples: [
    { arabic: 'هدية', transliteration: 'hadiya', english: 'gift' },
    { arabic: 'هلال', transliteration: 'hilal', english: 'crescent' },
  ] },
  { id: 'waaw', label: 'و', name: 'Waw', transliteration: 'w', sound: 'w', forms: formsOf('و'), similarShapeGroup: 'waaw', phoneticCue: { sound: 'Wa', exampleWord: 'Water' }, vowelExamples: {
    fatha: { arabic: 'وردة', transliteration: 'warda', english: 'rose', emoji: '🌹' },
    damma: { arabic: 'وُرود', transliteration: 'wurood', english: 'roses', emoji: '💐' },
    kasra: { arabic: 'وِسادة', transliteration: 'wisada', english: 'pillow', emoji: '🛏️' },
  }, examples: [
    { arabic: 'وردة', transliteration: 'warda', english: 'rose' },
    { arabic: 'ولد', transliteration: 'walad', english: 'boy' },
  ] },
  { id: 'yaa', label: 'ي', name: 'Yaa', transliteration: 'y', sound: 'y', forms: formsOf('ي'), similarShapeGroup: 'teeth', phoneticCue: { sound: 'Ya', exampleWord: 'Yard' }, vowelExamples: {
    fatha: { arabic: 'يَد', transliteration: 'yad', english: 'hand', emoji: '✋' },
    damma: { arabic: 'يُوسف', transliteration: 'yousef', english: 'Joseph (name)', emoji: '👦' },
    kasra: { arabic: 'يِفهم', transliteration: 'yifhem', english: 'he understands', emoji: '🤔' },
  }, examples: [
    { arabic: 'يد', transliteration: 'yad', english: 'hand' },
    { arabic: 'يوم', transliteration: 'yawm', english: 'day' },
  ] },
];

export const DIACRITICS: Diacritic[] = [
  { id: 'fatha', symbol: FATHA_SYMBOL, name: 'Fatha', soundHint: 'a short "a" sound', exampleLetter: 'ب', exampleReading: 'ba' },
  { id: 'damma', symbol: 'ُ', name: 'Damma', soundHint: 'a short "u" sound', exampleLetter: 'ب', exampleReading: 'bu' },
  { id: 'kasra', symbol: 'ِ', name: 'Kasra', soundHint: 'a short "i" sound', exampleLetter: 'ب', exampleReading: 'bi' },
];

export function buildAlphabetSet() {
  return ARABIC_LETTERS;
}

export function getLetterById(id: string): ArabicLetter | undefined {
  return ARABIC_LETTERS.find((letter) => letter.id === id);
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildAlphabetChoices(correctId: string, count = 4): string[] {
  const pool = ARABIC_LETTERS.filter((letter) => letter.id !== correctId);
  const picks: string[] = [correctId];

  while (picks.length < count) {
    const next = pool[Math.floor(Math.random() * pool.length)];
    if (!next || picks.includes(next.id)) continue;
    picks.push(next.id);
  }

  return shuffled(picks);
}

/**
 * Distractors preferentially come from the same `similarShapeGroup` as the
 * target — letters that share a base glyph shape and differ only in dots
 * (ب/ت/ث/ن/ي, ج/ح/خ, etc.) are the classic beginner mix-up, so testing
 * against those is more useful than testing against a random letter that
 * looks nothing alike. Falls back to random letters only when a group is
 * too small (several letters have no close visual neighbor in this set).
 */
export function buildSimilarLetterChoices(correctId: string, count = 4): string[] {
  const target = getLetterById(correctId)!;
  const picks: string[] = [correctId];

  const sameGroup = shuffled(
    ARABIC_LETTERS.filter((letter) => letter.id !== correctId && letter.similarShapeGroup === target.similarShapeGroup)
  );
  for (const letter of sameGroup) {
    if (picks.length >= count) break;
    picks.push(letter.id);
  }

  if (picks.length < count) {
    const rest = shuffled(ARABIC_LETTERS.filter((letter) => !picks.includes(letter.id)));
    for (const letter of rest) {
      if (picks.length >= count) break;
      picks.push(letter.id);
    }
  }

  return shuffled(picks);
}

export type AlphabetExerciseKind = 'true_false' | 'listen_choose' | 'choose_sound' | 'sound_match';

const EXERCISE_KIND_CYCLE: AlphabetExerciseKind[] = ['listen_choose', 'true_false', 'sound_match', 'choose_sound'];

export interface AlphabetExerciseItem {
  key: string;
  kind: AlphabetExerciseKind;
  letterId: string;
}

/** A fixed-length, shuffled queue mixing the four alphabet exercise kinds — alphabet practice is a short bite-sized round, not a time-based session like the main lessons. */
export function buildAlphabetExerciseQueue(size = 8): AlphabetExerciseItem[] {
  const letterOrder = shuffled(ARABIC_LETTERS);
  const items: AlphabetExerciseItem[] = [];
  for (let i = 0; i < size; i++) {
    const letter = letterOrder[i % letterOrder.length];
    const kind = EXERCISE_KIND_CYCLE[i % EXERCISE_KIND_CYCLE.length];
    items.push({ key: `${letter.id}-${i}`, kind, letterId: letter.id });
  }
  return items;
}

export interface TrueFalseQuestion {
  audioLetterId: string;
  shownLetterId: string;
  isMatch: boolean;
}

/** Roughly half the time the shown letter matches the spoken one, half the time it's a different letter. */
export function buildTrueFalseQuestion(letterId: string): TrueFalseQuestion {
  const isMatch = Math.random() < 0.5;
  if (isMatch) {
    return { audioLetterId: letterId, shownLetterId: letterId, isMatch: true };
  }
  const pool = ARABIC_LETTERS.filter((letter) => letter.id !== letterId);
  const distractor = pool[Math.floor(Math.random() * pool.length)];
  return { audioLetterId: letterId, shownLetterId: distractor.id, isMatch: false };
}

export interface MatchingTile {
  tileId: string;
  letterId: string;
  kind: 'glyph' | 'name';
}

/** Builds a shuffled grid of glyph/name tile pairs for the timed matching game. */
export function buildMatchingGrid(pairCount = 6): MatchingTile[] {
  const chosen = shuffled(ARABIC_LETTERS).slice(0, pairCount);
  const tiles: MatchingTile[] = chosen.flatMap((letter) => [
    { tileId: `${letter.id}-glyph`, letterId: letter.id, kind: 'glyph' as const },
    { tileId: `${letter.id}-name`, letterId: letter.id, kind: 'name' as const },
  ]);
  return shuffled(tiles);
}
