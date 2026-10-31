/**
 * The one source for marketing copy: the Welcome screen, the "Why Tunisian,
 * not MSA?" screen (app/why-tunisian.tsx) and the store-listing draft
 * (docs/store-listing.md — src/constants/__tests__/appCopy.test.ts checks the
 * doc still matches, and the store character limits).
 *
 * Every claim here was checked against the app (see the audit table in
 * docs/store-listing.md). Don't add ones it can't back up yet: content is not
 * native-verified, seeded audio is placeholder TTS, Talk's AI runs in mock
 * mode until the owner sets it up, and lessons aren't personalised by goal or
 * level.
 */

export const VALUE_STATEMENT = 'Speak the Arabic people use in Tunisia.';

export const SUPPORTING_LINE =
  'Learn everyday Tunisian Arabic (Derja) — the language of conversation — in a few minutes a day.';

export const WELCOME_BENEFITS: readonly { emoji: string; text: string }[] = [
  { emoji: '🗣️', text: 'Everyday spoken Tunisian, not formal Modern Standard Arabic' },
  { emoji: '📚', text: 'Lessons, phrasebook, flashcards and review in one place' },
  { emoji: '⏱️', text: '5, 10 or 15 minutes a day. No ads, no streak guilt.' },
];

export const WHY_TUNISIAN_LINK = 'Why Tunisian, not MSA?';

export const WHY_TUNISIAN = {
  title: 'Why Tunisian, not MSA?',
  paragraphs: [
    'In Tunisia, people chat, joke and get things done in Tunisian Arabic, often called Derja. It’s what you’ll hear at home, in cafés, at the market and in a taxi.',
    'Many Arabic courses teach Modern Standard Arabic (MSA), the formal Arabic of news, books and official writing. It’s well worth learning, but it isn’t what most people speak day to day. Derja has its own everyday words, pronunciation and expressions.',
    'Learn Tunisian focuses on Derja, so what you practise is closer to what you’ll hear and say in everyday conversation.',
  ],
} as const;

export const WHO_ITS_FOR: readonly string[] = [
  'Travelers heading to Tunisia',
  'People with Tunisian family or a Tunisian partner',
  'Diaspora learners reconnecting with their roots',
  'Curious learners who enjoy languages',
];

const bullets = (items: readonly string[]) => items.map((item) => `• ${item}`).join('\n');

const FEATURES = [
  'Work through short lessons on everyday words and phrases',
  'Browse a phrasebook for everyday situations and flip through flashcards',
  'Read simple notes on Tunisian grammar patterns',
  'Practise the Arabic alphabet: letters and their sounds',
  'Review the words you find hardest, with spaced repetition',
  'Read Tunisian proverbs and sayings in Culture Corner',
  'See words in Arabic script, Latin transliteration, or both',
  'Set a daily goal of 5, 10 or 15 minutes, with an optional reminder',
  'Keep audio you’ve already played for offline listening',
];

export const STORE_LISTING = {
  appNameOptions: ['Learn Tunisian', 'Learn Tunisian: Derja Arabic', 'Learn Tunisian – Speak Derja'],
  appleSubtitle: 'Everyday Tunisian Arabic',
  googleShortDescription: 'Learn everyday spoken Tunisian Arabic (Derja), a few minutes a day.',
  fullDescription: [
    'Learn Tunisian helps adults learn Tunisian Arabic, often called Derja — the language people in Tunisia use in everyday conversation.',
    'Many Arabic courses teach Modern Standard Arabic (MSA), the formal Arabic of news and books. Learn Tunisian focuses on the Derja you’ll hear at home, in cafés and around town.',
    `WHAT YOU CAN DO\n${bullets(FEATURES)}`,
    `WHO IT’S FOR\n${bullets(WHO_ITS_FOR)}`,
    'A CALM WAY TO LEARN\nNo ads and no streak pressure. Your daily goal is a target, not a limit: at the end of a session you can always add more time. Reminders are optional, and you can change or turn them off anytime.',
    'FOR ADULTS\nLearn Tunisian is for adults aged 18 and over, with one learner profile per account. You can delete your account from inside the app.',
    'Free to start learning.',
  ].join('\n\n'),
  appleKeywords: ['tunisian', 'derja', 'darja', 'tounsi', 'tunisia', 'arabic', 'dialect', 'phrasebook', 'vocabulary', 'travel', 'language'],
  promotionalText:
    'Learn the Tunisian Arabic people actually speak, a few minutes a day. Lessons, phrasebook, flashcards and review — no ads, no streak pressure.',
  whatsNew:
    'Our first release: short lessons, a phrasebook, flashcards, grammar notes, alphabet practice, review and Culture Corner, plus a daily goal and an optional reminder.',
  screenshotCaptions: [
    { screen: 'Learn tab (lessons by unit)', caption: 'Short lessons in everyday Tunisian' },
    { screen: 'Phrasebook', caption: 'Phrases for everyday situations' },
    { screen: 'Phrasebook flashcards', caption: 'Flip through phrase flashcards' },
    { screen: 'Alphabet practice', caption: 'Learn Arabic letters and sounds' },
    { screen: 'Review', caption: 'Review the words you find hardest' },
  ],
} as const;
