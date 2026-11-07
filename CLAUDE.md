@AGENTS.md

## Product rules (adults-only, one profile per account)

- The app is for adults (18+) only. There is no kids track: no `Track`
  type, no kid exercises/UI, no under-13 mic/AI restrictions, no app-level
  `is_for_child` logic. `src/__tests__/noKidsTrack.test.ts` guards this.
- Onboarding order: welcome → date-of-birth age gate (`app/onboarding/age.tsx`,
  before sign-up) → create account → Terms/Privacy consent → profile setup
  (DOB shown read-only) → daily goal → optional reminder. The age gate's DOB
  is typed (MM/DD/YYYY, `src/lib/dateOfBirthInput.ts`), not a picker. Use `isAdult`/`ADULT_MIN_AGE`
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

## Access: Guest preview, Free, Premium

- One access table: `src/lib/access/accessRules.ts`; screens ask
  `useAccess()` (`decide` / `open`), never `isPremium` + their own lists.
  Details: docs/access-and-guest-preview.md.
- Grammar notes aren't counted: guests get sentence order; free accounts
  add present tense and questions; the rest is Premium
  (`FIXED_FREE_ITEMS` in accessRules.ts).
- Counted items (lesson, phrasebook category, proverb, letter,
  Repeat After Me recording): guest 2, free 5 in total (guest use included),
  Premium all. Count on first open/start, never twice; completed lessons
  always reopen; nothing counted while Premium. Open an item through
  `open()` *before* loading its content.
- Practice (Review, Flashcards, Listening, Speaking, Favorites) is not
  counted and uses only `usePracticeScope()` words (approved, from open
  lessons/categories). If access or scope can't load, show an error — never
  fall back to open.
- Free counts live on the server (`feature_item_claims`, 0025, RPCs only).
  Guests are device-only: no anon Auth users, no server writes, no Edge
  Function calls; they read only the `guest_preview_*` views (0024). Admin
  free-plan preview counts stay on the device.
- Talk is Premium only, enforced in the app and in `talk-to-a-tunisian` /
  `talk-tts` via `requirePremium` before quota/budget/provider. Keep
  `talk-stt` open to signed-in free accounts (pronunciation checks).
- Dictionary / Search indexes only what the learner can open (`src/data/search.ts`)
  and keeps it in memory (`src/lib/search/`); search text is never logged,
  stored or sent. All keys come from `searchKeys.ts`; never merge sounds
  that differ (7≠h, 3≠a, 9≠k, 5≠k, 8≠g, 2≠a) or add aliases without approval.
- The age retry block (`src/lib/age/retryBlock.ts`) stores only a yes/no flag
  and expiry; one constant (24 h). Don't claim legal compliance anywhere.

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
- Feedback (0029 `app_feedback`, Profile → Send feedback): signed-in only
  (guests never write), the note + screen + app version and nothing else;
  deleted with the account (cascade); admins read it at Admin → Feedback.
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
- Audio with `is_native_voice = false` is a computer voice (seeded MSA
  text-to-speech): label it (`ComputerVoiceNote`), play it only on tap, never
  autoplay it and never use it in listening or pronunciation exercises
  (`useWordAudioPlayer`'s `source` / `nativeOnly`). The phone's voice is
  never used for words.

## Content pipeline

- Bulk content goes through `scripts/*.mjs` (docs/content-pipeline.md):
  dry run by default; writes need `--execute` and an exact `--confirm-host`;
  service-role key from the environment only. Logic lives in
  `scripts/lib/content/` and is tested with `npm run test:scripts`.
- Imports arrive as draft, never approved; only `import-review` (reviewer in
  `public.reviewers`) approves. Never write Tunisian words or mark them
  approved yourself; never correct a reviewer's sheet.
- `native_verified` = text checked by a native speaker; `is_native_voice` =
  native recording. A text review never sets `is_native_voice`.
- Only accounts in `public.reviewers` approve or reject content (0028
  trigger, `review_word_variant`; Admin → Review → one at a time). Admins who
  aren't reviewers can edit, send back to draft or archive.
- A spelling change under a recording sets `audio_needs_recheck` (0028): the
  file and `is_native_voice` stay; learners never hear it (learner data uses
  `mapLearnerWordVariant`, which drops the audio) until an admin/reviewer
  confirms it (`confirm_audio_matches`, Admin → Audio → Re-check) or a new
  file replaces it. The flag can't be cleared by editing the column; scripts
  never set `is_native_voice = false` for a spelling change.
- Imports run with `--execute` are logged in `content_import_runs` (dry runs
  never); Admin → Imports shows them, and "Mark as seen" clears Today.
- Lessons with no approved words are hidden from learners (and left out of
  the unlock order) in `fetchLessonMap` / `guestLessonMap`.
- "Words used" links (`phrase_word_links`, 0027) are suggestions until an
  admin saves them (`set_phrase_word_links`, admins only). Matching uses
  `searchKeys.ts` only (`src/lib/phraseWords/suggestWordLinks.ts`): changed
  forms are "possible match", never ticked; never merge differing sounds.
  Learners see approved linked words only; locked words follow the practice
  scope (`WordsUsedSection`).
