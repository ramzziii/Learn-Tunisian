// Cosmetic-only emoji stand-ins for words that don't have a real image yet
// (words.image_path is null). Purely a v1 rendering convenience for the kid
// track's "listen and tap the picture" exercise — once real images are
// uploaded and image_path is set, the UI should prefer that image instead.
const EMOJI_BY_ENGLISH_MEANING: Record<string, string> = {
  hello: '👋',
  bye: '🙋',
  please: '🙏',
  'thank you': '💛',
  yes: '👍',
  no: '👎',
  mom: '👩',
  dad: '👨',
  grandma: '👵',
  grandpa: '👴',
  sister: '👧',
  brother: '👦',
  one: '1️⃣',
  two: '2️⃣',
  three: '3️⃣',
  four: '4️⃣',
  five: '5️⃣',
  six: '6️⃣',
  seven: '7️⃣',
  eight: '8️⃣',
  nine: '9️⃣',
  ten: '🔟',
};

export function placeholderEmojiFor(englishMeaning: string): string {
  return EMOJI_BY_ENGLISH_MEANING[englishMeaning.toLowerCase()] ?? '🔤';
}
