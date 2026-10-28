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
