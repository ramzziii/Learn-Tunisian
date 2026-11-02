#!/usr/bin/env node
// Uploads native recordings named <word_group_id>__<variant_label>.mp3 (or
// .m4a) from a folder to the "audio" bucket, unchanged, sets each form's
// audio_path and marks it as a native voice. Only approved forms. Reports
// unmatched/misnamed files and forms still missing audio. Dry run unless --execute.
import { runCli } from './lib/content/cli.mjs';
import { uploadAudioCommand } from './lib/content/commands.mjs';

const usage = `Usage:
  node scripts/upload-audio.mjs <folder> [--replace] [--speaker "<name>"]
  node scripts/upload-audio.mjs <folder> --execute --confirm-host <project>.supabase.co
Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.`;

await runCli(
  { usage, writes: true, minPositionals: 1, options: { replace: { type: 'boolean' }, speaker: { type: 'string' } } },
  (values, [folder], { db, execute, log }) =>
    uploadAudioCommand({ folder, db, execute, log, replace: !!values.replace, speakerName: values.speaker ?? null })
);
