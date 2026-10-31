@AGENTS.md

## Product rules (adults-only, one profile per account)

- The app is for adults (18+) only. There is no kids track: no `Track`
  type, no kid exercises/UI, no under-13 mic/AI restrictions, no app-level
  `is_for_child` logic. `src/__tests__/noKidsTrack.test.ts` guards this.
- Onboarding order: welcome → date-of-birth age gate (`app/onboarding/age.tsx`,
  before sign-up) → create account → Terms/Privacy consent → profile setup
  (DOB shown read-only) → daily goal + reminder. Use `isAdult`/`ADULT_MIN_AGE`
  from `src/lib/age.ts`; an under-18 DOB is never persisted, logged or sent.
- One profile per account: no switcher, no "add profile". The database
  enforces it (trigger in `0019_one_profile_per_account.sql`, error
  `profile_already_exists` / 23505 → `ProfileAlreadyExistsError`). Accounts
  that already have several profiles get the one-time chooser at
  `app/profiles` until one is picked; never merge, rewrite or delete their
  profiles. Don't add a unique index on `profiles(account_id)` until
  `scripts/check-duplicate-profiles.sql` reports none.
- Legacy NOT NULL columns stay in the DB: always write `profiles.track =
  'adult'` and `consent_records.is_for_child = false`. Don't drop them or
  add migrations for this without asking.
- Consent text in `app/onboarding/consent.tsx` is still placeholder — real
  Terms/Privacy documents are an open release blocker. Don't invent legal
  copy.

## Language review (AI content verification)

- Reviewing/verifying AI-generated Tunisian Arabic is limited to accounts in
  `public.reviewers` (0020). `is_admin` does NOT imply reviewer — never use it
  to authorize review. See docs/language-review.md.
- `talk-review` verifies the JWT, checks `reviewers` with the service role,
  and is the only writer of `phrases`/`sentences` and of resolved
  `corrections` rows; clients have no write privileges there. Its logic lives
  in `supabase/functions/talk-review/handler.ts` (no Deno imports, run under
  Jest) — keep it that way.
- Don't hard-code reviewer emails or UUIDs anywhere; reviewers are added by
  hand in the SQL editor.

## Paid AI calls (cost controls)

- Every paid AI-provider call must go through `meteredCall` in
  `supabase/functions/_shared/aiBudget.ts`: per-account daily quota first
  (0018, unchanged), then an atomic monthly budget reservation (0021), then
  reconcile / release / mark ambiguous. Never call the provider outside it,
  and never release a reservation for a timeout or network error.
- Usage is logged only by `reconcile_ai_budget` via the service role; never
  insert into `ai_usage_log` from a client or with the caller's JWT.
- Edge Function logic lives in each function's `handler.ts` (no Deno/npm
  imports, run under Jest); `index.ts` only wires Supabase. Jest tests
  `require()` handlers so tsc doesn't follow their `.ts` imports.
- Database tests: `npm run test:db` (PGlite, `supabase/tests/`). PGlite can't
  run inside Jest here.
- Changing a model or provider pricing? Update the defaults/AI_PRICE_* and
  docs/cost-controls.md.

## Account deletion

- `delete-account` deletes only the account of the verified JWT; it rejects
  any target in the body. Order: storage → `delete_account_data` (0022) →
  Auth user last. Never report success before the Auth user is gone.
- New table or column that holds user data? Decide delete vs. anonymize,
  add it to `delete_account_data` and `account_storage_objects` (0022 or a
  later migration), `supabase/tests/accountDeletion.test.mjs`, and
  docs/account-deletion.md.
- New per-profile device storage must use `learn-tunisian.<feature>.<profileId>`
  keys so `clearLocalAccountData` finds them; shared/device-wide keys go in
  `src/lib/localStorageKeys.ts`.

## Script and form display

- Render Tunisian text with `TunisianText` (script preference, RTL/LTR) and
  two-form words with `FormDisplay`; don't hand-roll Arabic/transliteration
  Text pairs on learner screens. Use `alwaysShowArabic` / `alwaysShowLatin`
  only for exercises that test that script.
- The form preference (0023, `learner_display_preferences`) is display-only:
  never a gender field, never on `profiles`, never sent to analytics or the
  AI tutor (`src/__tests__/noGenderIdentity.test.ts` guards this). Answer
  checking ignores it — every variant of a word group counts.
- A form without a recording shows "No recording for this form yet"; never
  play another form's audio or a device voice in its place.
