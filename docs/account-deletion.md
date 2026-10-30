# Account deletion

Learners delete their own account in the app: **Profile → Account → Delete
account**. The screen explains what is deleted and what is kept and asks
them to type `DELETE`. It reports success only once the server says the
account is gone.

## How it works

The app calls the `delete-account` Edge Function with `{ "confirm": "DELETE" }`
and nothing else.

1. **Who.** The function verifies the caller's JWT with Supabase Auth. That
   user id is the only account it can delete. A body naming any target (user
   or account id, profile id, email, admin flag…) is rejected with `400
   target_not_allowed`. A missing or invalid JWT is a `401`. No reauthentication
   step is used: the app has no "re-enter your password" flow, and a signed-in
   session plus the typed confirmation is the chosen bar.
2. **Storage.** The account's private files are listed with
   `account_storage_objects` and removed through the Storage API.
3. **Database.** `delete_account_data` (migration `0022_account_deletion.sql`)
   runs in one transaction: it deletes the account's rows and removes its
   links from what is kept.
4. **Auth.** The Auth user is hard-deleted with the Admin API. This is last,
   so until it happens the person can still sign in and retry.

The function answers `200 { "status": "deleted" }` only after step 4. If any
step fails it answers `500 { "error": { "kind": "deletion_incomplete", "step":
"storage" | "database" | "auth" } }` and stops. The app shows the message, keeps
the user signed in and lets them retry.

On success, the app removes this account's local data, then signs out locally
and opens the welcome screen. It removes:
- the reminders of the account's profiles;
- every saved key for its profiles (`learn-tunisian.<feature>.<profileId>`);
- the active-profile choice, if it pointed at one of them;
- an admin's "view as" preview setting;
- cached tutor speech files, named `tutor-speech-<profileId>-…`.

Shared lesson audio (`audio-cache`), the theme setting and other accounts'
data on the same device are left alone.

### Not atomic — what a partial failure leaves behind

Storage, the database and Auth are separate services, so the sequence can't
be one transaction. Each step is safe to repeat:

| Fails at | State left | Recovery |
| --- | --- | --- |
| storage | Some of the account's private recordings may already be removed; everything else intact; can still sign in. | Retry from the app. |
| database | Files removed; rows intact (the step is one transaction, so no half-deleted rows); can still sign in. | Retry from the app. |
| auth | Files and rows gone; the Auth user still exists, so the person can still sign in. They'd land in onboarding with no data. The app does **not** say the account is deleted. | Retry from the app (steps 2–3 are no-ops), or delete the user in Dashboard → Authentication. |
| response lost after success | Everything done. | A retry gets `already_deleted` and the app finishes the local cleanup. |

`already_deleted` is returned when Supabase Auth reports that the JWT's user
no longer exists. Auth checks the token's signature before looking the user
up, so a forged token can't produce it, and even then it performs no action.

If an Auth user is ever deleted another way (e.g. in the Dashboard), the
database cascades still remove the rows, but the private storage files are
orphaned. Find them with
`select * from storage.objects where bucket_id = 'translation-audio'` and
remove any whose request no longer exists, via the Storage UI or API.

## What happens to each kind of data

Decided from the schema's actual foreign keys and verified in
`supabase/tests/accountDeletion.test.mjs` against all migrations.

**Deleted**

| Where | What |
| --- | --- |
| `accounts` | The account row (and its `is_admin` flag). |
| `profiles` | The profile: name, date of birth, country, language, level, goal, Premium flag. |
| `daily_goal_settings` | Daily goal and reminder time. |
| `consent_records` | Terms/Privacy consent record. |
| `progress`, `favorites`, `session_logs` | Learning progress, favorites, practice history. |
| `corrections` | The learner's own AI conversation turns (review candidates). |
| `translation_requests` | Their questions and the answers to them. |
| Storage `translation-audio/<request id>/…` | The answer and explanation recordings for their requests. |
| `ai_daily_usage` | Their daily AI counters. |
| `reviewers` | Their language-reviewer allowlist entry. |
| Auth user | Sign-in identity and email (hard delete). |

**Kept, with the account's links removed**

| Where | Kept | Removed | Why kept |
| --- | --- | --- | --- |
| `units`, `lessons`, `word_groups`, `word_variants` | The shared content | `created_by`, `updated_by`, `approved_by`, `recording_skipped_by` | Other learners use it. |
| Shared copies of their translation answers (`word_groups` `tr_…`, `audio/tr_…/…`) | The shared content | No account link existed. | Shared content, possibly already approved. |
| Other learners' `translation_requests` they handled as an admin | The request | `handled_by` | It belongs to the other learner. |
| `ai_usage_log` | Call type, model, tokens/characters/seconds, estimated cost, budget month, pricing used | `account_id`, `profile_id` | Accurate monthly AI cost totals (`docs/cost-controls.md`). |
| `ai_budget_reservations` | Amount, call type, model, status | `account_id` | A still-held reservation must keep counting against the budget. |

Anonymized AI cost records have **no expiry**. They identify no one. To trim
old months by hand:
`delete from public.ai_usage_log where budget_month < date '2026-01-01';`

**Not changed — free-text name labels.** `native_reviewer` (on phrases,
sentences and conversation examples), `reviewer_name` (on reviewed
corrections) and `speaker_name` (on word recordings) are names typed by
reviewers and admins. They aren't linked to any account, so deletion can't
tell which belong to the person deleting. To remove someone's name on
request:

```sql
update public.phrases set native_reviewer = null where native_reviewer = '<name>';
update public.sentences set native_reviewer = null where native_reviewer = '<name>';
update public.conversation_examples set native_reviewer = null where native_reviewer = '<name>';
update public.corrections set reviewer_name = null where reviewer_name = '<name>';
update public.word_variants set speaker_name = null where speaker_name = '<name>';
```

**Outside this app's database**
- Supabase's own Auth audit log and platform/API/Edge Function logs may hold
  the user id or email. Their retention is set by Supabase and your plan.
- The email provider used by `translation-answered-email` keeps its own
  delivery logs.
- Database backups keep deleted rows until they expire.

## Admins and reviewers

Deletion is never blocked by a role. The screen tells an admin or reviewer
what they're giving up.
- **Last admin:** after deletion nobody can open the admin screens. Make
  another account an admin in the SQL Editor:
  `update public.accounts set is_admin = true where id = '<user uuid>';`
  (find the UUID in Dashboard → Authentication → Users).
- **Last reviewer:** language review stops until someone is added to
  `public.reviewers` (`docs/language-review.md`).
- Content they created or approved stays, unattributed (see above).

## Deploying

1. Apply `supabase/migrations/0022_account_deletion.sql` (after 0021).
2. `supabase functions deploy delete-account`. No secrets to set.
3. Check on a **test account**, not a real one:
   - Sign up, add some progress and a translation request.
   - Delete the account from Profile → Account and confirm you land on the
     welcome screen and can't sign in again.
   - In the SQL Editor:
     `select count(*) from public.accounts where id = '<test user uuid>';` → 0.
   - The test user is gone from Authentication → Users.
4. Optional negative checks:
   - A request without `Authorization` → 401.
   - A body with `"userId"` → 400.
