// Support for the TEST-PROJECT journeys (npm run test:e2e:staging): they
// create, change and delete content, so they only ever run against a
// separate Supabase test project — never the live one. Settings come from
// .env.staging.local (not committed): STAGING_SUPABASE_URL,
// STAGING_SUPABASE_ANON_KEY, STAGING_TEST_PASSWORD; the web build under test
// is served at E2E_STAGING_BASE (default http://localhost:8091), built with
// the test project's keys.
import { readFileSync } from 'node:fs';

function readEnvFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .filter((l) => /^[A-Z0-9_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')])
    );
  } catch {
    return {};
  }
}

const staging = { ...readEnvFile('.env.staging.local'), ...process.env };
const live = readEnvFile('.env');

export const STAGING = {
  url: staging.STAGING_SUPABASE_URL ?? '',
  anonKey: staging.STAGING_SUPABASE_ANON_KEY ?? '',
  password: staging.STAGING_TEST_PASSWORD ?? '',
  base: (staging.E2E_STAGING_BASE ?? 'http://localhost:8091').replace(/\/$/, ''),
};

const host = (u) => {
  try {
    return new URL(u).host;
  } catch {
    return '';
  }
};

/** Why these journeys must not run, or null when it's safe. */
export function unsafeReason() {
  if (!STAGING.url || !STAGING.anonKey || STAGING.password.length < 10) return 'fill in .env.staging.local (test project only)';
  const liveUrl = live.EXPO_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  if (liveUrl && host(liveUrl) === host(STAGING.url)) return 'STAGING_SUPABASE_URL is the LIVE project — refusing to write to it';
  if (/learn-tunisian\.expo\.app/.test(STAGING.base)) return 'E2E_STAGING_BASE is the live site — refusing';
  return null;
}

/** The test project's auth + REST, as a signed-in user (never the service role). */
async function api(path, { method = 'GET', token, body, headers = {} } = {}) {
  const res = await fetch(`${STAGING.url}${path}`, {
    method,
    headers: {
      apikey: STAGING.anonKey,
      Authorization: `Bearer ${token ?? STAGING.anonKey}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 200)}`);
  return data;
}

/**
 * Makes sure a made-up test account exists with a complete profile, the way
 * the app's own sign-up would leave it, and returns its id and token.
 */
export async function ensureTestAccount(email, name) {
  let session;
  try {
    session = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: STAGING.password } });
  } catch {
    session = await api('/auth/v1/signup', { method: 'POST', body: { email, password: STAGING.password } });
    if (!session.access_token) throw new Error('sign-up needs "Confirm email" switched OFF in the test project');
  }
  const token = session.access_token;
  const id = session.user.id;
  const profiles = await api(`/rest/v1/profiles?account_id=eq.${id}&select=id`, { token });
  if (profiles.length === 0) {
    const [profile] = await api('/rest/v1/profiles', {
      method: 'POST',
      token,
      headers: { Prefer: 'return=representation' },
      body: {
        account_id: id,
        name,
        date_of_birth: '1990-01-01',
        native_language: 'English',
        country: 'Tunisia',
        starting_proficiency: 'none',
        track: 'adult',
      },
    });
    await api('/rest/v1/consent_records', { method: 'POST', token, body: { account_id: id, profile_id: profile.id, is_for_child: false, terms_version: 'v1' } });
    await api('/rest/v1/daily_goal_settings', {
      method: 'POST',
      token,
      body: { profile_id: profile.id, daily_goal_minutes: 5, reminder_time: '18:00:00', reminder_enabled: false },
    });
  }
  return { id, token };
}

/** Is this test account an admin and a language reviewer? */
export async function roles(token, id) {
  const [account] = await api(`/rest/v1/accounts?id=eq.${id}&select=is_admin`, { token });
  const isReviewer = await api('/rest/v1/rpc/is_reviewer', { method: 'POST', token, body: {} });
  return { isAdmin: account?.is_admin === true, isReviewer: isReviewer === true };
}

/** A short, valid WAV (silence) for the upload step. */
export function silentWav(seconds = 1, sampleRate = 8000) {
  const samples = seconds * sampleRate;
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples * 2, 40);
  return buf;
}
