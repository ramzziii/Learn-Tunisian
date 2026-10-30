// "Talk to a Tunisian" language review — promotes reviewed AI-generated
// Tunisian Arabic into the verified corpus (phrases/sentences) and resolves
// its row in the corrections queue.
//
// Only allowlisted language reviewers (public.reviewers, 0020) may do this;
// admin status alone doesn't count. The request handling and its order of
// checks live in handler.ts (tested under Jest); this file wires it up:
// - the caller's JWT is verified with Supabase Auth (auth.getUser);
// - reviewer membership, the pending-correction lookup and every write use
//   the service-role client. RLS gives clients no write access to
//   phrases/sentences or to resolve corrections at all, so this function is
//   the only path. The service-role key comes from the function's own
//   environment (set automatically by Supabase) and never leaves it.
//
// - the embedding it computes is reserved against the monthly AI budget and
//   logged for the reviewer's account (0021_ai_monthly_budget.sql), like
//   every other paid AI call.
//
// Deploy: supabase functions deploy talk-review
// Uses the same AI_API_KEY / AI_BASE_URL / AI_EMBEDDING_MODEL /
// AI_MONTHLY_BUDGET_USD / AI_PRICE_EMBEDDING_PER_1M_TOKENS secrets as
// talk-to-a-tunisian — nothing new to configure.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { supabaseBudgetStore } from '../_shared/supabaseBudgetStore.ts';
import { createReviewHandler } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const handler = createReviewHandler({
  env: (name) => Deno.env.get(name),
  fetch: (url, init) => fetch(url, init),
  store: supabaseBudgetStore(service),
  log: (message, error) => console.error(message, error),

  getUserId: async (token) => {
    const { data, error } = await service.auth.getUser(token);
    return error ? null : (data.user?.id ?? null);
  },

  isReviewer: async (userId) => {
    const { data, error } = await service.from('reviewers').select('user_id').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data !== null;
  },

  getCorrection: async (id) => {
    const { data, error } = await service.from('corrections').select('id, is_correct').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return { id: data.id, isPending: data.is_correct === null };
  },

  claimCorrection: async (id, patch) => {
    const { data, error } = await service
      .from('corrections')
      .update(patch)
      .eq('id', id)
      .is('is_correct', null)
      .select('id');
    return !error && (data ?? []).length === 1;
  },

  releaseCorrection: async (id) => {
    await service
      .from('corrections')
      .update({ is_correct: null, corrected_text: null, reviewer_name: null, reviewed_at: null, correction_reason: null })
      .eq('id', id);
  },

  insertVerified: async (table, row) => {
    const { error } = await service.from(table).insert(row);
    return error ? error.message : null;
  },
});

Deno.serve(handler);
