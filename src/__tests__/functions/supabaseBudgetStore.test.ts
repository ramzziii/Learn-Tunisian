/**
 * @jest-environment node
 */
// The Supabase-backed BudgetStore must call the 0021 SQL functions with
// exactly the parameter names they declare (PostgREST matches by name — a
// typo would only fail in production), and must throw rather than swallow
// a database error.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as { readFileSync: (path: string, encoding: string) => string };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { supabaseBudgetStore } = require('../../../supabase/functions/_shared/supabaseBudgetStore.ts');
declare const __dirname: string;

const sql = readFileSync(join(__dirname, '../../../supabase/migrations/0021_ai_monthly_budget.sql'), 'utf8');

function declaredParams(fn: string): string[] {
  const m = new RegExp(`create function public\\.${fn}\\(([\\s\\S]*?)\\)\\s*returns`, 'i').exec(sql);
  if (!m) throw new Error(`${fn} not found`);
  return m[1]
    .split(',')
    .map((p) => p.trim().split(/\s+/)[0])
    .filter(Boolean)
    .sort();
}

function recordingClient(result: { data: unknown; error: { message: string } | null } = { data: 'res-1', error: null }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return result;
    },
  };
}

it('calls every budget function with exactly the parameters it declares', async () => {
  const client = recordingClient();
  const store = supabaseBudgetStore(client);
  await store.reserve({ accountId: 'a', callType: 'chat', model: 'm', amountUsd: 0.1, budgetUsd: 10 });
  await store.reconcile({ reservationId: 'r', profileId: null, units: { promptTokens: 1 }, costUsd: 0.01, usageEstimated: false, pricing: {} });
  await store.release('r');
  await store.markAmbiguous('r', 'timeout');

  for (const { fn, args } of client.calls) {
    expect([fn, Object.keys(args).sort()]).toEqual([fn, declaredParams(fn)]);
  }
  expect(client.calls.map((c) => c.fn)).toEqual(['reserve_ai_budget', 'reconcile_ai_budget', 'release_ai_budget', 'mark_ai_budget_ambiguous']);
});

it('maps every usage unit, using null for the ones a call type doesn’t have', async () => {
  const client = recordingClient();
  await supabaseBudgetStore(client).reconcile({
    reservationId: 'r',
    profileId: 'p',
    units: { audioSeconds: 4.2 },
    costUsd: 0.00042,
    usageEstimated: false,
    pricing: { model: 'whisper-1', perMinute: 0.006 },
  });
  expect(client.calls[0].args).toEqual({
    p_reservation_id: 'r',
    p_profile_id: 'p',
    p_prompt_tokens: null,
    p_completion_tokens: null,
    p_total_tokens: null,
    p_input_characters: null,
    p_audio_seconds: 4.2,
    p_cost_usd: 0.00042,
    p_usage_estimated: false,
    p_pricing: { model: 'whisper-1', perMinute: 0.006 },
  });
});

it('a refused reservation (null) comes back as null', async () => {
  const store = supabaseBudgetStore(recordingClient({ data: null, error: null }));
  await expect(store.reserve({ accountId: 'a', callType: 'tts', model: 'tts-1', amountUsd: 1, budgetUsd: 1 })).resolves.toBeNull();
});

it('a database error is thrown, never treated as success or as "no budget"', async () => {
  const store = supabaseBudgetStore(recordingClient({ data: null, error: { message: 'connection reset' } }));
  await expect(store.reserve({ accountId: 'a', callType: 'tts', model: 'tts-1', amountUsd: 1, budgetUsd: 10 })).rejects.toThrow(/connection reset/);
  await expect(
    store.reconcile({ reservationId: 'r', profileId: null, units: {}, costUsd: 0, usageEstimated: true, pricing: {} })
  ).rejects.toThrow(/reconcile_ai_budget failed/);
  await expect(store.release('r')).rejects.toThrow();
  await expect(store.markAmbiguous('r', 'x')).rejects.toThrow();
});
