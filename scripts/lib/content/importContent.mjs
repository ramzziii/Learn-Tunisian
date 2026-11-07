// Bulk import: spreadsheet rows -> units, lessons, word groups and forms,
// always as draft. Idempotent: running the same sheet again changes nothing;
// a changed row updates its form (and sends it back to draft). Never deletes
// anything and never moves an existing word to another unit or lesson.
import { LABEL_SORT, groupStructureProblem } from './validate.mjs';

const isActive = (v) => v.content_status !== 'rejected' && v.content_status !== 'archived';
const groupBy = (items, key) => {
  const map = new Map();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
};

/**
 * What a changed form becomes: unreviewed draft text. Its recording is kept
 * as it is — the database (0028) marks it "needs re-check" when the spelling
 * changes, so learners don't hear it until an admin or reviewer confirms it
 * or records a new one. is_native_voice is never touched here.
 */
export const CHANGED_VARIANT_RESET = {
  content_status: 'draft',
  native_verified: false,
  approved_by: null,
  approved_at: null,
};

/**
 * Compares validated rows with the database snapshot and returns everything
 * an import would do, plus errors (conflicts) that block it.
 */
export function planImport(rows, snapshot) {
  const errors = [];
  const warnings = [];
  const unitsById = new Map(snapshot.units.map((u) => [u.id, u]));
  const courseUnits = snapshot.units.filter((u) => u.is_curriculum !== false);
  const courseUnitsByName = new Map(courseUnits.map((u) => [u.name, u]));
  const phrasebookNames = new Set(snapshot.units.filter((u) => u.is_curriculum === false).map((u) => u.name));
  const groupsById = new Map(snapshot.word_groups.map((g) => [g.id, g]));
  const variantsByGroup = groupBy(snapshot.word_variants, (v) => v.word_group_id);
  const lessonsByKey = new Map(snapshot.lessons.map((l) => [`${l.unit_id}#${l.lesson_number}`, l]));
  const notesByVariant = new Map((snapshot.content_source_notes ?? []).map((n) => [n.word_variant_id, n.note]));

  // Units: matched by name among course units only (a Phrasebook category is never reused).
  const newUnits = [];
  let nextUnitSort = Math.max(0, ...courseUnits.map((u) => u.sort_order ?? 0)) + 1;
  for (const name of new Set(rows.map((r) => r.unit))) {
    if (courseUnitsByName.has(name)) continue;
    newUnits.push({ name, sort_order: nextUnitSort++ });
    if (phrasebookNames.has(name)) warnings.push(`"${name}" is also a Phrasebook category name; a separate course unit is created for it`);
  }

  // Lessons: ordered by lesson_number; several per unit are fine.
  const newLessons = [];
  const lessonsPerUnit = groupBy(rows, (r) => r.unit);
  for (const [unitName, unitRows] of lessonsPerUnit) {
    const numbers = [...new Set(unitRows.map((r) => r.lessonNumber))].sort((a, b) => a - b);
    numbers.forEach((n, index) => {
      const unit = courseUnitsByName.get(unitName);
      const existing = unit ? lessonsByKey.get(`${unit.id}#${n}`) : null;
      if (existing) {
        const approved = snapshot.word_groups.filter((g) => g.unit_id === unit.id && g.lesson_number === n && g.content_status === 'approved');
        if (approved.length > 0) {
          warnings.push(`lesson ${n} (${unitName}) already has ${approved.length} approved word(s); new words join it once approved`);
        }
        return;
      }
      const title = unitRows.find((r) => r.lessonNumber === n && r.lessonTitle)?.lessonTitle || (numbers.length > 1 ? `${unitName} ${index + 1}` : unitName);
      newLessons.push({ unitName, lesson_number: n, title, sort_order: n });
    });
  }

  // Word groups and forms.
  const newGroups = [];
  const groupUpdates = [];
  const newVariants = [];
  const variantUpdates = [];
  const noteUpserts = [];
  let unchangedGroups = 0;
  let unchangedVariants = 0;
  const nextGroupSort = new Map();
  const groupSortFor = (unitName, lessonNumber) => {
    const key = `${unitName}#${lessonNumber}`;
    if (!nextGroupSort.has(key)) {
      const unit = courseUnitsByName.get(unitName);
      const existing = unit ? snapshot.word_groups.filter((g) => g.unit_id === unit.id && g.lesson_number === lessonNumber) : [];
      nextGroupSort.set(key, Math.max(0, ...existing.map((g) => g.sort_order ?? 0)) + 1);
    }
    const value = nextGroupSort.get(key);
    nextGroupSort.set(key, value + 1);
    return value;
  };

  for (const [id, items] of groupBy(rows, (r) => r.wordGroupId)) {
    const first = items[0];
    const rowNumbers = items.map((r) => r.rowNumber);
    const existing = groupsById.get(id);

    if (!existing) {
      newGroups.push({ id, unitName: first.unit, lesson_number: first.lessonNumber, english_meaning: first.englishMeaning, sort_order: groupSortFor(first.unit, first.lessonNumber), rows: rowNumbers });
      for (const r of items) {
        newVariants.push({
          word_group_id: id,
          variant_label: r.variantLabel,
          word_arabic: r.wordArabic,
          transliteration: r.transliteration,
          sort_order: LABEL_SORT[r.variantLabel],
          note: r.notes || null,
          rowNumber: r.rowNumber,
        });
      }
      continue;
    }

    const existingUnit = unitsById.get(existing.unit_id);
    if (existingUnit?.is_curriculum === false || existingUnit?.name !== first.unit || existing.lesson_number !== first.lessonNumber) {
      errors.push({
        rows: rowNumbers,
        message: `word group ${id} already exists in ${existingUnit?.name ?? 'another unit'} lesson ${existing.lesson_number}; moving it is not allowed — use a different id or remove these rows`,
      });
      continue;
    }

    const existingVariants = variantsByGroup.get(id) ?? [];
    const finalLabels = new Set([...existingVariants.filter(isActive).map((v) => v.variant_label), ...items.map((r) => r.variantLabel)]);
    const problem = groupStructureProblem([...finalLabels]);
    if (problem) {
      errors.push({ rows: rowNumbers, message: `word group ${id} together with its existing forms ${problem}` });
      continue;
    }

    if (existing.english_meaning !== first.englishMeaning) {
      groupUpdates.push({ id, rows: rowNumbers, patch: { english_meaning: first.englishMeaning, content_status: 'draft' }, wasApproved: existing.content_status === 'approved' });
    } else {
      unchangedGroups++;
    }

    for (const r of items) {
      const matches = existingVariants.filter((v) => v.variant_label === r.variantLabel);
      if (matches.length > 1) {
        errors.push({ rows: [r.rowNumber], message: `word group ${id} already has ${matches.length} ${r.variantLabel} forms; can't tell which one this row is` });
        continue;
      }
      if (matches.length === 0) {
        newVariants.push({ word_group_id: id, variant_label: r.variantLabel, word_arabic: r.wordArabic, transliteration: r.transliteration, sort_order: LABEL_SORT[r.variantLabel], note: r.notes || null, rowNumber: r.rowNumber });
        continue;
      }
      const v = matches[0];
      if (v.word_arabic !== r.wordArabic || v.transliteration !== r.transliteration) {
        variantUpdates.push({
          id: v.id,
          rows: [r.rowNumber],
          patch: { word_arabic: r.wordArabic, transliteration: r.transliteration, ...CHANGED_VARIANT_RESET },
          wasApproved: v.content_status === 'approved',
        });
      } else {
        unchangedVariants++;
      }
      if (r.notes && notesByVariant.get(v.id) !== r.notes) noteUpserts.push({ word_variant_id: v.id, note: r.notes });
    }
  }

  // Words already in the lessons this sheet touches that the sheet doesn't list (kept, never deleted).
  const sheetIds = new Set(rows.map((r) => r.wordGroupId));
  const touched = new Set(rows.map((r) => `${r.unit}#${r.lessonNumber}`));
  const notInSheet = snapshot.word_groups
    .filter((g) => touched.has(`${unitsById.get(g.unit_id)?.name}#${g.lesson_number}`) && !sheetIds.has(g.id))
    .map((g) => g.id);

  return { errors, warnings, newUnits, newLessons, newGroups, groupUpdates, newVariants, variantUpdates, noteUpserts, unchangedGroups, unchangedVariants, notInSheet };
}

export const planHasChanges = (plan) =>
  plan.newUnits.length + plan.newLessons.length + plan.newGroups.length + plan.groupUpdates.length + plan.newVariants.length + plan.variantUpdates.length + plan.noteUpserts.length > 0;

/**
 * Writes a plan (only after planImport found no errors). New forms go in as
 * one insert, so each word group's masculine + feminine pair arrives together
 * (the database checks a group's forms at the end of each statement).
 */
export async function applyImportPlan(db, plan, snapshot, now = new Date().toISOString()) {
  const unitIds = new Map(snapshot.units.filter((u) => u.is_curriculum !== false).map((u) => [u.name, u.id]));
  const insertedUnits = await db.insert('units', plan.newUnits.map((u) => ({ name: u.name, sort_order: u.sort_order, is_curriculum: true })));
  for (const u of insertedUnits) unitIds.set(u.name, u.id);

  await db.insert('lessons', plan.newLessons.map((l) => ({ unit_id: unitIds.get(l.unitName), lesson_number: l.lesson_number, title: l.title, sort_order: l.sort_order })));
  await db.insert(
    'word_groups',
    plan.newGroups.map((g) => ({ id: g.id, unit_id: unitIds.get(g.unitName), lesson_number: g.lesson_number, english_meaning: g.english_meaning, sort_order: g.sort_order, content_status: 'draft' }))
  );
  const insertedVariants = await db.insert(
    'word_variants',
    plan.newVariants.map((v) => ({
      word_group_id: v.word_group_id,
      variant_label: v.variant_label,
      word_arabic: v.word_arabic,
      transliteration: v.transliteration,
      sort_order: v.sort_order,
      content_status: 'draft',
      native_verified: false,
      is_native_voice: false,
    }))
  );
  for (const g of plan.groupUpdates) await db.update('word_groups', g.patch, { id: g.id });
  for (const v of plan.variantUpdates) await db.update('word_variants', v.patch, { id: v.id });

  const idFor = new Map(insertedVariants.map((v) => [`${v.word_group_id}#${v.variant_label}`, v.id]));
  const notes = [
    ...plan.noteUpserts,
    ...plan.newVariants.filter((v) => v.note).map((v) => ({ word_variant_id: idFor.get(`${v.word_group_id}#${v.variant_label}`), note: v.note })),
  ].map((n) => ({ ...n, updated_at: now }));
  await db.upsert('content_source_notes', notes, 'word_variant_id');
}

/** Plain-text report: counts and row numbers only. */
export function describeImportPlan(plan) {
  const lines = [];
  const p = (s = '') => lines.push(s);
  if (plan.errors.length > 0) {
    p(`ERRORS (${plan.errors.length}) — nothing can be imported until these are fixed:`);
    for (const e of plan.errors) p(`  rows ${e.rows.join(', ')}: ${e.message}`);
    p();
  }
  p('Would write (everything as draft, not approved, no audio marked native):');
  p(`  new units:          ${plan.newUnits.length}${plan.newUnits.length ? ` (${plan.newUnits.map((u) => u.name).join(', ')})` : ''}`);
  p(`  new lessons:        ${plan.newLessons.length}${plan.newLessons.length ? ` (${plan.newLessons.map((l) => l.lesson_number).join(', ')})` : ''}`);
  p(`  new word groups:    ${plan.newGroups.length}`);
  p(`  new forms:          ${plan.newVariants.length}`);
  p(`  changed groups:     ${plan.groupUpdates.length}${plan.groupUpdates.length ? ` (rows ${plan.groupUpdates.flatMap((g) => g.rows).join(', ')})` : ''}`);
  p(`  changed forms:      ${plan.variantUpdates.length}${plan.variantUpdates.length ? ` (rows ${plan.variantUpdates.flatMap((v) => v.rows).join(', ')})` : ''}`);
  const demoted = [...plan.groupUpdates, ...plan.variantUpdates].filter((x) => x.wasApproved);
  if (demoted.length > 0) p(`    of which approved and going back to draft: rows ${demoted.flatMap((x) => x.rows).join(', ')}`);
  p(`  import notes saved: ${plan.noteUpserts.length + plan.newVariants.filter((v) => v.note).length}`);
  p(`  unchanged:          ${plan.unchangedGroups} group(s), ${plan.unchangedVariants} form(s)`);
  if (plan.notInSheet.length > 0) p(`  already in these lessons but not in the sheet (kept): ${plan.notInSheet.length}`);
  if (plan.warnings.length > 0) {
    p();
    p('Notes:');
    for (const w of plan.warnings) p(`  - ${w}`);
  }
  return lines.join('\n');
}
