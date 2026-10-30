// BudgetStore backed by the 0021 SQL functions, called with the
// service-role client (they're not executable by app clients). Structurally
// typed so it has no npm import and can be tested under Jest
// (src/__tests__/functions/supabaseBudgetStore.test.ts).
import type { BudgetStore } from './aiBudget.ts';

export interface RpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

async function call(client: RpcClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  return data;
}

export function supabaseBudgetStore(service: RpcClient): BudgetStore {
  return {
    async reserve(r) {
      const data = await call(service, 'reserve_ai_budget', {
        p_account_id: r.accountId,
        p_call_type: r.callType,
        p_model: r.model,
        p_amount_usd: r.amountUsd,
        p_budget_usd: r.budgetUsd,
      });
      return typeof data === 'string' ? data : null;
    },
    async reconcile(r) {
      await call(service, 'reconcile_ai_budget', {
        p_reservation_id: r.reservationId,
        p_profile_id: r.profileId,
        p_prompt_tokens: r.units.promptTokens ?? null,
        p_completion_tokens: r.units.completionTokens ?? null,
        p_total_tokens: r.units.totalTokens ?? null,
        p_input_characters: r.units.inputCharacters ?? null,
        p_audio_seconds: r.units.audioSeconds ?? null,
        p_cost_usd: r.costUsd,
        p_usage_estimated: r.usageEstimated,
        p_pricing: r.pricing,
      });
    },
    async release(reservationId) {
      await call(service, 'release_ai_budget', { p_reservation_id: reservationId });
    },
    async markAmbiguous(reservationId, reason) {
      await call(service, 'mark_ai_budget_ambiguous', { p_reservation_id: reservationId, p_reason: reason });
    },
  };
}
