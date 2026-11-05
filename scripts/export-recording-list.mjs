#!/usr/bin/env node
// Writes the recording sheet: every approved form still without a native
// recording, in recording order, with the file name to save it as. Reads only.
import { runCli } from './lib/content/cli.mjs';
import { exportRecordingListCommand } from './lib/content/commands.mjs';

const usage = `Usage:
  node scripts/export-recording-list.mjs --out recordings.csv
Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment. Never writes to the database.`;

await runCli({ usage, options: { out: { type: 'string' } } }, (values, _p, { db, log }) => exportRecordingListCommand({ db, out: values.out, log }));
