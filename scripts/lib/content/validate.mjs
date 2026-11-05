// Validation for the content spreadsheet. It reports problems with row
// numbers and never changes a value: Tunisian words are only ever corrected
// by the native reviewer.

export const IMPORT_COLUMNS = [
  'unit',
  'lesson_number',
  'word_group_id',
  'variant_label',
  'word_arabic',
  'transliteration',
  'english_meaning',
  'audio_filename',
  'notes',
];
/** Optional columns: lesson_title (a lesson's name), french_meaning (ignored until translations exist). */
const OPTIONAL_COLUMNS = new Set(['audio_filename', 'notes', 'lesson_title', 'french_meaning']);
export const REQUIRED_COLUMNS = IMPORT_COLUMNS.filter((c) => !OPTIONAL_COLUMNS.has(c));

export const LABELS = ['primary', 'also_heard', 'masculine', 'feminine'];
/** The order forms are listed in (same as the seed data). */
export const LABEL_SORT = { primary: 0, also_heard: 1, masculine: 2, feminine: 3 };
export const ID_PATTERN = /^[a-z0-9_]+$/;
/** The app's style: lowercase letters, chat digits (3, 7, 9, 5, 8, 2), single spaces. */
export const TRANSLITERATION_PATTERN = /^[a-z0-9]+( [a-z0-9]+)*$/;
const LATIN_OR_DIGIT = /[A-Za-z0-9]/;
export const AUDIO_EXTENSIONS = ['mp3', 'm4a'];

/** The expected audio file name for a form: <word_group_id>__<variant_label>.mp3 (or .m4a). */
export const audioFileName = (wordGroupId, variantLabel, ext = 'mp3') => `${wordGroupId}__${variantLabel}.${ext}`;

/**
 * The database rule for a word group's forms: exactly one primary (with
 * optional also-heard forms), or a complete masculine + feminine pair —
 * never both. Returns a message, or null when the forms are fine.
 */
export function groupStructureProblem(labels) {
  const count = (l) => labels.filter((x) => x === l).length;
  for (const label of ['primary', 'masculine', 'feminine']) {
    if (count(label) > 1) return `has ${count(label)} ${label} forms (at most one)`;
  }
  const primary = count('primary') === 1;
  const masculine = count('masculine') === 1;
  const feminine = count('feminine') === 1;
  if (primary && (masculine || feminine)) return 'mixes a primary form with masculine/feminine forms';
  if (!primary && masculine !== feminine) return `has a ${masculine ? 'masculine' : 'feminine'} form without its pair`;
  if (!primary && !masculine) return 'needs one primary form or a complete masculine + feminine pair';
  if (count('also_heard') > 0 && !primary) return 'has an also-heard form without a primary form';
  return null;
}

/**
 * Hints for the reviewer, never corrections: places where the transliteration
 * may not follow the app's chat-digit style. ح is 7, ع is 3, ق is 9 (or g).
 */
export function spellingHints(arabic, transliteration) {
  const hints = [];
  const a = arabic ?? '';
  const t = transliteration ?? '';
  if (a.includes('ح') && !t.includes('7')) hints.push('ح without 7');
  if (a.includes('ع') && !t.includes('3')) hints.push('ع without 3');
  if (a.includes('ق') && !/[9g]/.test(t)) hints.push('ق without 9 or g');
  if (t && !TRANSLITERATION_PATTERN.test(t)) hints.push('characters outside a-z, 0-9 and single spaces');
  return hints;
}

const blank = (v) => v === undefined || v === null || String(v).trim() === '';

/**
 * Turns table records into import rows and checks every rule. Returns
 * { rows, errors } — errors as { rows: [rowNumbers], message }. Nothing is
 * imported while there is any error.
 */
export function validateImportRows(header, records) {
  const errors = [];
  const add = (rowNumbers, message) => errors.push({ rows: [...rowNumbers].sort((a, b) => a - b), message });

  const missingColumns = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missingColumns.length > 0) {
    add([1], `missing column(s): ${missingColumns.join(', ')}`);
    return { rows: [], errors };
  }

  const rows = records.map(({ rowNumber, values }) => ({
    rowNumber,
    unit: values.unit ?? '',
    lessonNumberText: values.lesson_number ?? '',
    lessonNumber: /^\d+$/.test(values.lesson_number ?? '') ? Number(values.lesson_number) : null,
    lessonTitle: values.lesson_title ?? '',
    wordGroupId: values.word_group_id ?? '',
    variantLabel: values.variant_label ?? '',
    wordArabic: values.word_arabic ?? '',
    transliteration: values.transliteration ?? '',
    englishMeaning: values.english_meaning ?? '',
    audioFilename: values.audio_filename ?? '',
    notes: values.notes ?? '',
  }));

  for (const r of rows) {
    const n = [r.rowNumber];
    for (const column of REQUIRED_COLUMNS) {
      const key = { lesson_number: 'lessonNumberText', word_group_id: 'wordGroupId', variant_label: 'variantLabel', word_arabic: 'wordArabic', english_meaning: 'englishMeaning' }[column] ?? column;
      if (blank(r[key])) add(n, `${column} is empty`);
    }
    for (const [column, key] of [
      ['unit', 'unit'], ['lesson_number', 'lessonNumberText'], ['lesson_title', 'lessonTitle'], ['word_group_id', 'wordGroupId'],
      ['variant_label', 'variantLabel'], ['word_arabic', 'wordArabic'], ['transliteration', 'transliteration'],
      ['english_meaning', 'englishMeaning'], ['audio_filename', 'audioFilename'], ['notes', 'notes'],
    ]) {
      const v = r[key];
      if (!blank(v) && (v !== v.trim() || /\s{2,}/.test(v))) add(n, `${column} has extra spaces`);
    }
    if (!blank(r.lessonNumberText) && (r.lessonNumber === null || r.lessonNumber < 1)) add(n, 'lesson_number must be a whole number from 1');
    if (!blank(r.variantLabel) && !LABELS.includes(r.variantLabel)) add(n, `variant_label "${r.variantLabel}" is not one of ${LABELS.join(', ')}`);
    if (!blank(r.wordGroupId) && !ID_PATTERN.test(r.wordGroupId)) add(n, 'word_group_id must be lowercase letters, digits and _');
    if (!blank(r.transliteration) && !TRANSLITERATION_PATTERN.test(r.transliteration)) {
      add(n, 'transliteration must be lowercase a-z, digits and single spaces (no accents, apostrophes or punctuation)');
    }
    if (LATIN_OR_DIGIT.test(r.wordArabic)) add(n, 'word_arabic contains Latin letters or digits');
    if (!blank(r.audioFilename) && ID_PATTERN.test(r.wordGroupId) && LABELS.includes(r.variantLabel)) {
      const allowed = AUDIO_EXTENSIONS.map((ext) => audioFileName(r.wordGroupId, r.variantLabel, ext));
      if (!allowed.includes(r.audioFilename)) add(n, `audio_filename should be ${allowed[0]}`);
    }
  }

  const groups = new Map();
  for (const r of rows) {
    if (blank(r.wordGroupId)) continue;
    groups.set(r.wordGroupId, [...(groups.get(r.wordGroupId) ?? []), r]);
  }
  for (const [id, items] of groups) {
    const n = items.map((r) => r.rowNumber);
    const problem = groupStructureProblem(items.map((r) => r.variantLabel));
    if (problem) add(n, `word group ${id} ${problem}`);
    const arabic = items.map((r) => r.wordArabic).filter((a) => !blank(a));
    if (new Set(arabic).size !== arabic.length) add(n, `word group ${id} has the same Arabic text twice`);
    for (const [column, key] of [['unit', 'unit'], ['lesson_number', 'lessonNumberText'], ['english_meaning', 'englishMeaning'], ['lesson_title', 'lessonTitle']]) {
      if (new Set(items.map((r) => r[key])).size > 1) add(n, `word group ${id} has different ${column} values`);
    }
  }

  const unitsByLesson = new Map();
  for (const r of rows) {
    if (r.lessonNumber === null) continue;
    const entry = unitsByLesson.get(r.lessonNumber) ?? { units: new Set(), rows: [] };
    entry.units.add(r.unit);
    entry.rows.push(r.rowNumber);
    unitsByLesson.set(r.lessonNumber, entry);
  }
  for (const [lesson, { units, rows: n }] of unitsByLesson) {
    if (units.size > 1) add(n, `lesson ${lesson} is used by several units: ${[...units].join(', ')}`);
  }
  const titlesByLesson = new Map();
  for (const r of rows) {
    if (r.lessonNumber === null) continue;
    const key = `${r.unit}#${r.lessonNumber}`;
    titlesByLesson.set(key, [...(titlesByLesson.get(key) ?? []), r]);
  }
  for (const items of titlesByLesson.values()) {
    if (new Set(items.map((r) => r.lessonTitle)).size > 1) add(items.map((r) => r.rowNumber), `lesson ${items[0].lessonNumber} has different lesson_title values`);
  }

  return { rows, errors };
}
