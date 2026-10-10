// Grammar Notes for the Practice Hub — a simple typed array, not a database
// table, same reasoning as talkScenarios.ts/proverbs.ts: a handful of
// explanatory topics is small and static, and this isn't spaced-repetition
// content in the first place (it's reference text, not something to quiz),
// so it doesn't belong in word_groups either.
//
// Topics and their example sentences are transcribed from a real competitor
// app's published App Store preview screenshots. Simplified transliteration
// to match this app's own existing informal style; not reviewed by a native
// speaker, same "solid first pass, not verified" status as proverbs.ts.

export interface GrammarExample {
  transliteration: string;
  english: string;
}

export interface GrammarNote {
  id: string;
  emoji: string;
  title: string;
  explanation: string;
  examples: GrammarExample[];
  /** A short "term: form" quick-reference list shown as a highlighted box. */
  quickTerms: { term: string; form: string }[];
}

export const GRAMMAR_NOTES: GrammarNote[] = [
  {
    id: 'sentence_order',
    emoji: '📝',
    title: 'Basic Sentence Order',
    explanation:
      'Tounsi often uses a direct subject + verb + object order. You can build many useful sentences by changing just one piece.',
    examples: [
      { transliteration: 'Ena n7eb 9ahwa.', english: 'I want coffee.' },
      { transliteration: 'Houwa yemchi lel khedma.', english: 'He goes to work.' },
      { transliteration: 'A7na nestannaw el taxi.', english: 'We are waiting for the taxi.' },
    ],
    quickTerms: [
      { term: 'I want', form: 'Ena n7eb' },
      { term: 'He goes', form: 'Houwa yemchi' },
      { term: 'We wait', form: 'A7na nestannaw' },
    ],
  },
  {
    id: 'negation',
    emoji: '🚫',
    title: 'Negation',
    explanation: 'The common spoken pattern wraps the verb with ma- before it and -ch after it.',
    examples: [
      { transliteration: 'Ma n7ebbech.', english: 'I do not want.' },
      { transliteration: 'Ma fhemtch.', english: 'I did not understand.' },
      { transliteration: 'Ma najjamch nemchi.', english: 'I cannot go.' },
    ],
    quickTerms: [
      { term: 'I do not want', form: 'ma n7ebbech' },
      { term: 'I did not understand', form: 'ma fhemtch' },
      { term: 'I cannot', form: 'ma najjamch' },
    ],
  },
  {
    id: 'questions',
    emoji: '❓',
    title: 'Questions',
    explanation: 'Tounsi question words are short and very common. They usually come near the start of the question.',
    examples: [
      { transliteration: 'Chnowa esmek?', english: 'What is your name?' },
      { transliteration: 'Win el gare?', english: 'Where is the train station?' },
      { transliteration: 'B9addech hedha?', english: 'How much is this?' },
    ],
    quickTerms: [
      { term: 'what', form: 'chnowa' },
      { term: 'where', form: 'win' },
      { term: 'how much', form: 'b9addech' },
      { term: 'why', form: '3lech' },
    ],
  },
  {
    id: 'possession',
    emoji: '🔑',
    title: 'Possession',
    explanation: 'Use 3andi for things you have, and endings like -i or -ek for things attached to a person.',
    examples: [
      { transliteration: '3andi sou2el.', english: 'I have a question.' },
      { transliteration: '3andek wa9t?', english: 'Do you have time?' },
      { transliteration: 'Dar-i ba3ida.', english: 'My house is far.' },
    ],
    quickTerms: [
      { term: 'I have', form: '3andi' },
      { term: 'you have', form: '3andek' },
      { term: 'my', form: '-i' },
    ],
  },
  {
    id: 'everyday_pronouns',
    emoji: '👥',
    title: 'Everyday Pronouns',
    explanation:
      'These pronouns are the base of simple Tounsi sentences. In speech, the verb ending often already tells you who is doing the action.',
    examples: [
      { transliteration: 'N7eb el 9ahwa.', english: 'I like coffee.' },
      { transliteration: 'Yokhdem kol youm.', english: 'He works every day.' },
      { transliteration: 'Nekelou m3a ba3dhna.', english: 'We eat together.' },
    ],
    quickTerms: [
      { term: 'she goes', form: 'temchi' },
      { term: 'we go', form: 'nemchiou' },
      { term: 'you (pl.) go', form: 'temchiou' },
      { term: 'they go', form: 'yemchiou' },
    ],
  },
];
