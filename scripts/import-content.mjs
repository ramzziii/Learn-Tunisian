#!/usr/bin/env node
// Bulk-imports a content spreadsheet (.xlsx or .csv) as DRAFT units, lessons,
// word groups and forms. Dry run unless --execute. See docs/content-pipeline.md.
import { runCli } from './lib/content/cli.mjs';
import { importContentCommand } from './lib/content/commands.mjs';
import { readTable } from './lib/content/sheet.mjs';
import { validateImportRows } from './lib/content/validate.mjs';

const usage = `Usage:
  node scripts/import-content.mjs <sheet.xlsx|sheet.csv> --validate-only     (no database needed)
  node scripts/import-content.mjs <sheet.xlsx|sheet.csv>                     (dry run against the database)
  node scripts/import-content.mjs <sheet.xlsx|sheet.csv> --execute --confirm-host <project>.supabase.co
Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (except --validate-only).`;

const validateOnly = process.argv.includes('--validate-only');
if (validateOnly) {
  // Checks the sheet alone, without connecting to any database.
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!file) {
    console.log(usage);
    process.exitCode = 2;
  } else {
    const table = await readTable(file);
    const { errors } = validateImportRows(table.header, table.records);
    console.log(`Read ${table.records.length} row(s).`);
    for (const e of errors) console.log(`  row ${e.rows.join(', ')}: ${e.message}`);
    console.log(errors.length ? `INVALID: ${errors.length} problem(s).` : 'All rows pass validation.');
    process.exitCode = errors.length ? 1 : 0;
  }
} else {
  await runCli({ usage, writes: true, minPositionals: 1 }, (values, [file], { db, execute, log }) =>
    importContentCommand({ file, db, execute, log })
  );
}
