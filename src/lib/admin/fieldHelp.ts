/**
 * Short explanations for every field on the admin content screens, shown
 * when someone taps the ⓘ next to a field's name (FieldHelp). Written for a
 * new admin, reviewer or native speaker adding content for the first time.
 * One place to reword them.
 */
export const FIELD_HELP = {
  // Units
  unitName: 'The unit’s name, as learners see it (e.g. “Greetings”).',
  unitType:
    'Curriculum: a course unit with lessons learners do in order. Phrasebook: a category of ready-made phrases (e.g. “Shopping”) that learners open on its own.',
  unitSortOrder:
    'Where this unit sits in the list. Smaller numbers come first. Leave gaps (10, 20, 30…) so you can slot a unit in later.',

  // Lessons
  lessonNumber:
    'The lesson’s number inside this unit (1, 2, 3…). Words belong to a lesson through this number, so don’t change it once words are added.',
  lessonTitle: 'Optional. A short name for the lesson (e.g. “Saying hello”).',
  lessonSortOrder: 'The order of lessons in the unit. Smaller numbers come first; learners unlock lessons in this order.',

  // Words
  wordId:
    'A permanent ID used behind the scenes. Lowercase letters, numbers and underscores only (e.g. good_morning; Phrasebook phrases start with pb_). It can’t be changed later.',
  englishMeaning: 'What the word or phrase means in English, as learners see it (e.g. “Good morning”).',
  imageKeyword:
    'Optional. One or two English words describing a picture for this word (e.g. “apple”). Saved for illustrations; not shown to learners yet.',
  wordSortOrder: 'The order of words in the lesson. Smaller numbers come first.',
  wordStatus:
    'Draft: still being written. Waiting for review: ready for a language reviewer. Live: learners see it (reviewers only). Rejected: not used (reviewers only). Archived: hidden but kept. A word goes live only when its forms are approved.',

  // Forms (variants)
  formLabel:
    'Which form this is. Primary: the main way to say it. Also heard: another common way (shown as “You might also hear”). Masculine / Feminine: when the word changes with who you’re talking to or about — add both.',
  textChecked:
    'Tick when a native speaker has checked that the Arabic and the transliteration are correct. Language reviewers only.',
  arabic: 'The word in Arabic script, the way Tunisians say it (Derja, not formal Arabic). No Latin letters or numbers.',
  transliteration:
    'The word in Latin letters, the way Tunisians text: lowercase, single spaces, and numbers for sounds — 3 (ع), 7 (ح), 9 (ق), 5 (خ), 8 (غ), 2 (ء). For example “3aslema”, “sba7 el khir”.',
  notes:
    'Optional. When or how to use it (e.g. “With friends, not with elders”). Learners see this under “When to say this” in the Phrasebook.',
  formSortOrder: 'The order of this form among the word’s forms. Smaller numbers come first.',
  formStatus:
    'This form’s status. Draft and Waiting for review are hidden from learners; Live (reviewers only) shows it; Rejected (reviewers only) drops it; Archived hides it but keeps it.',
  pronunciationRecording:
    'A native speaker saying this form. Record it or upload a file (mp3, m4a, aac or wav). This is the audio learners hear and practise with.',
  explanationRecording:
    'Optional. A native speaker explaining the word — in English, Arabic or both (e.g. when to use it). Never used in exercises or Repeat After Me.',
  speakerName: 'Who recorded the audio. For the team; not shown to learners.',
  nativeRecording:
    'On when the audio is a real Tunisian speaker. Off means a computer voice: learners see it labelled, and it’s never used in listening or speaking exercises.',
  dialectNotes: 'Optional. Regional differences (e.g. “In Sfax people say …”). For the team; not shown to learners.',

  // Recording card
  repeatAfterMe: 'Adds this recording to Repeat After Me, where learners listen and repeat. Only for clear, native recordings.',
  addExplanation: 'Tick to also record or upload an explanation (optional). Leave it unticked to save just the word’s recording.',

  // Review one at a time
  reviewChoices:
    'Correct: the Arabic and transliteration are right — approve it. Fix: correct the spelling, then it’s approved. Reject: this form shouldn’t be in the app. A word goes live once all its forms are approved.',
  reviewNote: 'Optional. Why you fixed or rejected it. The team sees it in the review history.',
} as const;

export type FieldHelpKey = keyof typeof FIELD_HELP;
