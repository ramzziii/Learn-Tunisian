// "Talk to a Tunisian" text-to-speech proxy.
//
// Holds the AI provider's secret API key and forwards one tutor turn to the
// text-to-speech endpoint. Only called in live mode
// (EXPO_PUBLIC_TALK_AI_MODE=live) — mock mode uses on-device expo-speech
// instead, so it never reaches this function (see src/hooks/useTutorSpeech.ts).
//
// The request handling lives in handler.ts (tested under Jest); this file
// wires it to Supabase:
// - the caller's JWT is verified with Supabase Auth; that account owns the
//   usage and is what the daily quota is keyed on;
// - consume_ai_quota runs with the caller's own JWT (per-account daily cap,
//   0018_ai_quota_and_account_email.sql);
// - the monthly budget reservation and usage log use the service role
//   (0021_ai_monthly_budget.sql — clients can't call or forge them). The
//   service-role key comes from the function's environment only.
//
// Deploy: supabase functions deploy talk-tts
// Configure secrets (reuses the same AI_API_KEY as talk-to-a-tunisian):
//   supabase secrets set AI_TTS_MODEL=tts-1     # optional, this is the default
//   supabase secrets set AI_TTS_VOICE=alloy     # optional, this is the default
//   supabase secrets set AI_MONTHLY_BUDGET_USD=10            # optional, this is the default
//   supabase secrets set AI_PRICE_TTS_PER_1M_CHARACTERS=15   # optional; see docs/cost-controls.md
//
// This hasn't been exercised against a live key in this environment — treat
// it as reviewed-but-unverified until tested with real credentials.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { supabaseBudgetStore } from '../_shared/supabaseBudgetStore.ts';
import { createTtsHandler } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const asCaller = (token: string) =>
  createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });

Deno.serve(
  createTtsHandler({
    env: (name) => Deno.env.get(name),
    getUserId: async (token) => {
      const { data, error } = await service.auth.getUser(token);
      return error ? null : (data.user?.id ?? null);
    },
    consumeQuota: async (token, kind) => {
      const { data, error } = await asCaller(token).rpc('consume_ai_quota', { p_kind: kind });
      return error ? { error } : { allowed: data === true };
    },
    store: supabaseBudgetStore(service),
    fetch: (url, init) => fetch(url, init),
    log: (message, error) => console.error(message, error),
  })
);
