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

export interface ConjugationRow {
  pronounArabic: string;
  pronounEnglish: string;
  verbArabic: string;
  verbTransliteration: string;
}

export interface ConjugationTable {
  /** The abstract rule, e.g. "Singular: prefix + stem · Plural: prefix + stem + -ou". */
  patternSummary: string;
  modelArabic: string;
  modelTransliteration: string;
  modelMeaning: string;
  rows: ConjugationRow[];
}

export interface GrammarNote {
  id: string;
  emoji: string;
  title: string;
  explanation: string;
  examples: GrammarExample[];
  /** A short "term: form" quick-reference list shown as a highlighted box. */
  quickTerms: { term: string; form: string }[];
  /** A full model-verb conjugation (one row per pronoun), for the two tense notes. */
  conjugationTable?: ConjugationTable;
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
    id: 'everyday_pronouns',
    emoji: '👥',
    title: 'Everyday Pronouns',
    explanation:
      'These pronouns are the base of simple Tounsi sentences. In speech, the verb ending often already tells you who is doing the action.',
    examples: [
      { transliteration: 'Ena men Tounes.', english: 'I am from Tunisia.' },
      { transliteration: 'Enti labes?', english: 'Are you okay?' },
      { transliteration: 'Houma jeyin tawwa.', english: 'They are coming now.' },
    ],
    quickTerms: [
      { term: 'I', form: 'ena' },
      { term: 'you', form: 'enti' },
      { term: 'he', form: 'houwa' },
      { term: 'she', form: 'hiya' },
      { term: 'we', form: 'a7na' },
      { term: 'they', form: 'houma' },
    ],
  },
  {
    id: 'present_verbs',
    emoji: '🏃',
    title: 'Present Tense',
    explanation: 'Many present-tense verbs use n-, t-, y-, or n-...-ou patterns. Listen for the first sound of the verb.',
    examples: [
      { transliteration: 'N7eb el 9ahwa.', english: 'I like coffee.' },
      { transliteration: 'Yokhdem kol youm.', english: 'He works every day.' },
      { transliteration: 'Nekelou m3a ba3dhna.', english: 'We eat together.' },
    ],
    quickTerms: [
      { term: 'I', form: 'n- / ne-' },
      { term: 'you', form: 't- / te-' },
      { term: 'he', form: 'y- / ye-' },
      { term: 'we', form: 'n-...-w' },
    ],
    conjugationTable: {
      patternSummary: 'Singular: prefix + stem · Plural: prefix + stem + -ou',
      modelArabic: 'مشى',
      modelTransliteration: 'mcha',
      modelMeaning: 'to go / to leave',
      rows: [
        { pronounArabic: 'أنا', pronounEnglish: 'I', verbArabic: 'نمشي', verbTransliteration: 'nemchi' },
        { pronounArabic: 'إنت', pronounEnglish: 'You (sg.)', verbArabic: 'تمشي', verbTransliteration: 'temchi' },
        { pronounArabic: 'هو', pronounEnglish: 'He', verbArabic: 'يمشي', verbTransliteration: 'yemchi' },
        { pronounArabic: 'هي', pronounEnglish: 'She', verbArabic: 'تمشي', verbTransliteration: 'temchi' },
        { pronounArabic: 'أحنا', pronounEnglish: 'We', verbArabic: 'نمشيو', verbTransliteration: 'nemchiou' },
        { pronounArabic: 'إنتوما', pronounEnglish: 'You (pl.)', verbArabic: 'تمشيو', verbTransliteration: 'temchiou' },
        { pronounArabic: 'هوما', pronounEnglish: 'They', verbArabic: 'يمشيو', verbTransliteration: 'yemchiou' },
      ],
    },
  },
  {
    id: 'past_tense',
    emoji: '⏳',
    title: 'Past Tense',
    explanation:
      "The past works the other way round from the present: suffixes go after the stem. The past stem is often different from the present one — and it's the form you'll find in dictionaries.",
    examples: [
      { transliteration: 'Klit.', english: 'I ate.' },
      { transliteration: 'Chrebna 9ahwa.', english: 'We had a coffee.' },
      { transliteration: 'Re9det bekri.', english: 'She went to sleep early.' },
    ],
    quickTerms: [
      { term: 'I / you (sg.)', form: 'mchit' },
      { term: 'he', form: 'mcha' },
      { term: 'she', form: 'mchet' },
      { term: 'we', form: 'mchina' },
    ],
    conjugationTable: {
      patternSummary: 'Stem (past) + personal suffix',
      modelArabic: 'مشى',
      modelTransliteration: 'mcha',
      modelMeaning: 'to go / to leave',
      rows: [
        { pronounArabic: 'أنا', pronounEnglish: 'I', verbArabic: 'مشيت', verbTransliteration: 'mchit' },
        { pronounArabic: 'إنت', pronounEnglish: 'You (sg.)', verbArabic: 'مشيت', verbTransliteration: 'mchit' },
        { pronounArabic: 'هو', pronounEnglish: 'He', verbArabic: 'مشى', verbTransliteration: 'mcha' },
        { pronounArabic: 'هي', pronounEnglish: 'She', verbArabic: 'مشات', verbTransliteration: 'mchet' },
        { pronounArabic: 'أحنا', pronounEnglish: 'We', verbArabic: 'مشينا', verbTransliteration: 'mchina' },
        { pronounArabic: 'إنتوما', pronounEnglish: 'You (pl.)', verbArabic: 'مشيتو', verbTransliteration: 'mchitou' },
        { pronounArabic: 'هوما', pronounEnglish: 'They', verbArabic: 'مشيو', verbTransliteration: 'mchiou' },
      ],
    },
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
      { term: 'your', form: '-ek' },
    ],
  },
  {
    id: 'small_words',
    emoji: '✨',
    title: 'Small Words',
    explanation: 'A few small words make Tounsi sound natural because they carry politeness, timing, and attitude.',
    examples: [
      { transliteration: 'Tawwa nemchi.', english: 'I am going now.' },
      { transliteration: 'Barka, 3aychek.', english: 'Enough, thank you.' },
      { transliteration: 'Nchallah ghodwa.', english: 'Hopefully tomorrow.' },
    ],
    quickTerms: [
      { term: 'now', form: 'tawwa' },
      { term: 'only / enough', form: 'bark / barka' },
      { term: 'please', form: 'bellehi' },
      { term: 'hopefully', form: 'nchallah' },
    ],
  },
];
