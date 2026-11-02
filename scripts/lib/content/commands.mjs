// The five content commands, each a plain function over a database adapter
// so tests can run them against a fake or a throwaway database. They return
// an exit code: 0 done (or nothing to do), 1 problems found (nothing
// written). Without `execute` nothing is ever written.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { applyAudio, describeAudioMatch, matchAudioFiles } from './audio.mjs';
import { loadSnapshot, UsageError } from './db.mjs';
import { applyImportPlan, describeImportPlan, planHasChanges, planImport } from './importContent.mjs';
import { RECORDING_COLUMNS, buildRecordingList } from './recordingList.mjs';
import { REVIEW_COLUMNS, applyReview, describeReviewPlan, exportForReview, planReview } from './review.mjs';
import { readTable, writeCsv } from './sheet.mjs';
import { validateImportRows } from './validate.mjs';

const DRY_RUN = 'Dry run: nothing was written. Run again with --execute --confirm-host <host> to write.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function importContentCommand({ file, db, execute = false, validateOnly = false, log }) {
  const table = await readTable(file);
  const { rows, errors } = validateImportRows(table.header, table.records);
  log(`Read ${table.records.length} row(s), ${new Set(rows.map((r) => r.wordGroupId)).size} word group(s).`);
  if (errors.length > 0) {
    log(`INVALID (${errors.length}) — nothing can be imported until these are fixed:`);
    for (const e of errors) log(`  row ${e.rows.join(', ')}: ${e.message}`);
    return 1;
  }
  log('All rows pass validation.');
  if (validateOnly) return 0;

  const snapshot = await loadSnapshot(db);
  const plan = planImport(rows, snapshot);
  log(describeImportPlan(plan));
  if (plan.errors.length > 0) return 1;
  if (!planHasChanges(plan)) {
    log('Nothing to change: the database already matches this sheet.');
    return 0;
  }
  if (!execute) {
    log(DRY_RUN);
    return 0;
  }
  await applyImportPlan(db, plan, snapshot);
  log('Imported. Everything new or changed is a draft until your native reviewer approves it.');
  return 0;
}

export async function exportForReviewCommand({ db, out, log }) {
  const records = exportForReview(await loadSnapshot(db));
  log(`${records.length} form(s) waiting for review.`);
  if (!out) {
    log('Add --out <file.csv> to write the review sheet.');
    return 0;
  }
  await writeCsv(out, REVIEW_COLUMNS, records);
  log(`Wrote ${out}. Fill in verdict (ok / fix / reject), any corrections and a note; leave a row's verdict empty to skip it.`);
  return 0;
}

export async function importReviewCommand({ file, db, reviewerAccount, reviewerName, execute = false, log }) {
  const name = (reviewerName ?? '').trim();
  if (!name || name.length > 100) throw new UsageError('--reviewer-name "<name>" is required (up to 100 characters).');
  if (!UUID.test(reviewerAccount ?? '')) throw new UsageError('--reviewer-account <account id> is required: an account listed in public.reviewers.');
  const reviewers = await db.select('reviewers', 'user_id');
  if (!reviewers.some((r) => r.user_id === reviewerAccount)) {
    throw new UsageError('That account is not in public.reviewers (being an admin is not enough). Add it by hand in the SQL editor first.');
  }

  const table = await readTable(file);
  const plan = planReview(table.header, table.records, await loadSnapshot(db), { accountId: reviewerAccount, name });
  log(describeReviewPlan(plan));
  if (plan.errors.length > 0) return 1;
  if (plan.variantUpdates.length === 0) {
    log('Nothing to apply.');
    return 0;
  }
  if (!execute) {
    log(DRY_RUN);
    return 0;
  }
  await applyReview(db, plan);
  log(`Applied ${plan.variantUpdates.length} verdict(s), recorded as reviewed by ${name}.`);
  return 0;
}

export async function uploadAudioCommand({ folder, db, execute = false, replace = false, speakerName = null, log, fs = { readdir, readFile, stat } }) {
  const names = [];
  for (const entry of await fs.readdir(folder)) {
    if ((await fs.stat(join(folder, entry))).isFile()) names.push(entry);
  }
  const result = matchAudioFiles(names, await loadSnapshot(db), { replace });
  log(describeAudioMatch(result));
  if (result.matches.length === 0) {
    log('Nothing to upload.');
    return 0;
  }
  if (!execute) {
    log(DRY_RUN);
    return 0;
  }
  const done = await applyAudio(db, result.matches, (file) => fs.readFile(join(folder, file)), { speakerName });
  log(`Uploaded ${done.length} recording(s) and marked them as native voice.`);
  const replaced = done.filter((d) => d.previous);
  if (replaced.length > 0) {
    log('Previous files are left in the bucket (nothing deleted):');
    for (const d of replaced) log(`  ${d.previous}`);
  }
  return 0;
}

export async function exportRecordingListCommand({ db, out, log }) {
  const { rows, awaitingReview } = buildRecordingList(await loadSnapshot(db));
  log(`${rows.length} approved form(s) need a native recording; ${awaitingReview} more are waiting for review first.`);
  if (!out) {
    log('Add --out <file.csv> to write the recording sheet.');
    return 0;
  }
  await writeCsv(out, RECORDING_COLUMNS, rows);
  log(`Wrote ${out}. Save each recording as its file_name, then run upload-audio on the folder.`);
  return 0;
}
