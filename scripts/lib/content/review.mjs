// The native review round trip:
//  - exportForReview: every draft / pending-review form as rows for the
//    reviewer, with empty verdict / correction columns;
//  - planReview + applyReview: reads the returned sheet and moves forms to
//    approved (ok / fix) or rejected, recording who reviewed and when.
// Reviewing a text sets native_verified (the "native speaker checked the
// word" stamp) — it never marks a recording as a native voice: that's
// is_native_voice, set only by upload-audio. Unknown ids are reported, never
// guessed; any error blocks the whole write.
import { LABEL_SORT, TRANSLITERATION_PATTERN, groupStructureProblem, spellingHints } from './validate.mjs';

export const REVIEW_COLUMNS = [
  'variant_id',
  'unit',
  'lesson_number',
  'word_group_id',
  'variant_label',
  'english_meaning',
  'word_arabic',
  'transliteration',
  'notes',
  'spelling_check',
  'verdict',
  'corrected_arabic',
  'corrected_transliteration',
  'reviewer_note',
];
const REQUIRED_REVIEW_COLUMNS = ['variant_id', 'word_arabic', 'transliteration', 'verdict', 'corrected_arabic', 'corrected_transliteration', 'reviewer_note'];
const UNREVIEWED = new Set(['draft', 'pending_review']);
const LATIN_OR_DIGIT = /[A-Za-z0-9]/;
const isActive = (status) => status !== 'rejected' && status !== 'archived';

/** Unit, lesson, word, then form — the order a reviewer (or recorder) works in. */
export function contentOrder(snapshot) {
  const units = new Map(snapshot.units.map((u) => [u.id, u]));
  const groups = new Map(snapshot.word_groups.map((g) => [g.id, g]));
  return (a, b) => {
    const ga = groups.get(a.word_group_id);
    const gb = groups.get(b.word_group_id);
    return (
      (units.get(ga.unit_id)?.sort_order ?? 0) - (units.get(gb.unit_id)?.sort_order ?? 0) ||
      ga.lesson_number - gb.lesson_number ||
      (ga.sort_order ?? 0) - (gb.sort_order ?? 0) ||
      ga.id.localeCompare(gb.id) ||
      (LABEL_SORT[a.variant_label] ?? 9) - (LABEL_SORT[b.variant_label] ?? 9) ||
      String(a.id).localeCompare(String(b.id))
    );
  };
}

export function exportForReview(snapshot) {
  const units = new Map(snapshot.units.map((u) => [u.id, u]));
  const groups = new Map(snapshot.word_groups.map((g) => [g.id, g]));
  const notes = new Map((snapshot.content_source_notes ?? []).map((n) => [n.word_variant_id, n.note]));
  return snapshot.word_variants
    .filter((v) => UNREVIEWED.has(v.content_status) && groups.has(v.word_group_id) && isActive(groups.get(v.word_group_id).content_status))
    .sort(contentOrder(snapshot))
    .map((v) => {
      const g = groups.get(v.word_group_id);
      return {
        variant_id: v.id,
        unit: units.get(g.unit_id)?.name ?? '',
        lesson_number: String(g.lesson_number),
        word_group_id: g.id,
        variant_label: v.variant_label,
        english_meaning: g.english_meaning,
        word_arabic: v.word_arabic,
        transliteration: v.transliteration,
        notes: notes.get(v.id) ?? '',
        spelling_check: spellingHints(v.word_arabic, v.transliteration).join('; '),
        verdict: '',
        corrected_arabic: '',
        corrected_transliteration: '',
        reviewer_note: '',
      };
    });
}

/**
 * Checks a returned review sheet against the database. `reviewer` is
 * { accountId, name } for an account already in public.reviewers.
 */
export function planReview(header, records, snapshot, reviewer, now = new Date().toISOString()) {
  const errors = [];
  const warnings = [];
  const add = (rows, message) => errors.push({ rows, message });

  const missing = REQUIRED_REVIEW_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    add([1], `missing column(s): ${missing.join(', ')}`);
    return { errors, warnings, variantUpdates: [], events: [], groupUpdates: [], counts: { ok: 0, fix: 0, reject: 0, skipped: 0, alreadyApplied: 0 } };
  }

  const variants = new Map(snapshot.word_variants.map((v) => [v.id, v]));
  const counts = { ok: 0, fix: 0, reject: 0, skipped: 0, alreadyApplied: 0 };
  const variantUpdates = [];
  const events = [];
  const seen = new Map();

  for (const { rowNumber, values } of records) {
    const n = [rowNumber];
    const verdict = (values.verdict ?? '').trim().toLowerCase();
    if (verdict === '') {
      counts.skipped++;
      continue;
    }
    const id = (values.variant_id ?? '').trim();
    if (seen.has(id)) {
      add([seen.get(id), rowNumber], `variant_id ${id} appears more than once`);
      continue;
    }
    seen.set(id, rowNumber);
    const v = variants.get(id);
    if (!v) {
      add(n, id ? `unknown variant_id ${id} — not in the database (nothing is guessed)` : 'variant_id is empty');
      continue;
    }
    if (!['ok', 'fix', 'reject'].includes(verdict)) {
      add(n, `verdict "${values.verdict}" must be ok, fix or reject`);
      continue;
    }
    const correctedArabic = (values.corrected_arabic ?? '').trim();
    const correctedLatin = (values.corrected_transliteration ?? '').trim();
    const note = (values.reviewer_note ?? '').trim();
    const finalArabic = verdict === 'fix' && correctedArabic ? correctedArabic : values.word_arabic;
    const finalLatin = verdict === 'fix' && correctedLatin ? correctedLatin : values.transliteration;

    // Already applied by an earlier run (e.g. after a dropped connection): skip, don't fail.
    const applied =
      (verdict === 'reject' && v.content_status === 'rejected') ||
      (verdict !== 'reject' && v.content_status === 'approved' && v.word_arabic === finalArabic && v.transliteration === finalLatin);
    if (applied) {
      counts.alreadyApplied++;
      continue;
    }
    if (!UNREVIEWED.has(v.content_status)) {
      add(n, `${v.word_group_id} (${v.variant_label}) is already ${v.content_status}; only draft or pending-review forms can be reviewed`);
      continue;
    }
    if (values.word_arabic !== v.word_arabic || values.transliteration !== v.transliteration) {
      add(n, `${v.word_group_id} (${v.variant_label}) changed in the database since the export — export again`);
      continue;
    }
    if (note.length > 1000) add(n, 'reviewer_note is longer than 1000 characters');

    if (verdict === 'ok' && (correctedArabic || correctedLatin)) {
      add(n, 'verdict ok has a correction — use fix to apply corrections');
      continue;
    }
    if (verdict === 'fix') {
      if (!correctedArabic && !correctedLatin) {
        add(n, 'verdict fix needs corrected_arabic and/or corrected_transliteration');
        continue;
      }
      if (correctedLatin && !TRANSLITERATION_PATTERN.test(correctedLatin)) {
        add(n, 'corrected_transliteration must be lowercase a-z, digits and single spaces');
        continue;
      }
      if (correctedArabic && LATIN_OR_DIGIT.test(correctedArabic)) {
        add(n, 'corrected_arabic contains Latin letters or digits');
        continue;
      }
      if (finalArabic === v.word_arabic && finalLatin === v.transliteration) {
        add(n, 'verdict fix but the correction is the same as the current text — use ok');
        continue;
      }
    }

    counts[verdict]++;
    const patch =
      verdict === 'reject'
        ? { content_status: 'rejected', native_verified: false, approved_by: null, approved_at: null }
        : {
            content_status: 'approved',
            native_verified: true,
            approved_by: reviewer.accountId,
            approved_at: now,
            ...(verdict === 'fix' ? { word_arabic: finalArabic, transliteration: finalLatin } : {}),
            // A corrected spelling keeps the recording; the database (0028)
            // marks it "needs re-check" — never un-marked as native here.
          };
    if (verdict === 'fix' && v.audio_path) warnings.push(`row ${rowNumber}: ${v.word_group_id} (${v.variant_label}) was corrected, so its recording will wait for a re-check (Admin → Audio → Re-check)`);
    variantUpdates.push({ id: v.id, rowNumber, patch, verdict });
    events.push({
      word_variant_id: v.id,
      word_group_id: v.word_group_id,
      variant_label: v.variant_label,
      verdict,
      reviewer_account_id: reviewer.accountId,
      reviewer_name: reviewer.name,
      reviewer_note: note || null,
      reviewed_arabic: v.word_arabic,
      reviewed_transliteration: v.transliteration,
      corrected_arabic: verdict === 'fix' && correctedArabic ? correctedArabic : null,
      corrected_transliteration: verdict === 'fix' && correctedLatin ? correctedLatin : null,
      reviewed_at: now,
    });
  }

  // Each affected word group: approved once all its remaining forms are approved
  // and still make a valid set; rejected when every form is rejected.
  const statusAfter = new Map(snapshot.word_variants.map((v) => [v.id, v.content_status]));
  for (const u of variantUpdates) statusAfter.set(u.id, u.patch.content_status);
  const groups = new Map(snapshot.word_groups.map((g) => [g.id, g]));
  const groupUpdates = [];
  for (const groupId of new Set(variantUpdates.map((u) => variants.get(u.id).word_group_id))) {
    const g = groups.get(groupId);
    const forms = snapshot.word_variants.filter((v) => v.word_group_id === groupId);
    const active = forms.filter((v) => isActive(statusAfter.get(v.id)));
    let next = g.content_status;
    if (active.length === 0) {
      next = 'rejected';
    } else if (active.every((v) => statusAfter.get(v.id) === 'approved')) {
      const problem = groupStructureProblem(active.map((v) => v.variant_label));
      if (problem) warnings.push(`word group ${groupId} is not approved: after this review it ${problem}`);
      else next = 'approved';
    }
    if (next !== g.content_status) {
      groupUpdates.push({ id: groupId, patch: { content_status: next } });
      if (next === 'approved') {
        const visible = snapshot.word_groups.some((o) => o.id !== groupId && o.unit_id === g.unit_id && o.lesson_number === g.lesson_number && o.content_status === 'approved');
        if (visible) warnings.push(`${groupId} joins lesson ${g.lesson_number}, which learners can already see; anyone who finished it will find it open again`);
      }
    }
  }

  return { errors, warnings, variantUpdates, events, groupUpdates, counts };
}

/** Forms first, then the review history, then word groups (approved only once their forms are). */
export async function applyReview(db, plan) {
  for (const u of plan.variantUpdates) await db.update('word_variants', u.patch, { id: u.id });
  await db.insert('content_review_events', plan.events);
  for (const g of plan.groupUpdates) await db.update('word_groups', g.patch, { id: g.id });
}

export function describeReviewPlan(plan) {
  const lines = [];
  const p = (s = '') => lines.push(s);
  if (plan.errors.length > 0) {
    p(`ERRORS (${plan.errors.length}) — nothing is applied until these are fixed:`);
    for (const e of plan.errors) p(`  row ${e.rows.join(', ')}: ${e.message}`);
    p();
  }
  const c = plan.counts;
  p(`Verdicts: ${c.ok} ok, ${c.fix} fix, ${c.reject} reject; ${c.skipped} row(s) without a verdict left as they are; ${c.alreadyApplied} already applied.`);
  const approved = plan.groupUpdates.filter((g) => g.patch.content_status === 'approved').length;
  const rejected = plan.groupUpdates.filter((g) => g.patch.content_status === 'rejected').length;
  p(`Word groups becoming approved: ${approved}; rejected: ${rejected}.`);
  if (plan.warnings.length > 0) {
    p();
    p('Notes:');
    for (const w of plan.warnings) p(`  - ${w}`);
  }
  return lines.join('\n');
}
