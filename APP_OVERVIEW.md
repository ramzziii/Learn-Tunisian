# Learn Tunisian — App Overview

This document is a complete snapshot of the app as it exists today: what it
is, why it's built the way it is, the full tech stack, and every feature
currently implemented. It's written to give an outside reader (human or AI)
enough context to reason about the product and suggest improvements without
needing to read the source code.

## 1. What this app is

Learn Tunisian is a mobile app for learning **Tunisian Arabic (Derja)** —
the spoken colloquial dialect, not Modern Standard Arabic. It's aimed at
being usable by an entire family from one account: an adult and their
children can each have their own profile, own progress, and an
age-appropriate experience, while sharing one underlying content library.

The explicit positioning is "Duolingo for Tunisian Arabic, but purpose-built
to avoid the specific problems that make people abandon language and kids
apps" (ads, guilt-based notifications, streak-loss anxiety, leaderboards,
dark-pattern paywalls, over-broad permissions, one blurry experience trying
to serve every age at once).

**Current development stance**: after the initial build-out, the deliberate
decision was made to *stop expanding scope* and instead make the existing
~50-concept vocabulary experience genuinely good — spaced repetition,
speaking practice, review, UI polish, richer progress, favorites — before
adding bigger features (sentences, conversations, family features, a
content-admin CMS, more units). Those bigger ideas are tracked as backlog,
not in progress. See Section 9.

### Design principles treated as hard requirements

- **No ads, ever.** No third-party ad SDKs, not even planned for a future
  paid tier.
- **No guilt-based notifications.** Exactly one daily reminder, always
  neutral/positive copy ("Time for your Tunisian lesson!") — never
  streak-loss language, never social comparison ("your friend is ahead of
  you").
- **No streak-loss-aversion mechanics or leaderboards.** Progress is
  celebrated, gaps are never punished, users are never ranked against each
  other.
- **Natural stopping points.** Every session ends at a positive completion
  screen with an explicit choice (Close / Add more time) — it never
  auto-advances into more content.
- **Genuine offline support.** Downloaded lesson audio works fully offline,
  not just "cached until evicted."
- **Minimal, contextual permissions.** Camera is never requested (not used
  anywhere). Microphone is only requested at the moment a 13+ profile first
  reaches a speaking exercise, with an explanation first, and is never
  requested for a kid profile. Notifications are requested at the point the
  user sets a reminder time, with a clear explanation.
- **No dark-pattern paywalls.** Not applicable yet (the app is fully free),
  but the data model is kept clean of any "locked content you already
  started" pattern for whenever monetization is considered.
- **Honest, narrow age targeting.** Rather than one experience trying to
  serve every age, there are two distinct tracks (see Section 5) chosen
  automatically by age, never manually toggled.
- **No compulsive-engagement optimization.** Spaced repetition and review
  exist to help retention, not to maximize time-in-app — no streaks, no
  "don't break the chain," review is opt-in-by-being-due, not forced.

## 2. Tech stack

| Layer | Choice |
|---|---|
| App framework | React Native via **Expo SDK 57**, TypeScript throughout |
| Navigation | **Expo Router** (file-based routing under `app/`) |
| Backend | **Supabase**: Postgres (schema + RLS), Auth (email/password), Storage (audio/images) |
| Audio playback & recording | **expo-audio** (the modern replacement for the deprecated expo-av) |
| Local notifications | **expo-notifications** |
| Offline audio caching | **expo-file-system**'s newer `File`/`Directory`/`Paths` API |
| Native date/time pickers | **@react-native-community/datetimepicker** (native iOS scroll wheel / Android dialog) |
| Gradients & visual polish | **expo-linear-gradient**; press-feedback and animations via React Native's core `Animated` API (no Reanimated) |
| Local session persistence | **@react-native-async-storage/async-storage** |
| Local state/data fetching | Plain React Context + hooks — no Redux/Zustand/React Query; deliberately lightweight for a solo-dev codebase |
| Testing | **Jest** (`jest-expo` preset) for pure business-logic unit tests; no integration/E2E tests yet |

**Why SDK 57 specifically (not necessarily the newest SDK):** Apple's App
Store build of Expo Go tracks one SDK at a time — whichever one is
currently on the App Store listing is the only one reachable without a
custom dev-client build or TestFlight. The project is pinned to match that
build (SDK 54 originally; moved to SDK 57 in 2026-09 when Expo Go's App
Store build moved on and stopped opening SDK 54 projects), since the whole
point of the current workflow is testing on a physical iPhone via the
ordinary App Store Expo Go app. See `AGENTS.md` for what that upgrade
involved and what to check before bumping again.

## 3. Data model (Postgres / Supabase)

Applied via `supabase/migrations/0001_init.sql` through `0006_content_verification.sql`,
in numeric order, plus `supabase/seed.sql` for content.

- **`accounts`** — one row per Supabase Auth user (auto-created by a
  trigger on signup). One account can hold multiple profiles.
- **`profiles`** — one per learner (adult or child) under an account: name,
  `date_of_birth`, `native_language`, `country`, `starting_proficiency`,
  optional `learning_goal`, a `track` (`kid`/`adult`) derived once from age
  at creation time, and an unused-for-now `is_premium` flag reserved for
  future monetization.
- **`daily_goal_settings`** — one-to-one with a profile: daily time goal
  (5/10/15 min), one daily reminder time, and whether the reminder is
  enabled. Editable anytime from that profile's settings.
- **`consent_records`** — one per profile, capturing when Terms &
  Privacy consent was given during that profile's onboarding, and whether
  the adult was consenting on a child's behalf (`is_for_child`).
- **`units`** → **`lessons`** — the coarse content structure (a lesson
  belongs to a unit and has a `lesson_number`). Lessons currently map
  1:1 with units (one lesson per unit) but the schema doesn't assume that.
- **`word_groups`** → **`word_variants`** — the fine-grained content model
  (see Section 4). `word_variants.native_verified` (boolean, default false)
  is a deliberately minimal content-quality signal — not a publishing
  pipeline, just an honest "has a native speaker checked this exact form"
  flag, surfaced as a badge on the word detail screen.
- **`progress`** — per-profile, per-word_group state: correct/incorrect
  counts, a status (`new`/`learning`/`known`), last-seen timestamp, **plus
  a spaced-repetition schedule** (`next_review_at`, `review_interval_days`,
  `ease_factor`, `consecutive_correct`, `consecutive_incorrect` — see
  Section 6). Mastery and review scheduling live on the same row; review
  isn't a separate progress system.
- **`favorites`** — `(profile_id, word_group_id)` pairs a learner has
  starred. References `word_groups` directly, no content duplication.

Every account-owned table has Row Level Security scoped to the signed-in
user; content tables (`units`/`lessons`/`word_groups`/`word_variants`) are
readable by any authenticated user, since the library is shared.

## 4. The word-variants content model

This is the most structurally distinctive part of the schema. A single
concept (e.g. "let's go", "I'm hungry") can be said more than one way —
either a synonym, or a masculine/feminine speaker-gender form — and both
cases are handled by **one mechanism** instead of two:

- **`word_groups`** — one row per concept (`id` is a readable slug like
  `"letsgo"`, not a generated UUID — deliberately, since a non-technical
  content admin will look at this table directly). Fields: `unit_id`,
  `lesson_number`, `english_meaning`, `image_keyword`/`image_path`.
- **`word_variants`** — one row per way of saying it. `variant_label` is
  one of `primary` / `also_heard` / `masculine` / `feminine`. A DB rule
  (enforced by a deferred trigger, not just app code) requires every group
  to have either exactly one `primary` variant, or both a `masculine` and
  a `feminine` variant — the latter case exists specifically so the app
  never has to ask the learner's gender.

App behavior built on top of this:

- Lessons teach/quiz the `primary` variant by default.
- A group with no primary (masculine+feminine only) **alternates** between
  the two as the quiz prompt from exercise to exercise, so neither form is
  favored over time.
- `also_heard` variants surface as a "you might also hear" callout next to
  the exercise — visible, but never the thing being quizzed.
- Gender pairs are always shown **together** ("if you're a boy... / if
  you're a girl...") whenever the concept appears, regardless of which one
  is the current quiz prompt.
- **Answer checking accepts any variant in the group as correct** — typing
  the `also_heard` form, or either gender form, all count.
- **Multiple-choice distractors always come from a different word_group**
  than the target — two variants of the same concept never compete against
  each other.
- This same `WordGroupWithVariants` shape now also powers the word detail
  screen, favorites, and review — it's the one unit of content the whole
  app reasons about, not just lessons.

## 5. The two tracks

Track is derived automatically from date of birth at profile-creation time
— never a manual toggle.

**Kid track (age ≤ 12):**
- Listen-and-tap exercises only (listen to audio, tap the matching
  picture). No reading or typing required to progress.
- Arabic script is shown alongside words for passive exposure, but never
  tested.
- No microphone permission is ever requested for a kid profile.
- Larger touch targets and simpler visuals (see `kidTrackSizing` in
  `src/constants/theme.ts`).

**Adult/teen track (age 13+):**
- Everything the kid track has, plus three exercise types, cycled through:
  - **Reading match** — hear a word, tap the matching written Arabic
    script.
  - **Typing/spelling** — hear a word and its English meaning, type the
    transliteration.
  - **Speaking practice** — hear the native word, record yourself saying
    it, play the recording back to compare. Microphone permission is
    requested only the first time this exercise type is reached (with an
    explanation screen first), and a denial is handled gracefully — the
    learner can still hear the word and continue.
    Automated pronunciation scoring (via the same `talk-stt`
    Whisper-backed function "Talk to a Tunisian" uses) only runs when a
    live AI provider is configured (`EXPO_PUBLIC_TALK_AI_MODE=live`); in
    mock mode — the default with no AI provider configured — this falls
    back to the original self-comparison-only behavior, so the exercise
    still works out of the box. Whisper has no dedicated Tunisian Derja
    mode, so its accuracy on spoken Derja specifically is unproven; when
    scoring is active the matching is deliberately lenient (fuzzy, and
    accepting any variant in the word group — also_heard, either gender
    form — same rule every other exercise type's answer-checking already
    follows) precisely to reduce false "wrong" results from that
    uncertainty. Up to 3 attempts; running out still counts as correct
    rather than penalizing mastery/spaced-repetition, since this is spoken
    self-practice, not a gate, and a miss here is as likely to be a
    recognition quirk as an actual mispronunciation. A technical failure to
    reach the STT service never blocks progress either.

Both tracks pull from the same underlying `word_groups`/`word_variants`
data — the adult track just unlocks more exercise *types* against the same
content.

## 6. Full feature inventory (what's actually built)

**Auth**
- Email/password sign-up and sign-in via Supabase Auth.
- Sign-up detects whether email confirmation is required (Supabase returns
  no session in that case) and shows an explicit "check your email" screen.
- Auth is structured so Google/Apple sign-in can be added later as sibling
  methods without restructuring anything that already consumes the session.
- Sign-out is reachable from Settings (always accessible via Home's gear
  icon) and from the profile switcher, both behind a confirmation dialog.

**Onboarding** (`app/onboarding/*`)
1. Welcome + "who is this for" (myself / my child).
2. Terms & Privacy consent, with explicit "you're agreeing on your child's
   behalf" copy when applicable.
3. Profile setup: name, date of birth (native wheel-style date picker),
   native language and country (type-to-search-or-pick autocomplete),
   starting proficiency, optional learning goal.
4. Daily goal setup: 5/10/15-minute daily goal, one daily reminder time
   picked with a native scrolling wheel (same style as iOS
   Reminders/Clock).
5. On finish: creates the profile, consent record, and daily goal settings,
   requests notification permission, schedules the reminder.

Every onboarding step (and sign-in/sign-up) has a back button that
auto-hides when there's nowhere meaningful to go back to.

**Profiles**
- One account can hold multiple profiles; a switcher lists them and lets
  you add another. The active profile persists across app restarts.

**Alphabet practice** (`app/alphabet*.tsx`, `src/lib/alphabet.ts`,
`src/components/alphabet/`)
- A separate, bite-sized (count-based, not time-based) practice mode
  alongside the main vocabulary engine, covering the 27-letter Arabic
  alphabet plus the three short vowel diacritics (fatha/damma/kasra).
- `/alphabet` — the library hub: overall progress %, three quick-link cards
  (Flashcards, Speed Match, Diacritics), a grid of every letter (tapping one
  opens a detail modal), and a "Learn the letters" entry point.
- Letter detail modal: audio (on-device TTS, no Supabase content needed for
  this); the letter's four contextual forms (shown Final/Medial/Initial/
  Isolated, non-interactive — derived by padding with U+0640 tatweel so the
  platform's own Arabic text shaper draws the correct connected glyphs
  instead of hardcoded presentation-form codepoints); and, in the same
  order, one real example word *per position* (`ArabicLetter.positionExamples`)
  showing the letter actually occurring there — e.g. for ب: بيت (initial),
  كبير (medial), باب (final), plus بِ ("with/by") for isolated. initial/medial
  are `null` for the 6 non-connecting letters (dal/dhal/ra/zay/waw, and alif
  which isn't quizzed here) since they only ever connect from the letter
  before them, never to the one after, so those two shapes don't occur in
  real Arabic — the UI skips those rows rather than fabricating an example.
  isolated uses a genuine single-letter word/prefix (و "and", ف "so", ب
  "with", ل "for", ك "as") for the letters that have one, and a "standing
  alone" placeholder otherwise. Every position example is verified by a unit
  test to actually start/end/contain the target letter as claimed.
- `/alphabet-diacritics` — pick any letter from a grid of all 27, then see
  it vocalized with each of the three short vowels (e.g. ب → "Baa"/"Boo"/
  "Bee"), each tappable to hear it, alongside one example word per vowel.
  The friendly phonetic reading is derived from the letter's own
  transliteration (`buildVocalizedReading`) rather than authored per letter,
  so it stays consistent; only the 81 example words (27 letters × 3 vowels)
  are hand-authored (`ArabicLetter.vowelExamples`).
- `/alphabet-practice` — a fixed-length (8-question) round cycling four
  exercise kinds: true/false listening, listen-and-choose (pick the letter
  that was spoken), choose-the-sound (pick the audio that matches a shown
  letter), and sound-match (text-only, no audio — "Choose the letter which
  is similar to (Ba) as in (Bank)", matching an English phonetic cue to the
  Arabic letter vocalized with a fatha). Sound-match's distractors are drawn
  from `similarShapeGroup` — letters that share a base glyph and differ only
  in dot count/placement (ب/ت/ث/ن/ي, ج/ح/خ, etc.), the classic beginner
  mix-up set, rather than random letters. Ends with a "you have some
  mistakes" screen offering Review Mistakes (re-drills just the missed
  letters) or Skip.
- `/alphabet-matching` — a timed pair-matching game (glyph ↔ name) over a
  random subset of letters.
- `/alphabet-flashcards` — a simple browse-and-listen flashcard flow.
- Every exercise kind shares `AlphabetExerciseFooter` for the Check → feedback
  → Next flow, which is also where the correct/incorrect sound + haptic
  fire from (`src/hooks/useAnswerFeedback.ts` — two short WAV chimes
  synthesized locally rather than sourced from an external sound library,
  paired with `expo-haptics`). Answer cards bounce or gently shake via
  `AnimatedAnswerCard`, and question-to-question transitions crossfade via
  the same `useFadeInOnChange` hook the main lesson engine uses.
- Progress (`src/lib/alphabetProgress.ts`) is deliberately local-only
  (AsyncStorage, per profile id) — a lightweight "has this letter been
  practiced" signal for the library screen, not Supabase-backed mastery
  tracking like `progress` gets. No streak or score mechanic was added here,
  consistent with Section 1's no-streak-loss-aversion principle; a "Days in
  a Row" style streak calendar was considered and explicitly declined.

**Home / lesson map** (`app/home.tsx`)
- Gradient header, units rendered as sections, each lesson a node showing
  locked / unlocked / completed state with gradient fills and press
  feedback.
- A "Review time" card appears whenever something is due (see below),
  showing the exact due count.
- A "See words" link per unit opens that lesson's word list.
- Handles a failed data load with a retry-able error state rather than a
  silent blank screen.

**Session / exercise engine** (`src/components/session/SessionRunner.tsx`,
`useSessionTimer`, `useExerciseQueue`)
- **Time-based, not count-based**: runs exercises until the profile's
  daily time goal elapses (wall-clock time, survives backgrounding).
- The exercise queue endlessly reshuffles so a session never runs out of
  material.
- Every exercise records a win/loss against `progress`, which also
  advances that word_group's spaced-repetition schedule.
- **This exact engine is shared between lesson sessions and review
  sessions** (`app/lesson/[lessonId].tsx` and `app/review.tsx` both just
  feed it a different list of word_groups) — review was built as a second
  *use* of the same system, not a second system.
- Session-complete screen: animated pop-in, gradient celebration badge,
  then exactly two choices — Close or Add more time (5/10/15 again).

**Spaced repetition & review**
- `src/lib/spacedRepetition.ts`: a pure, unit-tested (10 tests) simplified
  SM-2. Correct answers: interval progresses 1 day → 6 days → (previous ×
  ease factor), ease factor nudges up (capped at 3.0). Incorrect answers
  ("lapses"): interval resets to 1 day, ease factor nudges down (floored
  at 1.3).
- `/review`: pulls only strictly-due word_groups (not padded out with
  not-yet-due content), ordered most-overdue first, then most-recently-
  incorrect, then lowest mastery. Empty state ("All caught up") is a
  genuine positive state, not a fallback.
- A due-count badge drives the Home screen's review entry point.

**Favorites & word detail**
- `favorites` table, a star toggle on the word detail screen, and a
  dedicated `/favorites` list (reachable from Settings).
- `app/word/[wordGroupId].tsx`: Arabic script, transliteration, English
  meaning, audio playback, the full variant picture (also_heard/gender
  pairs via the same `VariantCallout` used in exercises), this profile's
  progress on that concept, a favorite toggle, a `native_verified` badge,
  and a one-word "Practice" drill (generates a single on-the-fly exercise
  using other word_groups from the same lesson as distractors, then
  records the result through the normal progress path).
- `app/words/[lessonId].tsx`: the list of words in a lesson, each row
  showing whether it's favorited, tapping into word detail.

**Progress (Settings)**
- Five at-a-glance stats: words learning, mastered, reviewed (seen more
  than once), total words seen, and lessons completed — no streak number
  anywhere. `countCompletedLessons` reuses the lesson-map's own completion
  logic rather than duplicating it.

**Notifications** (`src/lib/notifications/reminders.ts`)
- Exactly one local daily notification per profile, `DAILY` trigger type
  (not `CALENDAR` + `repeats`, which doesn't reliably repeat on Android).
- Copy is neutral/positive; rescheduling cancels and re-creates rather than
  accumulating duplicates.

**Offline audio** (`src/lib/offline/audioCache.ts`)
- Every variant's audio downloads to a local cache the first time it's
  needed (or is prefetched for a whole session), so playback works
  offline once fetched.
- Distinguishes "genuinely no audio exists yet" (disables the play button
  honestly) from "download hiccup but the file is reachable" (falls back
  to streaming) via a HEAD request.
- `setAudioModeAsync({ playsInSilentMode: true })` at startup, since iOS
  otherwise silently mutes app audio when the phone's mute switch is on.

**Visual design**
- A small design system (`src/constants/theme.ts`): gradient pairs, shadow
  presets, a `PressableScale` press-feedback wrapper used across buttons,
  lesson nodes, and cards instead of a flat opacity change.
- Animated, gradient-filled progress bar; animated session-complete
  celebration; gradient lesson nodes and Home header.

**Content pipeline**
- Content lives entirely in Supabase, never hardcoded.
- `scripts/generate-placeholder-audio.sh` produces placeholder audio for
  every `word_variant` using macOS's built-in Arabic TTS voice, so the
  audio pipeline can be exercised end-to-end before real recordings exist.

## 7. Current content status

The content currently seeded (`supabase/seed.sql`) is **explicitly a
draft, not launch content**:

- 5 units: Daily Phrases, Colors, Animals, Food, Body Parts (50 word_groups,
  55 word_variants). Daily Phrases is sorted first specifically so its
  lesson — which exercises all three variant cases — is reachable without
  finishing the others first.
- Roughly half the source rows (plus all 4 feminine daily-phrase forms)
  are flagged uncertain, pending native-speaker review.
- Audio is TTS-generated **Modern Standard Arabic**, not authentic
  Tunisian dialect pronunciation.
- Every `word_variant.native_verified` is `false` — the app's own word
  detail screen shows this honestly ("Draft — pending native review")
  rather than presenting draft content as finished.

## 8. Known gaps / explicitly not built

- **Real, native-speaker-verified content and authentic audio.** Everything
  currently loaded is draft/placeholder text and TTS audio — this is the
  single biggest gap between the current app and something launchable.
- **Social sign-in** (Google/Apple) — the auth layer is structured for it,
  not implemented.
- **Monetization** — out of scope by design; `is_premium` exists on
  `profiles` but is inert.
- **Test coverage beyond spaced repetition.** `src/lib/spacedRepetition.ts`
  has real unit tests; nothing else does yet (exercise selection, answer
  matching, age/track calculation, review-queue priority, and all
  data/integration paths are untested).
- **No admin/content-management UI.** Content edits are still direct SQL
  against `seed.sql` — appropriate for ~50 draft concepts, not for scaling
  content or handing curation to a non-technical native speaker.
- **Physical-device visual verification loop.** Xcode isn't installed in
  this development environment, so UI/animation changes (including the
  whole visual-polish pass in Section 6) have been verified via TypeScript
  compilation and Metro bundle checks, not by eye on a simulator —
  verification on a physical device has depended on the app owner testing
  via Expo Go.

## 9. Explicit backlog (deliberately deferred, not forgotten)

Agreed to hold these until the current ~50-concept experience has been used
and tested, so the backlog gets reprioritized by actual usage rather than
built upfront:

- Full content admin CMS, publishing workflow, content status pipeline
  (draft/verified/published, reviewer tracking).
- Sentence and conversation exercises; a dictionary/search screen.
- Large curriculum expansion (the draft plan sketches ~19 units).
- Family collaborative goals, parent-teaching mode, family conversation
  mode, real-world missions.
- Large analytics/event-tracking infrastructure.
- Achievement/badge systems beyond the existing non-streak celebration.
- Advanced offline content sync (beyond the existing per-session audio
  caching).

## 10. Repo structure (for reference)

```
app/                        Expo Router routes only (screens + navigation)
  word/[wordGroupId].tsx     word detail (variants, progress, favorite, practice)
  words/[lessonId].tsx       word list for a lesson
  favorites/index.tsx        favorited words
  review.tsx                 review session (same engine as a lesson)
src/
  components/
    exercises/kid/            listen-and-tap
    exercises/adult/          reading-match, typing-spelling, speaking
    exercises/shared/          VariantCallout, WordPicture, AnswerFeedback, ExerciseRenderer
    session/                   SessionRunner (shared by lesson + review), SessionCompleteCard
    onboarding/, lesson-map/, ui/
  data/                       Supabase queries + row->model mappers
  hooks/                      useSessionTimer, useExerciseQueue, useWordAudioPlayer
  lib/
    auth/, account/, onboarding/, notifications/, offline/, supabase/
    age.ts, wordVariants.ts, spacedRepetition.ts   pure business-logic helpers
    __tests__/                 Jest unit tests
  types/                       TypeScript models (models.ts) + raw DB row types (database.ts)
supabase/
  migrations/                 0001_init.sql through 0006_content_verification.sql
  seed.sql
scripts/
  generate-placeholder-audio.sh
```
