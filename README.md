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

## Project structure

```
app/                     Expo Router routes only (screens + navigation)
src/
  components/            UI components, grouped by feature
    exercises/
      kid/                listen-and-tap
      adult/              reading-match, typing-spelling
      shared/             exercise chrome shared by both tracks
    onboarding/, lesson-map/, session/, ui/
  data/                   Supabase queries + row->model mappers (data layer)
  hooks/                  useSessionTimer, useExerciseQueue, useWordAudioPlayer
  lib/
    auth/                 AuthContext (email/password now; built to add Google/Apple later)
    account/              ActiveProfileContext (which profile is active)
    onboarding/           OnboardingContext (wizard state across onboarding steps)
    notifications/        daily reminder scheduling
    offline/              audio download/cache for offline playback
    supabase/              client setup
  types/                  TypeScript models (models.ts) + raw DB row types (database.ts)
supabase/
  migrations/0001_init.sql, 0002_profile_dob_country.sql, 0003_word_variants.sql
  seed.sql
```

## Notes on the v1 design decisions

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
