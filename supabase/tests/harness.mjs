// Throwaway in-memory Postgres (PGlite) for database tests — `npm run test:db`.
// Never connects to a real database.
//
// Supabase's own schemas aren't available here, so this builds a minimal
// stand-in for what the AI-cost migrations depend on: the anon /
// authenticated / service_role roles and their default grants, auth.users,
// auth.uid() / auth.role() (read from per-session settings, the way
// PostgREST sets them), and the accounts / profiles / ai_usage_log tables
// and policies as 0001, 0008, 0009 and 0017 left them. The real migration
// files are then applied unchanged on top.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export const ACCOUNT_A = '00000000-0000-0000-0000-00000000000a';
export const ACCOUNT_B = '00000000-0000-0000-0000-00000000000b';
export const PROFILE_A = '10000000-0000-0000-0000-00000000000a';
export const PROFILE_B = '10000000-0000-0000-0000-00000000000b';

const BASELINE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  grant execute on all functions in schema auth to anon, authenticated, service_role;

  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

  create table public.accounts (
    id uuid primary key references auth.users (id) on delete cascade,
    email text not null,
    is_admin boolean not null default false
  );
  create table public.profiles (
    id uuid primary key default gen_random_uuid(),
    account_id uuid not null references public.accounts (id) on delete cascade
  );
  create function public.is_admin() returns boolean language sql stable security definer set search_path = public as
    $$ select coalesce((select is_admin from public.accounts where id = auth.uid()), false) $$;

  -- 0008
  create table public.ai_usage_log (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid references public.profiles (id) on delete set null,
    call_type text not null check (call_type in ('chat', 'embedding')),
    model text not null,
    prompt_tokens int,
    completion_tokens int,
    total_tokens int,
    created_at timestamptz not null default now()
  );
  alter table public.ai_usage_log enable row level security;
  -- 0017
  create policy "ai_usage_log_insert_own_profile" on public.ai_usage_log
    for insert with check (profile_id in (select id from public.profiles where account_id = auth.uid()));
  create policy "ai_usage_log_select_own_or_admin" on public.ai_usage_log
    for select using (public.is_admin() or profile_id in (select id from public.profiles where account_id = auth.uid()));

  insert into auth.users values ('${ACCOUNT_A}', 'a@example.com'), ('${ACCOUNT_B}', 'b@example.com');
  insert into public.accounts (id, email) values ('${ACCOUNT_A}', 'a@example.com'), ('${ACCOUNT_B}', 'b@example.com');
  insert into public.profiles values ('${PROFILE_A}', '${ACCOUNT_A}'), ('${PROFILE_B}', '${ACCOUNT_B}');
  -- A row logged before cost tracking existed (no cost, no budget month).
  insert into public.ai_usage_log (profile_id, call_type, model, prompt_tokens, total_tokens)
    values ('${PROFILE_A}', 'chat', 'gpt-4o-mini', 1000, 1200);
`;

/** A fresh database with the baseline plus the given migration files applied, in order. */
export async function freshDb(migrations) {
  const db = new PGlite();
  await db.exec(BASELINE);
  for (const name of migrations) {
    await db.exec(readFileSync(join(migrationsDir, name), 'utf8'));
  }
  return db;
}

/**
 * Runs one statement as `role` (anon / authenticated / service_role), with
 * `userId` as auth.uid(). Returns { rows, error } instead of throwing.
 */
export async function as(db, role, userId, sql, params = []) {
  await db.exec(`reset role;
    select set_config('request.jwt.claim.sub', '${userId ?? ''}', false);
    select set_config('request.jwt.claim.role', '${role}', false);
    set role ${role};`);
  try {
    const res = await db.query(sql, params);
    return { rows: res.rows, error: null };
  } catch (error) {
    return { rows: [], error };
  } finally {
    await db.exec('reset role;');
  }
}

export const isDenied = (result) =>
  result.error !== null && /permission denied|row-level security/i.test(result.error.message);

// ---------------------------------------------------------------------------
// The whole schema: every migration in supabase/migrations, in order, on top
// of minimal stand-ins for Supabase's own auth / storage / extensions
// schemas. Used where the real foreign keys and cascades matter (account
// deletion).
// ---------------------------------------------------------------------------
const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create schema storage;
  create schema extensions;
  grant usage on schema auth, storage, extensions to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid,
    created_at timestamptz default now()
  );
  alter table storage.objects enable row level security;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

/** A fresh database with Supabase stand-ins and every migration applied. */
export async function fullSchemaDb() {
  const { vector } = await import('@electric-sql/pglite/vector');
  const { readdirSync } = await import('node:fs');
  const db = new PGlite({ extensions: { vector } });
  await db.exec(SUPABASE_STUBS);
  for (const name of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(migrationsDir, name), 'utf8'));
  }
  return db;
}
