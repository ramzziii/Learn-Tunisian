// Cosmetic-only emoji stand-ins for word_groups that don't have a real image
// yet (word_groups.image_path is null). Keyed by word_group.id rather than
// english_meaning, since two different concepts can share an English meaning
// (e.g. "chicken_animal" vs "chicken_food" are both "chicken"). Purely a v1
// rendering convenience — once real images are uploaded and image_path is
// set, the UI should prefer that image instead.
const EMOJI_BY_WORD_GROUP_ID: Record<string, string> = {
  // Colors
  red: '🔴',
  blue: '🔵',
  yellow: '🟡',
  green: '🟢',
  orange: '🟠',
  black: '⚫',
  white: '⚪',
  pink: '🩷',
  purple: '🟣',
  brown: '🟤',
  // Animals
  cat: '🐱',
  dog: '🐶',
  bird: '🐦',
  fish: '🐟',
  horse: '🐴',
  cow: '🐮',
  sheep: '🐑',
  chicken_animal: '🐔',
  rabbit: '🐰',
  lion: '🦁',
  // Food
  bread: '🍞',
  water: '💧',
  milk: '🥛',
  apple: '🍎',
  banana: '🍌',
  egg: '🥚',
  rice: '🍚',
  chicken_food: '🍗',
  cheese: '🧀',
  honey: '🍯',
  // Body parts
  head: '🙂',
  hand: '✋',
  foot: '🦶',
  eye: '👁️',
  ear: '👂',
  nose: '👃',
  mouth: '👄',
  hair: '💇',
  tooth: '🦷',
  tummy: '🫃',
  // Daily phrases
  im_hungry: '🍽️',
  im_thirsty: '🥤',
  i_love_you: '❤️',
  good_morning: '🌅',
  good_night: '🌙',
  im_happy: '😊',
  im_tired: '😴',
  letsgo: '🚶',
  more_please: '🙏',
  all_done: '✅',

  // Legacy Greetings/Family/Numbers demo content, kept for compatibility.
  hello: '👋',
  bye: '🙋',
  please: '🙏',
  thank_you: '💛',
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
};

export function placeholderEmojiFor(wordGroupId: string): string {
  return EMOJI_BY_WORD_GROUP_ID[wordGroupId] ?? '🔤';
}
