#!/usr/bin/env node
// Writes a CSV of every draft / pending-review form for the native reviewer,
// with empty verdict (ok / fix / reject), corrected_arabic,
// corrected_transliteration and reviewer_note columns. Reads only.
import { runCli } from './lib/content/cli.mjs';
import { exportForReviewCommand } from './lib/content/commands.mjs';

const usage = `Usage:
  node scripts/export-for-review.mjs --out review.csv
Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment. Never writes to the database.`;

await runCli({ usage, options: { out: { type: 'string' } } }, (values, _p, { db, log }) => exportForReviewCommand({ db, out: values.out, log }));
