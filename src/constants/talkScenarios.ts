// "Talk to a Tunisian" scenario configuration. A simple typed array, not a
// database table — five scenarios is small and static enough that adding
// Supabase infrastructure for it would be premature; content grows into a
// table later if/when it needs to (see APP_OVERVIEW.md backlog).
//
// target_vocabulary references real word_groups.id values from the current
// seed content — there's no separate vocabulary source for the AI feature.
// Some scenarios (family, in particular) are thin right now because the
// seeded content doesn't cover them well yet; that's honest, not a bug.

export interface ConversationScenario {
  id: string;
  title: string;
  description: string;
  emoji: string;
  /** word_groups.id values this scenario is grounded in. */
  targetVocabulary: string[];
  /** Scenario-specific addition to the base system prompt (see buildSystemPrompt.ts). */
  systemInstructions: string;
}

export const TALK_SCENARIOS: ConversationScenario[] = [
  {
    id: 'cafe',
    title: 'At a Café',
    description: 'Practice ordering a drink',
    emoji: '☕',
    targetVocabulary: ['water', 'milk', 'im_thirsty', 'more_please', 'all_done'],
    systemInstructions:
      "You are a friendly café server (garçon) in Tunisia. Greet the learner, ask what they'd like to drink, and respond naturally to their order. Keep the exchange focused on ordering a drink.",
  },
  {
    id: 'market',
    title: 'At the Market',
    description: 'Practice buying something',
    emoji: '🛒',
    targetVocabulary: ['apple', 'banana', 'bread', 'cheese', 'red', 'more_please'],
    systemInstructions:
      'You are a friendly vendor at a Tunisian market (souk). Greet the learner, ask what they want to buy, and describe items naturally (e.g. by color or freshness) as the conversation continues.',
  },
  {
    id: 'meeting_someone',
    title: 'Meeting Someone',
    description: 'Practice introductions',
    emoji: '👋',
    targetVocabulary: ['good_morning', 'good_night', 'im_happy', 'letsgo', 'i_love_you'],
    systemInstructions:
      'You are a new acquaintance greeting the learner for the first time. Keep it warm and simple: greetings, how they are doing, and a natural way to part ways.',
  },
  {
    id: 'family',
    title: 'Family',
    description: 'Talk about family',
    emoji: '🏠',
    targetVocabulary: ['i_love_you', 'im_happy', 'im_tired', 'good_morning'],
    systemInstructions:
      "You are chatting with the learner about family life in a warm, casual way. The app's current vocabulary for family topics is limited, so keep sentences very short and simple, and lean on the supplied vocabulary rather than introducing unrelated family-specific words.",
  },
  {
    id: 'food',
    title: 'Ordering Food',
    description: 'Talk about what you like to eat',
    emoji: '🍽️',
    targetVocabulary: [
      'bread',
      'water',
      'milk',
      'rice',
      'chicken_food',
      'cheese',
      'honey',
      'im_hungry',
      'more_please',
      'all_done',
    ],
    systemInstructions:
      'You are a server at a casual Tunisian restaurant. Ask what the learner would like to eat, take their order, and check if they want anything else, all in short natural exchanges.',
  },
];

export function findTalkScenario(scenarioId: string): ConversationScenario | undefined {
  return TALK_SCENARIOS.find((scenario) => scenario.id === scenarioId);
}
