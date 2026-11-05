#!/usr/bin/env node
// Applies a returned review sheet: ok / fix -> approved (fix applies the
// corrections), reject -> rejected, recording the reviewer and the time.
// The reviewer's account must be in public.reviewers. Dry run unless --execute.
import { runCli } from './lib/content/cli.mjs';
import { importReviewCommand } from './lib/content/commands.mjs';

const usage = `Usage:
  node scripts/import-review.mjs review.csv --reviewer-account <account id> --reviewer-name "<name>"
  node scripts/import-review.mjs review.csv --reviewer-account <account id> --reviewer-name "<name>" --execute --confirm-host <project>.supabase.co
Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.`;

await runCli(
  { usage, writes: true, minPositionals: 1, options: { 'reviewer-account': { type: 'string' }, 'reviewer-name': { type: 'string' } } },
  (values, [file], { db, execute, log }) =>
    importReviewCommand({ file, db, execute, log, reviewerAccount: values['reviewer-account'], reviewerName: values['reviewer-name'] })
);
