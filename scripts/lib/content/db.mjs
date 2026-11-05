// Database access for the content scripts. The scripts run with the
// service-role key from the environment (never from a file in the repo) and
// are dry runs unless --execute is given; with --execute the host must also
// be confirmed exactly (--confirm-host), so a wrong SUPABASE_URL can't
// silently write somewhere else. The key is never printed.
//
// Everything goes through a small adapter (select / insert / update /
// upsert / upload), so the same logic runs against Supabase, a throwaway
// PGlite database in tests, or an in-memory fake.

const PAGE = 1000;
/** A stable order for paging; tables keyed on something other than id. */
const ORDER_BY = { content_source_notes: 'word_variant_id', reviewers: 'user_id' };

export const CONTENT_COLUMNS = {
  units: 'id, name, sort_order, is_curriculum',
  lessons: 'id, unit_id, lesson_number, title, sort_order',
  word_groups: 'id, unit_id, lesson_number, english_meaning, sort_order, content_status',
  word_variants:
    'id, word_group_id, variant_label, word_arabic, transliteration, audio_path, sort_order, content_status, native_verified, is_native_voice, approved_at',
  content_source_notes: 'word_variant_id, note',
};

/** Every content row the scripts work from, read in one go. */
export async function loadSnapshot(db) {
  const entries = await Promise.all(
    Object.entries(CONTENT_COLUMNS).map(async ([table, columns]) => [table, await db.select(table, columns)])
  );
  return Object.fromEntries(entries);
}

/** The adapter over a supabase-js client created with the service-role key. */
export function supabaseAdapter(client) {
  const check = (error, what) => {
    if (error) throw new Error(`${what}: ${error.message}`);
  };
  return {
    async select(table, columns) {
      const rows = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await client.from(table).select(columns).order(ORDER_BY[table] ?? 'id').range(from, from + PAGE - 1);
        check(error, `reading ${table}`);
        rows.push(...data);
        if (data.length < PAGE) return rows;
      }
    },
    async insert(table, rows) {
      if (rows.length === 0) return [];
      const { data, error } = await client.from(table).insert(rows).select();
      check(error, `inserting into ${table}`);
      return data;
    },
    async update(table, patch, match) {
      const { error } = await client.from(table).update(patch).match(match);
      check(error, `updating ${table}`);
    },
    async upsert(table, rows, onConflict) {
      if (rows.length === 0) return;
      const { error } = await client.from(table).upsert(rows, { onConflict });
      check(error, `saving ${table}`);
    },
    async upload(bucket, path, bytes, contentType) {
      const { error } = await client.storage.from(bucket).upload(path, bytes, { contentType, upsert: false });
      check(error, `uploading ${path}`);
    },
  };
}

/**
 * Connects with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Writing needs
 * --execute plus --confirm-host equal to the URL's host, and https.
 */
export async function connectFromEnv({ execute, confirmHost, env = process.env }) {
  const url = env.SUPABASE_URL ?? '';
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) throw new UsageError('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (never in a file in the repo).');
  let host;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('not https');
    host = parsed.host;
  } catch {
    throw new UsageError('SUPABASE_URL must be an https:// address.');
  }
  if (execute && confirmHost !== host) {
    throw new UsageError(`Writing needs --confirm-host ${host} (exactly the host in SUPABASE_URL). Nothing was written.`);
  }
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return { db: supabaseAdapter(client), host };
}

/** A problem with how a script was run (not with the data). */
export class UsageError extends Error {}
