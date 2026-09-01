# Learn Tunisian

A Duolingo-style app for learning Tunisian Arabic, built for one account to hold
multiple learner profiles (adult + kids) sharing one content library, with a
kid track (listen/tap only) and an adult/teen track (+ reading, typing,
speaking practice).

## Stack

- Expo (React Native) + Expo Router, TypeScript
- Supabase: Postgres, Auth (email/password), Storage (audio/images)
- expo-audio for playback and recording
- expo-notifications for the one daily reminder
- expo-file-system for offline audio caching

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. In the SQL editor, run these migrations **in order**:
   1. [`0001_init.sql`](supabase/migrations/0001_init.sql) — every table, RLS policy, and the two storage buckets (`audio`, `images`).
   2. [`0002_profile_dob_country.sql`](supabase/migrations/0002_profile_dob_country.sql) — replaces `profiles.age` with `date_of_birth`, adds `country`.
   3. [`0003_word_variants.sql`](supabase/migrations/0003_word_variants.sql) — replaces the flat `words` table with `word_groups` + `word_variants` (see "Word variants" below).
   4. [`0004_spaced_repetition.sql`](supabase/migrations/0004_spaced_repetition.sql) — adds review-scheduling fields to `progress`.
   5. [`0005_favorites.sql`](supabase/migrations/0005_favorites.sql) — a `favorites` table (profile ↔ word_group).
   6. [`0006_content_verification.sql`](supabase/migrations/0006_content_verification.sql) — adds `native_verified` to `word_variants`.
   7. [`0007_session_logs.sql`](supabase/migrations/0007_session_logs.sql) — a `session_logs` table, so Home can show "X / Y minutes today" across multiple sessions in a day.
3. Then run [`supabase/seed.sql`](supabase/seed.sql) — loads the current content set into `word_groups`/`word_variants` (see "Word variants").
4. In Project Settings → API, copy the **Project URL** (not the REST/`/rest/v1/` URL — just the bare project URL) and **anon public key**.

## 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from step 1.4.
These are safe to ship in the client bundle — access control is enforced by
the Row Level Security policies in the migration, not by keeping the anon key
secret.

## 3. Install and run

```bash
npm install
npm start
```

Then press `i` for iOS simulator or `a` for Android emulator (requires Xcode /
Android Studio respectively), or scan the QR code with Expo Go on a physical
device.

## Word variants

A concept (e.g. "let's go") can have more than one way of saying it —
synonyms, or masculine/feminine speaker-gender forms — handled by one
mechanism instead of two:

- **`word_groups`** — one row per concept (`id`, `unit_id`, `lesson_number`,
  `english_meaning`, `image_keyword`/`image_path`). `id` is a readable slug
  (e.g. `"letsgo"`, `"im_hungry"`), not a generated UUID, matching the
  source spreadsheet.
- **`word_variants`** — one row per way of saying it (`word_group_id`,
  `variant_label`: `primary` / `also_heard` / `masculine` / `feminine`,
  `word_arabic`, `transliteration`, `audio_path`, `notes`). Every group has
  either exactly one `primary`, or both a `masculine` and a `feminine`
  variant (enforced by a deferred DB trigger — see
  `0003_word_variants.sql`); `also_heard` variants are optional and don't
  need a primary to coexist with.

App behavior built on this:

- Lessons teach/quiz the `primary` variant by default. A group with no
  primary (masculine+feminine only) alternates between the two as the quiz
  prompt from exercise to exercise — the app never asks the learner's
  gender, so it just shows both fairly over time rather than picking one.
- `also_heard` variants show as a "you might also hear" callout
  (`VariantCallout`) alongside the exercise, not as the quizzed answer.
  Gender pairs show as "if you're a boy / if you're a girl" in the same
  callout, always both, never one preferred.
- Answer checking accepts **any** variant in the group as correct — typing
  the `also_heard` form, or either gender form, all count
  (`isAnyVariantTransliterationMatch` in `src/lib/wordVariants.ts`).
- Multiple-choice distractors are always drawn from *different* word_groups
  — two variants of the same group never compete against each other as
  options (`useExerciseQueue.ts`).

To load real content once your native speaker has reviewed a draft:
replace the `word_groups`/`word_variants` INSERT statements in
`supabase/seed.sql` with the reviewed rows (same `unit` / `lesson_number` /
`word_group_id` / `variant_label` shape as the source spreadsheet), re-run
it, then upload matching audio files to the **audio** bucket at the exact
`audio_path` values used — playback picks them up immediately, no code
changes needed. Images work the same way via `word_groups.image_path` and
the **images** bucket.

## Spaced repetition & review

`progress` tracks a simplified SM-2 schedule per word_group
(`next_review_at`, `review_interval_days`, `ease_factor`,
`consecutive_correct`/`incorrect` — see `src/lib/spacedRepetition.ts`,
which is unit-tested in isolation from Supabase). Correct answers push the
next review further out; incorrect answers reset it to 1 day. The `/review`
screen (linked from a "Review time" card on Home whenever something is due)
pulls only strictly-due items, most-overdue first, and runs them through
the exact same session engine as a lesson — there's no separate progress
system for review.

## Speaking practice

Adult/teen track only. `src/components/exercises/adult/SpeakingPractice.tsx`
implements hear → record → play back → try again, with no automated
pronunciation scoring by design. Microphone permission is requested
contextually (only the first time this exercise type is reached, with an
explanation screen first) and a denial is handled gracefully — the learner
can still hear the word and continue the session.

## Favorites & word detail

Tap "See words" on any unit, or a favorited word from Settings, to reach a
word detail screen (`app/word/[wordGroupId].tsx`): full variant info,
progress, a one-word "Practice" drill, a favorite toggle, and an honest
`native_verified` badge (everything currently seeded shows "Draft — pending
native review," which is accurate).

## Talk to a Tunisian (AI conversation — Phase 1: text only)

Adult/teen track only — a kid profile never sees the entry point, and the
route itself refuses the feature if reached directly (`src/lib/ai/accessControl.ts`).
The learner picks a scenario + difficulty (`app/talk/index.tsx`) and has a
text conversation (`app/talk/[scenarioId].tsx`) grounded in the app's own
`word_groups`/`word_variants` — there's no second vocabulary source for the
AI. Audio playback and speech input (Phases 2/3 from the product brief) are
intentionally not built yet.

**Works out of the box with no AI provider configured** — it defaults to a
mock provider (`src/lib/ai/mockProvider.ts`) that returns real-shaped, scenario-
grounded responses with zero network calls. To connect a real provider:

1. Deploy the proxy Edge Function (holds the secret key — it never reaches
   the client):
   ```bash
   supabase functions deploy talk-to-a-tunisian
   supabase secrets set AI_API_KEY=sk-...
   ```
   `AI_MODEL` and `AI_BASE_URL` secrets are optional (default to
   `gpt-4o-mini` / `https://api.openai.com/v1` — any OpenAI-compatible chat
   completions endpoint works). **This function hasn't been exercised
   against a live key in this environment** — it's written carefully against
   the documented API shape, but treat it as reviewed-not-verified until you
   test it with real credentials.
2. Set `EXPO_PUBLIC_TALK_AI_MODE=live` in `.env` (this only picks which
   client-side wrapper to use — it carries no secret).

The AI's structured response is validated against a fixed shape
(`src/lib/ai/validateTutorResponse.ts`, hand-rolled — no new dependency) before
anything reaches the UI; a malformed response is treated as a failure with a
retry, never rendered as-is. Conversation history is in-memory only for now
— nothing is persisted (see the design-decisions note below on why).

## Project structure

```
app/                     Expo Router routes only (screens + navigation)
  word/[wordGroupId].tsx  word detail (variants, progress, favorite, practice)
  words/[lessonId].tsx    word list for a lesson
  favorites/, review.tsx  favorites list, review session
  talk/                   Talk to a Tunisian (scenario picker + conversation)
src/
  components/            UI components, grouped by feature
    exercises/
      kid/                listen-and-tap
      adult/              reading-match, typing-spelling, speaking
      shared/             exercise chrome shared by both tracks
    onboarding/, lesson-map/, session/, ui/
  data/                   Supabase queries + row->model mappers (data layer)
    talkContext.ts         scenario vocabulary + learner-context fetching for Talk to a Tunisian
  hooks/                  useSessionTimer, useExerciseQueue, useWordAudioPlayer, useConversation
  lib/
    auth/                 AuthContext (email/password now; built to add Google/Apple later)
    account/              ActiveProfileContext (which profile is active)
    onboarding/           OnboardingContext (wizard state across onboarding steps)
    notifications/        daily reminder scheduling
    offline/              audio download/cache for offline playback
    supabase/              client setup
    ai/                    AI provider abstraction (mock + Edge Function), prompt building,
                            response validation — see "Talk to a Tunisian" above
    spacedRepetition.ts, reviewSelection.ts, masteryStatus.ts,
    lessonCompletion.ts, age.ts, wordVariants.ts   pure, unit-tested business logic
  types/                  TypeScript models (models.ts) + raw DB row types (database.ts)
supabase/
  migrations/0001-0007_*.sql
  seed.sql
  functions/talk-to-a-tunisian/   Edge Function proxy (holds the AI secret server-side)
```

## Testing

```bash
npm test
```

Runs Jest (`jest-expo` preset) against `src/**/__tests__` — 91 tests across
12 suites, covering: spaced repetition, review-queue ordering, mastery
status, lesson lock/unlock/completion, age → track derivation (including a
real timezone bug these tests caught — see `parseIsoDateLocal` in
`src/lib/age.ts`), word-variant selection/answer-matching, and the Talk to a
Tunisian AI layer (scenario config, prompt building, response validation
including malformed-AI-output cases, the mock provider, word-help lookup,
and child/adult access control — all against the mock provider, never a
real AI call). No integration/E2E tests yet — everything above is
pure-function-level.

## Notes on the v1 design decisions

- **Talk to a Tunisian never touches `progress`/mastery.** A conversation
  practicing a word doesn't call `recordWordGroupResult` or affect its
  spaced-repetition schedule — only explicit exercises do that. Mixing an AI
  conversation's fuzzy notion of "practiced" into the existing mastery
  system would corrupt a signal the rest of the app relies on being
  precise. Conversation history itself is kept in memory only, not
  persisted, for the same "don't build more than the product needs yet"
  reasoning as everywhere else in this file — see `useConversation`'s
  docstring.
- **Progress model**: tracked per word_group (`progress` table), not per
  lesson — lesson lock/unlock/completion state is derived client-side
  (`src/data/content.ts`) from word_group-level progress, so a fuller
  dashboard can be built later without a schema change. Mastery is per
  *concept*, not per variant — answering with any variant of a group counts.
- **Consent**: recorded once per profile (`consent_records`), captured during
  that profile's onboarding, with `is_for_child` set explicitly when a parent
  is consenting on a child's behalf.
- **Speaking practice** (adult/teen only) is record-and-playback for
  self-comparison — no automated pronunciation scoring in v1, by design (see
  the product brief's rationale on this).
- **`is_premium`** exists on `profiles` now but is unused — monetization is
  out of scope for v1.
