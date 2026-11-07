// An in-memory stand-in for the content scripts' database adapter. Records
// every write, so tests can prove a dry run writes nothing.
import { randomUUID } from 'node:crypto';

export function memoryDb(initial = {}) {
  const tables = {
    units: [],
    lessons: [],
    word_groups: [],
    word_variants: [],
    content_source_notes: [],
    content_review_events: [],
    content_import_runs: [],
    reviewers: [],
    ...structuredClone(initial),
  };
  const writes = [];
  const uploads = [];
  const pick = (row, columns) => Object.fromEntries(columns.split(',').map((c) => c.trim()).map((c) => [c, row[c] ?? null]));

  return {
    tables,
    writes,
    uploads,
    async select(table, columns) {
      return (tables[table] ?? []).map((r) => pick(r, columns));
    },
    async insert(table, rows) {
      if (rows.length === 0) return [];
      writes.push({ op: 'insert', table, rows });
      const inserted = rows.map((r) => ({ ...(table === 'word_groups' || table === 'content_source_notes' ? {} : { id: randomUUID() }), ...r }));
      tables[table].push(...inserted);
      return inserted;
    },
    async update(table, patch, match) {
      writes.push({ op: 'update', table, patch, match });
      for (const row of tables[table]) {
        if (Object.entries(match).every(([k, v]) => row[k] === v)) Object.assign(row, patch);
      }
    },
    async upsert(table, rows, onConflict) {
      if (rows.length === 0) return;
      writes.push({ op: 'upsert', table, rows });
      for (const r of rows) {
        const existing = tables[table].find((x) => x[onConflict] === r[onConflict]);
        if (existing) Object.assign(existing, r);
        else tables[table].push({ ...r });
      }
    },
    async upload(bucket, path, bytes, contentType) {
      writes.push({ op: 'upload', bucket, path });
      uploads.push({ bucket, path, size: bytes.length, contentType });
    },
  };
}

/** Builds import rows the way validateImportRows does, for planImport tests. */
export const sheetRow = (rowNumber, unit, lessonNumber, wordGroupId, variantLabel, wordArabic, transliteration, englishMeaning, extra = {}) => ({
  rowNumber,
  unit,
  lessonNumber,
  lessonNumberText: String(lessonNumber),
  lessonTitle: '',
  wordGroupId,
  variantLabel,
  wordArabic,
  transliteration,
  englishMeaning,
  audioFilename: '',
  notes: '',
  ...extra,
});

/** A CSV body for the import columns. */
export const importCsv = (rows) =>
  ['unit,lesson_number,word_group_id,variant_label,word_arabic,transliteration,english_meaning,audio_filename,notes', ...rows.map((r) => r.join(','))].join('\n') + '\n';
