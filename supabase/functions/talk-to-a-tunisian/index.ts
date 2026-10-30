// "Talk to a Tunisian" AI proxy.
//
// Holds the AI provider's secret API key (which must never reach the Expo
// client). Building the *base* system prompt — scenario instructions, level
// rules, word_groups vocabulary, learner context — stays client-side in
// src/lib/ai/buildSystemPrompt.ts, same as always. This function's own job
// used to be a thin, dumb proxy on top of that; it now also does the RAG
// retrieval step, which is a deliberate, justified exception to "prompt-
// building stays client-side" — embedding the learner's message requires
// the same secret API key, so it structurally cannot happen client-side.
//
// The request handling lives in handler.ts (tested under Jest); this file
// wires it to Supabase:
// - the caller's JWT is verified with Supabase Auth; that account owns the
//   usage and is what the daily quota is keyed on;
// - the profile-ownership check, consume_ai_quota (per-account daily cap,
//   0018_ai_quota_and_account_email.sql), retrieval and the corrections log
//   run with the caller's own JWT (RLS-enforced);
// - the monthly budget reservations and usage log use the service role
//   (0021_ai_monthly_budget.sql — clients can't call or forge them). The
//   service-role key comes from the function's environment only.
//
// Deploy: supabase functions deploy talk-to-a-tunisian
// Configure secrets (never commit these):
//   supabase secrets set AI_API_KEY=sk-...
//   supabase secrets set AI_MODEL=gpt-4o-mini              # optional, this is the default
//   supabase secrets set AI_EMBEDDING_MODEL=text-embedding-3-small   # optional, this is the default
//   supabase secrets set AI_BASE_URL=https://api.openai.com/v1       # optional, this is the default
//   supabase secrets set AI_MONTHLY_BUDGET_USD=10                    # optional, this is the default
//   AI_PRICE_CHAT_INPUT_PER_1M_TOKENS / AI_PRICE_CHAT_OUTPUT_PER_1M_TOKENS /
//   AI_PRICE_EMBEDDING_PER_1M_TOKENS — optional; see docs/cost-controls.md
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
// auto-provided by the platform — nothing to set for those.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { supabaseBudgetStore } from '../_shared/supabaseBudgetStore.ts';
import { createChatHandler } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const asCaller = (token: string) =>
  createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });

Deno.serve(
  createChatHandler({
    env: (name) => Deno.env.get(name),
    getUserId: async (token) => {
      const { data, error } = await service.auth.getUser(token);
      return error ? null : (data.user?.id ?? null);
    },
    // RLS on profiles only returns the caller's own.
    ownsProfile: async (token, profileId) => {
      const { data, error } = await asCaller(token).from('profiles').select('id').eq('id', profileId).maybeSingle();
      return !error && data !== null;
    },
    consumeQuota: async (token, kind) => {
      const { data, error } = await asCaller(token).rpc('consume_ai_quota', { p_kind: kind });
      return error ? { error } : { allowed: data === true };
    },
    matchVerifiedContent: async (token, embedding, count) => {
      const { data, error } = await asCaller(token).rpc('match_verified_content', {
        query_embedding: embedding,
        match_count: count,
      });
      if (error) throw error;
      return Array.isArray(data) ? (data as { content: string }[]).map((m) => m.content) : [];
    },
    logCorrection: async (token, profileId, aiGeneratedText) => {
      await asCaller(token).from('corrections').insert({ profile_id: profileId, ai_generated_text: aiGeneratedText });
    },
    store: supabaseBudgetStore(service),
    fetch: (url, init) => fetch(url, init),
    log: (message, error) => console.error(message, error),
  })
);
