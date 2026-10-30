# Language review (AI content verification)

The review workflow is for checking AI-generated **Tunisian Arabic** — phrases,
sentences and conversation turns the tutor produced — for accuracy and
naturalness. Approving an item (or saving a corrected version) promotes it into
the verified corpus (`phrases` / `sentences` with `native_verified = true`),
which the AI tutor then treats as trusted, native-verified material.

It is **not** a review of users, accounts or code.

## Who can review

Only accounts listed in `public.reviewers` (migration
`0020_language_reviewers.sql`). **Being an admin does not make an account a
reviewer**, and the migration creates the list empty — nobody can review
until you add them.

Where it's enforced:

| Layer | Rule |
| --- | --- |
| `talk-review` Edge Function | Verifies the caller's JWT (401 if missing/invalid), then looks the verified user id up in `public.reviewers` with the service role (403 if not listed, 503 if the lookup fails). Nothing the client sends — user id, email, profile id, flags — is used for this. |
| `corrections` RLS | Only reviewers can read the queue (pending or reviewed). Learners can only log new pending turns for their own profile. No client can update or delete a row. |
| `phrases` / `sentences` / `conversation_examples` | No client (admin or not) can insert, update or delete. Promotion happens only through `talk-review`, using the service role. Learners still read verified rows as before. |
| `public.reviewers` | Clients can only see whether **their own** user id is listed (`is_reviewer()`, or selecting their own row). Nobody can add, change or remove reviewers from the app. |
| App (`app/admin/corrections.tsx`) | Checks membership before fetching or showing the queue; shows access denied for non-reviewers. This is a convenience — the rules above are what actually protect the data. The screen is under `/admin`, so in the app a reviewer also needs to be an admin to open it. |

## Adding a reviewer

1. **Find the user's UUID:** Supabase Dashboard → **Authentication** →
   **Users** → find the user (search by email) → copy the **User UID** column
   (or open the user and copy its ID).
2. **Add them** in Supabase Dashboard → **SQL Editor**:

   ```sql
   insert into public.reviewers (user_id)
   values ('00000000-0000-0000-0000-000000000000');  -- replace with the User UID
   ```

   Or look the id up by email in the same statement:

   ```sql
   insert into public.reviewers (user_id)
   select id from auth.users where email = 'reviewer@example.com';  -- replace
   ```

3. Check: `select user_id, created_at from public.reviewers;`

The reviewer may need to reopen the corrections screen (or sign in again) for
the app to pick it up.

## Removing a reviewer

```sql
delete from public.reviewers where user_id = '00000000-0000-0000-0000-000000000000';  -- replace
```

Deleting a user in Authentication removes their reviewer row automatically.

## Manually verifying the access controls after deploying

Unit tests run the `talk-review` handler and check the migration; the RLS
behaviour was also exercised against a throwaway local Postgres. To confirm on
your real project after applying the migration and redeploying `talk-review`:

1. **Unauthenticated:** `curl -i -X POST https://<project-ref>.supabase.co/functions/v1/talk-review -H 'Content-Type: application/json' -d '{}'`
   → `401` (the Supabase gateway may reject it before the function does — also a 401).
2. **Signed in, not a reviewer** (including an admin who isn't listed): open
   Admin → Corrections in the app → "Reviewer access needed", and the network
   log shows no `corrections` request. A direct call to `talk-review` with that
   user's access token → `403`.
3. **Reviewer:** add the account as above, reopen the screen → the queue
   loads; approving an item removes it from Pending and it appears under
   History.
4. **No direct writes:** in the SQL Editor, impersonate a signed-in user
   (`set local role authenticated; set local request.jwt.claims = '{"sub":"<user uuid>","role":"authenticated"}';`
   inside a transaction) and try `update public.corrections set is_correct = true;`
   or an insert into `public.phrases` → `permission denied`.
