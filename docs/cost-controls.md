# AI cost controls

Every paid call to the AI provider goes through two app-side limits before
it is sent:

1. **A per-account daily quota** — stops one account from using a lot.
2. **A project-wide monthly budget** — stops everyone together from
   spending more than a set amount per month.

Both are **estimates enforced by this app**. They are not a billing cap from
the provider. **Also set a hard monthly spending limit in the OpenAI dashboard**
(Settings → Limits / Billing → usage limits) — that is the only limit the
provider itself guarantees.

## Which calls are paid

| Call | Where | Model setting (default) | Billed by |
| --- | --- | --- | --- |
| Chat reply | `talk-to-a-tunisian` | `AI_MODEL` (`gpt-4o-mini`) | input + output tokens |
| Retrieval embedding | `talk-to-a-tunisian` | `AI_EMBEDDING_MODEL` (`text-embedding-3-small`) | input tokens |
| Reviewer's promotion embedding | `talk-review` | `AI_EMBEDDING_MODEL` | input tokens |
| Text-to-speech | `talk-tts` | `AI_TTS_MODEL` (`tts-1`) | input characters |
| Speech-to-text | `talk-stt` | `AI_STT_MODEL` (`whisper-1`) | audio seconds |
| Seed embeddings | `scripts/seed-talk-rag-content.mjs` | `text-embedding-3-small` | input tokens |

All of them reserve against the monthly budget and are logged in
`ai_usage_log`. The app client never sees the provider key.

## 1. Per-account daily limits (unchanged)

From `0018_ai_quota_and_account_email.sql`, keyed by the signed-in account
(never by a profile id the client sends):

| Kind | Limit per account per day |
| --- | --- |
| chat (one conversation turn) | 60 |
| tts | 200 |
| stt | 150 |

Days are **UTC calendar days** — the counts reset at 00:00 UTC. A refused
call isn't counted. Over the limit the function answers `429
daily_limit_reached` and the app shows its "come back tomorrow" message.

The quota is checked first, then the monthly budget. So when the monthly
budget is used up, a request still uses one unit of that day's quota.

## 2. Project-wide monthly budget

- `AI_MONTHLY_BUDGET_USD` (Edge Function secret), default **10**. One pool for
  all accounts and all call types.
- Months are **UTC calendar months**: spend counts toward the month a call
  was *reserved* in, and the budget starts fresh at 00:00 UTC on the 1st.
- When a call would exceed it, the provider isn't called. The function
  answers `503` with `{ "error": { "kind": "budget_exhausted" } }` and the app
  shows *"Talk to a Tunisian is temporarily unavailable. Please try again
  later."* (no retry button).

An invalid budget or price setting **fails closed** (`500 not_configured`): no
paid call is made until it's fixed.

### Prices

Set as Edge Function secrets (`supabase secrets set NAME=value`). Each applies
to whichever model is configured for that call type. If unset, the default
for the default model is used. **A model with no default needs its price set
explicitly**, or calls fail closed.

| Variable | Unit | Default (for the default model) |
| --- | --- | --- |
| `AI_MONTHLY_BUDGET_USD` | USD per UTC month | `10` |
| `AI_PRICE_CHAT_INPUT_PER_1M_TOKENS` | USD per 1M input tokens | `0.15` (`gpt-4o-mini`) |
| `AI_PRICE_CHAT_OUTPUT_PER_1M_TOKENS` | USD per 1M output tokens | `0.60` (`gpt-4o-mini`) |
| `AI_PRICE_EMBEDDING_PER_1M_TOKENS` | USD per 1M input tokens | `0.02` (`text-embedding-3-small`) |
| `AI_PRICE_TTS_PER_1M_CHARACTERS` | USD per 1M input characters | `15` (`tts-1`) |
| `AI_PRICE_STT_PER_MINUTE` | USD per minute of audio | `0.006` (`whisper-1`) |

**Review these whenever you change a model or the provider changes its
pricing.** The defaults are the published list prices as of when this was
written (`supabase/functions/_shared/aiBudget.ts`). The seed script reads
`AI_MONTHLY_BUDGET_USD` and `AI_PRICE_EMBEDDING_PER_1M_TOKENS` from its own
environment.

## How the estimate works

Implemented in `supabase/functions/_shared/aiBudget.ts` (Edge Functions) and
`supabase/migrations/0021_ai_monthly_budget.sql` (database).

1. **Reserve.** Before the call, the function reserves a conservative upper
   bound for it (`reserve_ai_budget`). The database takes a per-month lock,
   adds up this month's logged spend **plus every outstanding reservation**,
   and grants the reservation only if the new total stays within the budget
   (exactly reaching it is allowed). Concurrent requests queue on the lock,
   so they can't each see "room left" and overshoot together.
   - Chat: every UTF-8 byte of the prompt counted as a token, plus per-message
     overhead, plus the full `max_tokens` (400) of output.
   - Embedding: every UTF-8 byte of the input counted as a token.
   - TTS: the exact character count (after truncation to 800).
   - STT: the duration isn't known before the provider decodes the audio, so
     it's bounded from the file size at 16 kbps (2000 bytes per second) — longer
     than any real recording of that size.
2. **Call the provider.**
3. **Settle the reservation:**
   - **Billed** (the provider accepted the request) → `reconcile_ai_budget`
     writes the `ai_usage_log` row (account, profile when there is one, model,
     units, `estimated_cost_usd`, the prices used in `pricing`) and closes the
     reservation, in one transaction. If the provider didn't report usage, the
     reserved upper bound is recorded with `usage_estimated = true`.
   - **Refused** (the provider answered with an error status, including 429)
     → `release_ai_budget`. Treated as not billed.
   - **Ambiguous** (timeout, network failure, or the function failing
     mid-call) → `mark_ai_budget_ambiguous`. The reservation **stays counted
     at its upper bound** until someone settles it by hand. Retrying makes a
     new reservation, so retries can't spend past the cap.
4. **If the accounting itself fails**, nothing is called (reservation failure
   → `503 budget_check_failed`) or the request is reported as failed (logging
   failure → `500 accounting_failed`, never a success). The reservation then
   stays held, so the spend is still counted.

So the guard errs high. Ambiguous or crashed calls hold their full upper
bound, and missing usage is recorded at the bound. Over time that can
make the app stop a little before the real bill reaches the budget. It can
also differ from the provider's bill in the other direction (wrong prices,
provider-side rounding, minimum charges), which is why the provider's own
hard limit matters.

Rows in `ai_usage_log` from before 0021 have no cost or budget month and
aren't counted.

## Queries (Supabase → SQL Editor)

```sql
-- This month's estimated spend and what's still held
select
  (select coalesce(sum(estimated_cost_usd), 0) from public.ai_usage_log
     where budget_month = public.ai_budget_month(now())) as spent_usd,
  (select coalesce(sum(reserved_usd), 0) from public.ai_budget_reservations
     where budget_month = public.ai_budget_month(now()) and status in ('reserved', 'ambiguous')) as held_usd;

-- Spend by call type and model, per month
select budget_month, call_type, model, count(*) as calls,
       sum(prompt_tokens) as prompt_tokens, sum(completion_tokens) as completion_tokens,
       sum(input_characters) as characters, sum(audio_seconds) as audio_seconds,
       sum(estimated_cost_usd) as usd, count(*) filter (where usage_estimated) as estimated_rows
from public.ai_usage_log
where budget_month is not null
group by 1, 2, 3
order by 1 desc, usd desc;

-- Top accounts this month
select account_id, sum(estimated_cost_usd) as usd, count(*) as calls
from public.ai_usage_log
where budget_month = public.ai_budget_month(now())
group by 1 order by 2 desc limit 20;

-- Reservations still held (ambiguous, or 'reserved' for more than a few minutes = the function died mid-call)
select id, account_id, call_type, model, reserved_usd, status, note, created_at
from public.ai_budget_reservations
where status in ('reserved', 'ambiguous') and created_at < now() - interval '10 minutes'
order by created_at;
```

### Settling a held reservation by hand

Check the provider's usage page for that time. Then either:

```sql
-- It was billed: record it (at the held amount if you don't know better).
select public.reconcile_ai_budget('<reservation id>', null, null, null, null, null, null,
  <cost_usd>, true, '{"source": "manual reconciliation"}'::jsonb);

-- It wasn't billed: free it.
update public.ai_budget_reservations
  set status = 'released', settled_at = now(), note = coalesce(note, '') || ' — released by hand'
  where id = '<reservation id>' and status in ('reserved', 'ambiguous');
```

## Verifying the concurrency guard on a real database

The automated database tests (`npm run test:db`) use a single in-memory
Postgres connection. They show that reservations which together exceed
the budget are not all granted, but **they can't make two real sessions race**.
To check that on a staging project (not production):

1. Set a tiny budget for the test, e.g. call the function directly with
   `p_budget_usd = 1`.
2. From two SQL Editor tabs (or `psql` sessions), run at the same time:

   ```sql
   begin;
   select public.reserve_ai_budget(null, 'chat', 'gpt-4o-mini', 0.6, 1);
   select pg_sleep(5);
   commit;
   ```

3. One gets an id and the other waits for the lock, then gets `null`
   (0.6 + 0.6 > 1). Afterwards release the granted one:
   `update public.ai_budget_reservations set status = 'released' where status = 'reserved' and account_id is null;`

## Setup checklist

1. Apply `supabase/migrations/0021_ai_monthly_budget.sql` (after 0017 and 0018).
2. Optionally set `AI_MONTHLY_BUDGET_USD` and any `AI_PRICE_*` secrets.
3. Redeploy `talk-to-a-tunisian`, `talk-tts`, `talk-stt` and `talk-review`
   (they now share `supabase/functions/_shared/`).
4. **Set a hard monthly limit in the OpenAI dashboard.**
