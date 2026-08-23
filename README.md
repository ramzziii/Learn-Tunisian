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
2. In the SQL editor, run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) — this creates every table, RLS policy, and the two storage buckets (`audio`, `images`).
3. Then run [`supabase/seed.sql`](supabase/seed.sql) — this inserts the 3 starter units (Greetings, Family, Numbers) with placeholder words, matching `tunisian_arabic_SAMPLE_placeholder_data.xlsx`.
4. In Project Settings → API, copy the **Project URL** and **anon public key**.

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

## Adding real content

Replace the placeholder rows in `supabase/seed.sql` with real data from
`tunisian_arabic_lesson_content_template.xlsx` (same `unit` /
`lesson_number` / word shape), then:

1. Re-run the updated `seed.sql` in the Supabase SQL editor.
2. Upload the matching audio files to the **audio** storage bucket, using the
   exact paths referenced in `words.audio_path` (e.g. `greetings/ahla.mp3`).
   Once uploaded, playback starts working immediately — no code changes
   needed, since the app resolves audio by path at read time and only falls
   back to the placeholder-emoji picture / silent-play-button state when a
   file isn't there yet.
3. Images work the same way once you're ready: set `words.image_path` and
   upload to the **images** bucket.

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
  migrations/0001_init.sql
  seed.sql
```

## Notes on the v1 design decisions

- **Progress model**: tracked per word (`progress` table), not per lesson —
  lesson lock/unlock/completion state is derived client-side
  (`src/data/content.ts`) from word-level progress, so a fuller dashboard can
  be built later without a schema change.
- **Consent**: recorded once per profile (`consent_records`), captured during
  that profile's onboarding, with `is_for_child` set explicitly when a parent
  is consenting on a child's behalf.
- **Speaking practice** (adult/teen only) is record-and-playback for
  self-comparison — no automated pronunciation scoring in v1, by design (see
  the product brief's rationale on this).
- **`is_premium`** exists on `profiles` now but is unused — monetization is
  out of scope for v1.
