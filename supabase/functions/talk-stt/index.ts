// "Talk to a Tunisian" speech-to-text proxy.
//
// Holds the AI provider's secret API key and forwards one recorded turn to
// the transcription endpoint. Only called when the learner uses the mic
// (live mode only — see src/hooks/useVoiceRecorder.ts and
// app/talk/[scenarioId].tsx), and by pronunciation scoring.
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
// Deploy: supabase functions deploy talk-stt
// Secrets: the existing AI_API_KEY / AI_BASE_URL, plus optionally
//   supabase secrets set AI_STT_MODEL=whisper-1              # optional, this is the default
//   supabase secrets set AI_MONTHLY_BUDGET_USD=10            # optional, this is the default
//   supabase secrets set AI_PRICE_STT_PER_MINUTE=0.006       # optional; see docs/cost-controls.md
//
// This hasn't been exercised against a live key in this environment either.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { supabaseBudgetStore } from '../_shared/supabaseBudgetStore.ts';
import { createSttHandler } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const asCaller = (token: string) =>
  createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });

Deno.serve(
  createSttHandler({
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
