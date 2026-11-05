// Shared command-line handling: arguments, the database connection (dry run
// unless --execute, plus an exact --confirm-host to write), and exit codes.
import { parseArgs } from 'node:util';

import { connectFromEnv, UsageError } from './db.mjs';

/**
 * Runs `command(values, positionals, { db, host, log })`. `writes` is true for
 * commands that can change the database (they get --execute/--confirm-host).
 */
export async function runCli({ usage, options = {}, writes = false, minPositionals = 0 }, command) {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        ...options,
        help: { type: 'boolean' },
        ...(writes ? { execute: { type: 'boolean' }, 'confirm-host': { type: 'string' } } : {}),
      },
    });
    if (values.help || positionals.length < minPositionals) {
      console.log(usage);
      process.exitCode = values.help ? 0 : 2;
      return;
    }
    const execute = writes && !!values.execute;
    const { db, host } = await connectFromEnv({ execute, confirmHost: values['confirm-host'] });
    console.log(`Database: ${host} (${writes ? (execute ? 'WRITING' : 'dry run — read only') : 'read only'})`);
    process.exitCode = await command(values, positionals, { db, execute, log: (s) => console.log(s) });
  } catch (error) {
    if (error instanceof UsageError || error?.code?.startsWith?.('ERR_PARSE_ARGS')) {
      console.error(error.message);
      console.error(usage);
      process.exitCode = 2;
    } else {
      console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
}
