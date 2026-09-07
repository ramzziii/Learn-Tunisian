// Tunisian proverbs for the "Culture Corner" screen — a simple typed array,
// not a database table, same reasoning as talkScenarios.ts: a few dozen
// entries is small and static enough that Supabase infrastructure for it
// would be premature.
//
// Content is sourced from published Tunisian Derja proverb collections
// (Lingualism.com's "20 Fascinating Tunisian Arabic Proverbs", itself citing
// Hedi Balegh's 1994 proverb collection), not authored by a native speaker
// working on this app — unlike word_variants, there's no native-review
// pipeline behind this yet. Transliteration has been simplified from
// academic IPA-style romanization to plain Latin letters to match this
// app's existing informal transliteration style (e.g. "Ahla", "Baa"). Treat
// this as a solid first pass, not verified content — the honest thing to do
// until an actual Tunisian speaker reviews it, same spirit as the "family"
// scenario note in talkScenarios.ts.

export type ProverbCategory = 'wisdom' | 'humor' | 'caution' | 'honesty' | 'resilience';

export interface Proverb {
  id: string;
  arabic: string;
  transliteration: string;
  /** Word-for-word English translation. */
  literal: string;
  /** What it actually means / when it's used. */
  meaning: string;
  category: ProverbCategory;
  emoji: string;
}

export const PROVERBS: Proverb[] = [
  {
    id: 'sleep_with_frogs',
    arabic: 'إلّي يْبات مْعَ الجّْران يِصْبح يْڤرْڤِرْ',
    transliteration: 'Elli ybat maa el-jran, yisbah yqarqar',
    literal: 'He who sleeps with frogs wakes up croaking',
    meaning: 'You pick up the habits of whoever you spend your time around — good or bad. Choose your company carefully.',
    category: 'caution',
    emoji: '🐸',
  },
  {
    id: 'neighbor_before_house',
    arabic: 'الجار قْبَلْ الدّار',
    transliteration: 'El-jar qbel ed-dar',
    literal: 'The neighbor comes before the house',
    meaning: "Who you'll be living next to matters more than the house itself — said when choosing where to live.",
    category: 'wisdom',
    emoji: '🏘️',
  },
  {
    id: 'fled_a_drop',
    arabic: 'هْرب مِن قطْرة جا تَحْت ميزاب',
    transliteration: 'Hrab min qatra, ja taht mizeb',
    literal: 'He fled a drop of water and ended up under a gutter',
    meaning: 'Trying to dodge a small problem and landing in a much bigger one — the cure was worse than the disease.',
    category: 'caution',
    emoji: '☔',
  },
  {
    id: 'old_lady_river',
    arabic: 'العْزوزة هازِزْها الواد وهِيَ تْقول العام صابة',
    transliteration: "El-ajuza hazziha el-wad, w hiya tgoul el-aam saba",
    literal: 'The old lady is being swept away by the river, yet she calls it a good year',
    meaning: 'Refusing to see you\'re in real trouble because you\'re fixated on one bright side — denial dressed up as optimism.',
    category: 'humor',
    emoji: '🌊',
  },
  {
    id: 'camel_hump',
    arabic: 'الجمل ما يراش حدبتو',
    transliteration: 'El-jmal ma yrach hadabtou',
    literal: "The camel can't see its own hump",
    meaning: "It's easy to spot faults in others and stay blind to the same flaw in yourself.",
    category: 'wisdom',
    emoji: '🐫',
  },
  {
    id: 'cow_falls_knives',
    arabic: 'كي اتْطيح البڤْرة تُكْثُر سْكاكِنْها',
    transliteration: 'Ki tetih el-bagra, tekthar skakinha',
    literal: 'When the cow falls, its knives multiply',
    meaning: 'The moment someone powerful stumbles, people who secretly disliked them suddenly appear to pile on.',
    category: 'caution',
    emoji: '🐄',
  },
  {
    id: 'mute_oath',
    arabic: 'يْمين البكّوش في صِدْرو',
    transliteration: 'Ymin el-bakkouch fi sidrou',
    literal: "The mute's oath stays in his chest",
    meaning: "Someone who doesn't talk much still feels things just as strongly — actions and quiet loyalty matter more than words.",
    category: 'wisdom',
    emoji: '🤐',
  },
  {
    id: 'words_that_make_you_cry',
    arabic: 'اسْمع الكْلام إلّي يْبكّيك وْ ما تِسْمعْش الكْلام إلّي يْضحّْكِكْ',
    transliteration: 'Ismaa el-klam elli ybakkik, w ma tsemaash elli ydahakek',
    literal: "Listen to the words that make you cry, not the words that make you laugh",
    meaning: "Honest advice from people who care about you can sting; flattery from people who don't really mean it feels good but is worthless. Trust the honesty.",
    category: 'wisdom',
    emoji: '😢',
  },
  {
    id: 'ask_the_experienced',
    arabic: 'إسْإل مْجرِّب وْ ما تِسْإلْش طْبيب',
    transliteration: "Es'el mjarreb, w ma tes'elch tbib",
    literal: 'Ask someone experienced, not a doctor',
    meaning: 'Someone who has actually lived through a situation often gives better practical advice than someone with only formal training.',
    category: 'wisdom',
    emoji: '🧓',
  },
  {
    id: 'creator_wont_lose_you',
    arabic: 'إلّي خْلق ما يْضيّع',
    transliteration: 'Elli khalaq ma yedhayaa',
    literal: "The one who created won't let you get lost",
    meaning: 'A comforting saying for hard times — a reminder that things have a way of working out, often said to reassure someone worried about the future.',
    category: 'resilience',
    emoji: '🙏',
  },
  {
    id: 'gave_word_gave_neck',
    arabic: 'إلّي عْطى كِلْمْتو عْطى رقْبْتو',
    transliteration: 'Elli aata kelmtou, aata rakabtou',
    literal: 'He who gave his word gave his neck',
    meaning: "Your word is your bond — breaking a promise is treated as seriously as a betrayal, so don't give it lightly.",
    category: 'honesty',
    emoji: '🤝',
  },
  {
    id: 'laugh_and_life_laughs',
    arabic: 'إضْحك لِلدِّنْيا تِضْحكْلِك',
    transliteration: 'Edhak lidonya, tedhaklek',
    literal: 'Laugh at life and it will laugh back at you',
    meaning: 'Staying upbeat tends to bring good energy back your way — a very Tunisian "attitude is everything."',
    category: 'wisdom',
    emoji: '😄',
  },
  {
    id: 'rope_of_lying',
    arabic: 'حْبل الكِذْب قْصير وحْبل الصِّدْق طْويل',
    transliteration: 'Habel el-kedeb qsir, w habel es-sedq twil',
    literal: 'The rope of lying is short; the rope of honesty is long',
    meaning: 'A lie only holds up for so long before it runs out and unravels — honesty is the one that actually lasts.',
    category: 'honesty',
    emoji: '🧵',
  },
  {
    id: 'only_who_walks_embers',
    arabic: 'ما يْحِس بِالجمْرة كان الّي يعْفِس عْليها',
    transliteration: 'Ma yhes bel-jamra kan elli yaafes aliha',
    literal: 'Only the one who steps on hot embers can feel it',
    meaning: "You can't really judge someone else's hardship unless you've lived it yourself — said to push back on someone judging too quickly.",
    category: 'wisdom',
    emoji: '🔥',
  },
  {
    id: 'money_on_dead_mouth',
    arabic: 'حط الفلوس على فم الميت يضحك',
    transliteration: 'Hott el-flous aal fom el-mayet, yedhak',
    literal: "Put money on a dead man's mouth and he'll laugh",
    meaning: "A wry joke about how much everyone loves money — even a dead man would supposedly perk up for it.",
    category: 'humor',
    emoji: '💰',
  },
];

export function getProverbById(id: string): Proverb | undefined {
  return PROVERBS.find((proverb) => proverb.id === id);
}
