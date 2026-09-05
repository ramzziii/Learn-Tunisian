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
};

export type PhoneticCue = {
  /** Romanized reading of the letter + a short "a" vowel, e.g. "Ba", "Tha". */
  sound: string;
  /** A common English word carrying that same sound, e.g. "Bank" for "Ba". */
  exampleWord: string;
};

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

// Pedagogical order matches how the letters are taught: the 6 non-connecting
// letters (dal/dhal/raa/zaay/waw + alif, which isn't quizzed as its own
// consonant) fall out of formsOf() naturally — they simply won't visually
// change shape in the initial/medial slots, which is the linguistically
// correct behavior, not a bug.
export const ARABIC_LETTERS: ArabicLetter[] = [
  { id: 'baa', label: 'ب', name: 'Baa', transliteration: 'b', sound: 'b', forms: formsOf('ب'), similarShapeGroup: 'teeth', phoneticCue: { sound: 'Ba', exampleWord: 'Bank' }, examples: [
    { arabic: 'بيت', transliteration: 'bayt', english: 'house' },
    { arabic: 'باب', transliteration: 'baab', english: 'door' },
  ] },
  { id: 'taa', label: 'ت', name: 'Taa', transliteration: 't', sound: 't', forms: formsOf('ت'), similarShapeGroup: 'teeth', phoneticCue: { sound: 'Ta', exampleWord: 'Tank' }, examples: [
    { arabic: 'تفاح', transliteration: 'tuffah', english: 'apple' },
    { arabic: 'تمر', transliteration: 'tamr', english: 'dates' },
  ] },
  { id: 'thaa', label: 'ث', name: 'Thaa', transliteration: 'th', sound: 'th', forms: formsOf('ث'), similarShapeGroup: 'teeth', phoneticCue: { sound: 'Tha', exampleWord: 'Thanks' }, examples: [
    { arabic: 'ثعلب', transliteration: "tha'lab", english: 'fox' },
    { arabic: 'ثلج', transliteration: 'thalj', english: 'snow' },
  ] },
  { id: 'jeem', label: 'ج', name: 'Jeem', transliteration: 'j', sound: 'j', forms: formsOf('ج'), similarShapeGroup: 'hook', phoneticCue: { sound: 'Ja', exampleWord: 'Jar' }, examples: [
    { arabic: 'جمل', transliteration: 'jamal', english: 'camel' },
    { arabic: 'جبل', transliteration: 'jabal', english: 'mountain' },
  ] },
  { id: 'haa', label: 'ح', name: 'Haa', transliteration: 'h', sound: 'h', forms: formsOf('ح'), similarShapeGroup: 'hook', phoneticCue: { sound: 'Ha', exampleWord: 'Hat' }, examples: [
    { arabic: 'حصان', transliteration: 'hisan', english: 'horse' },
    { arabic: 'حليب', transliteration: 'haleeb', english: 'milk' },
  ] },
  { id: 'khaa', label: 'خ', name: 'Khaa', transliteration: 'kh', sound: 'kh', forms: formsOf('خ'), similarShapeGroup: 'hook', phoneticCue: { sound: 'Kha', exampleWord: 'Khaki' }, examples: [
    { arabic: 'خبز', transliteration: 'khubz', english: 'bread' },
    { arabic: 'خروف', transliteration: 'kharoof', english: 'sheep' },
  ] },
  { id: 'dal', label: 'د', name: 'Dal', transliteration: 'd', sound: 'd', forms: formsOf('د'), similarShapeGroup: 'dal', phoneticCue: { sound: 'Da', exampleWord: 'Dad' }, examples: [
    { arabic: 'دار', transliteration: 'daar', english: 'house' },
    { arabic: 'ديك', transliteration: 'deek', english: 'rooster' },
  ] },
  { id: 'dhaal', label: 'ذ', name: 'Dhal', transliteration: 'dh', sound: 'dh', forms: formsOf('ذ'), similarShapeGroup: 'dal', phoneticCue: { sound: 'Dha', exampleWord: 'That' }, examples: [
    { arabic: 'ذيل', transliteration: 'dhayl', english: 'tail' },
    { arabic: 'ذهب', transliteration: 'dhahab', english: 'gold' },
  ] },
  { id: 'ra', label: 'ر', name: 'Raa', transliteration: 'r', sound: 'r', forms: formsOf('ر'), similarShapeGroup: 'raa', phoneticCue: { sound: 'Ra', exampleWord: 'Rat' }, examples: [
    { arabic: 'رمل', transliteration: 'raml', english: 'sand' },
    { arabic: 'ريح', transliteration: 'reeh', english: 'wind' },
  ] },
  { id: 'zaay', label: 'ز', name: 'Zay', transliteration: 'z', sound: 'z', forms: formsOf('ز'), similarShapeGroup: 'raa', phoneticCue: { sound: 'Za', exampleWord: 'Zap' }, examples: [
    { arabic: 'زيت', transliteration: 'zayt', english: 'oil' },
    { arabic: 'زهرة', transliteration: 'zahra', english: 'flower' },
  ] },
  { id: 'seen', label: 'س', name: 'Seen', transliteration: 's', sound: 's', forms: formsOf('س'), similarShapeGroup: 'seen', phoneticCue: { sound: 'Sa', exampleWord: 'Sad' }, examples: [
    { arabic: 'سمك', transliteration: 'samak', english: 'fish' },
    { arabic: 'سيارة', transliteration: 'sayyara', english: 'car' },
  ] },
  { id: 'sheen', label: 'ش', name: 'Sheen', transliteration: 'sh', sound: 'sh', forms: formsOf('ش'), similarShapeGroup: 'seen', phoneticCue: { sound: 'Sha', exampleWord: 'Shark' }, examples: [
    { arabic: 'شمس', transliteration: 'shams', english: 'sun' },
    { arabic: 'شجرة', transliteration: 'shajara', english: 'tree' },
  ] },
  { id: 'saad', label: 'ص', name: 'Saad', transliteration: 's', sound: 's', forms: formsOf('ص'), similarShapeGroup: 'saad', phoneticCue: { sound: 'Sa', exampleWord: 'Sun' }, examples: [
    { arabic: 'صقر', transliteration: 'saqr', english: 'falcon' },
    { arabic: 'صورة', transliteration: "soora", english: 'picture' },
  ] },
  { id: 'daad', label: 'ض', name: 'Dhad', transliteration: 'dh', sound: 'dh', forms: formsOf('ض'), similarShapeGroup: 'saad', phoneticCue: { sound: 'Da', exampleWord: 'Dot' }, examples: [
    { arabic: 'ضفدع', transliteration: "difda'", english: 'frog' },
    { arabic: 'ضوء', transliteration: "daw'", english: 'light' },
  ] },
  { id: 'taa2', label: 'ط', name: 'Taa', transliteration: 't', sound: 't', forms: formsOf('ط'), similarShapeGroup: 'taa2', phoneticCue: { sound: 'Ta', exampleWord: 'Top' }, examples: [
    { arabic: 'طائرة', transliteration: "ta'ira", english: 'airplane' },
    { arabic: 'طاولة', transliteration: 'tawila', english: 'table' },
  ] },
  { id: 'dhaa', label: 'ظ', name: 'Dhaa', transliteration: 'dh', sound: 'dh', forms: formsOf('ظ'), similarShapeGroup: 'taa2', phoneticCue: { sound: 'Dha', exampleWord: 'Then' }, examples: [
    { arabic: 'ظل', transliteration: 'dhill', english: 'shadow' },
    { arabic: 'ظرف', transliteration: 'dharf', english: 'envelope' },
  ] },
  { id: 'ain', label: 'ع', name: 'Ayn', transliteration: 'a', sound: 'a', forms: formsOf('ع'), similarShapeGroup: 'ain', phoneticCue: { sound: 'A', exampleWord: 'Arm' }, examples: [
    { arabic: 'عين', transliteration: 'ayn', english: 'eye' },
    { arabic: 'عصفور', transliteration: 'asfoor', english: 'bird' },
  ] },
  { id: 'ghayn', label: 'غ', name: 'Ghayn', transliteration: 'gh', sound: 'gh', forms: formsOf('غ'), similarShapeGroup: 'ain', phoneticCue: { sound: 'Gha', exampleWord: 'Guard' }, examples: [
    { arabic: 'غزال', transliteration: 'ghazal', english: 'gazelle' },
    { arabic: 'غيمة', transliteration: 'ghayma', english: 'cloud' },
  ] },
  { id: 'faa', label: 'ف', name: 'Faa', transliteration: 'f', sound: 'f', forms: formsOf('ف'), similarShapeGroup: 'faa', phoneticCue: { sound: 'Fa', exampleWord: 'Fan' }, examples: [
    { arabic: 'فيل', transliteration: 'feel', english: 'elephant' },
    { arabic: 'فراشة', transliteration: 'farasha', english: 'butterfly' },
  ] },
  { id: 'qaaf', label: 'ق', name: 'Qaaf', transliteration: 'q', sound: 'q', forms: formsOf('ق'), similarShapeGroup: 'faa', phoneticCue: { sound: 'Qa', exampleWord: 'Cup' }, examples: [
    { arabic: 'قمر', transliteration: 'qamar', english: 'moon' },
    { arabic: 'قطة', transliteration: 'qitta', english: 'cat' },
  ] },
  { id: 'kaaf', label: 'ك', name: 'Kaaf', transliteration: 'k', sound: 'k', forms: formsOf('ك'), similarShapeGroup: 'kaaf', phoneticCue: { sound: 'Ka', exampleWord: 'Cat' }, examples: [
    { arabic: 'كتاب', transliteration: 'kitab', english: 'book' },
    { arabic: 'كلب', transliteration: 'kalb', english: 'dog' },
  ] },
  { id: 'laam', label: 'ل', name: 'Laam', transliteration: 'l', sound: 'l', forms: formsOf('ل'), similarShapeGroup: 'laam', phoneticCue: { sound: 'La', exampleWord: 'Lamp' }, examples: [
    { arabic: 'ليمون', transliteration: 'laymoon', english: 'lemon' },
    { arabic: 'لعبة', transliteration: "lu'ba", english: 'toy' },
  ] },
  { id: 'meem', label: 'م', name: 'Meem', transliteration: 'm', sound: 'm', forms: formsOf('م'), similarShapeGroup: 'meem', phoneticCue: { sound: 'Ma', exampleWord: 'Map' }, examples: [
    { arabic: 'موز', transliteration: 'mawz', english: 'banana' },
    { arabic: 'مفتاح', transliteration: 'miftah', english: 'key' },
  ] },
  { id: 'noon', label: 'ن', name: 'Noon', transliteration: 'n', sound: 'n', forms: formsOf('ن'), similarShapeGroup: 'teeth', phoneticCue: { sound: 'Na', exampleWord: 'Nap' }, examples: [
    { arabic: 'نجمة', transliteration: 'najma', english: 'star' },
    { arabic: 'نمر', transliteration: 'nimr', english: 'tiger' },
  ] },
  { id: 'heh', label: 'ه', name: 'Ha', transliteration: 'h', sound: 'h', forms: formsOf('ه'), similarShapeGroup: 'heh', phoneticCue: { sound: 'Ha', exampleWord: 'Home' }, examples: [
    { arabic: 'هدية', transliteration: 'hadiya', english: 'gift' },
    { arabic: 'هلال', transliteration: 'hilal', english: 'crescent' },
  ] },
  { id: 'waaw', label: 'و', name: 'Waw', transliteration: 'w', sound: 'w', forms: formsOf('و'), similarShapeGroup: 'waaw', phoneticCue: { sound: 'Wa', exampleWord: 'Water' }, examples: [
    { arabic: 'وردة', transliteration: 'warda', english: 'rose' },
    { arabic: 'ولد', transliteration: 'walad', english: 'boy' },
  ] },
  { id: 'yaa', label: 'ي', name: 'Yaa', transliteration: 'y', sound: 'y', forms: formsOf('ي'), similarShapeGroup: 'teeth', phoneticCue: { sound: 'Ya', exampleWord: 'Yard' }, examples: [
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
