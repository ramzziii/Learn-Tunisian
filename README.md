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
   8. [`0008_talk_rag_content.sql`](supabase/migrations/0008_talk_rag_content.sql) — enables `pgvector` and adds `phrases`/`sentences`/`conversation_examples`/`corrections`/`ai_usage_log`, for RAG-grounded conversation (see "RAG grounding" below).
3. Then run [`supabase/seed.sql`](supabase/seed.sql) — loads the current content set into `word_groups`/`word_variants` (see "Word variants"). Optionally also run `scripts/seed-talk-rag-content.mjs` (see "RAG grounding" below) once you have an OpenAI key.
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

## Talk to a Tunisian (AI conversation, voice-first)

Adult/teen track only — a kid profile never sees the entry point, and the
route itself refuses the feature if reached directly (`src/lib/ai/accessControl.ts`).

The learner's level (beginner/intermediate/advanced) is derived automatically
from their existing progress (`src/lib/talkLevel.ts` — words mastered and
lessons completed, no separate manual rating) and gates which scenarios are
unlocked in the picker (`app/talk/index.tsx`); the conversation itself
(`app/talk/[scenarioId].tsx`) is grounded in the app's own
`word_groups`/`word_variants` — there's no second vocabulary source for the AI.

The conversation is spoken, not typed: the tutor's replies are read aloud as
they arrive, and the learner records their reply with the mic — typing stays
available as a fallback at all times. Voice input needs a real network call
(speech-to-text) every time, so it's only offered in live mode; mock mode
speaks the tutor's side with the on-device `expo-speech` engine and offers
typing only, keeping it fully offline like the rest of the mock provider.

**Works out of the box with no AI provider configured** — it defaults to a
mock provider (`src/lib/ai/mockProvider.ts`) that returns real-shaped, scenario-
grounded responses with zero network calls. To connect a real provider:

1. Deploy the four proxy Edge Functions (each holds the secret key — it
   never reaches the client):
   ```bash
   supabase functions deploy talk-to-a-tunisian
   supabase functions deploy talk-tts
   supabase functions deploy talk-stt
   supabase functions deploy talk-review
   supabase secrets set AI_API_KEY=sk-...
   ```
   `AI_MODEL`/`AI_BASE_URL` (chat), `AI_TTS_MODEL`/`AI_TTS_VOICE` (text-to-speech,
   default `tts-1`/`alloy`), `AI_STT_MODEL`/`AI_STT_LANGUAGE` (speech-to-text,
   default `whisper-1`/`ar`), and `AI_EMBEDDING_MODEL` (RAG retrieval, default
   `text-embedding-3-small`) are all optional and reuse the same `AI_API_KEY`.
   All four are verified working end-to-end against a live key (confirmed via
   direct curl — including a full TTS→STT round trip, and a `talk-review`
   embed+insert round trip against a real authenticated session). `AI_STT_LANGUAGE`
   pins Whisper's language rather than letting it auto-detect — without it, a
   short/ambiguous clip can get transcribed in a completely unrelated script
   (Hebrew and Korean have both been observed). Whisper still has no dedicated
   Tunisian Derja mode, so it transcribes into standard Arabic script rather
   than genuinely understanding the dialect — accuracy on spoken Derja is an
   open question beyond "wrong script."

   **If OpenAI returns `403 ... does not have access to model`** even for a
   model you can see is allowed in your project's dashboard: this project
   restriction feature has a known, long-standing OpenAI-side bug where the
   UI doesn't reliably reflect what's actually enforced (see
   [community reports](https://community.openai.com/t/api-project-limits-bug-can-not-allow-retrieve-models-for-project/936668)).
   Removing the restriction entirely (rather than trying to get the allow-list
   itself to work) can still leave the project in a flaky, intermittently-failing
   state — the reliable fix is a fresh OpenAI project that's never had a model
   restriction touched, with its own `AI_API_KEY`.
2. Set `EXPO_PUBLIC_TALK_AI_MODE=live` in `.env` (this only picks which
   client-side wrapper to use — it carries no secret).

The AI's structured response is validated against a fixed shape
(`src/lib/ai/validateTutorResponse.ts`, hand-rolled — no new dependency) before
anything reaches the UI; a malformed response is treated as a failure with a
retry, never rendered as-is. Conversation history is in-memory only for now
— nothing is persisted, and a recorded voice reply is deleted immediately
after transcription (see the design-decisions note below on why).

### RAG grounding

`word_groups`/`word_variants` vocabulary is real grounding, but it's a word
list, not example phrases, full sentences, or verified exchanges. In live
mode, `talk-to-a-tunisian` additionally retrieves the most relevant
native-speaker-verified examples for whatever the learner just said (or, for
the tutor's opening line, what the scenario is about) and adds them to the
prompt as the model's primary source of truth — on top of the vocabulary
grounding, not instead of it.

- **Content**: `phrases` (short common phrases), `sentences` (fuller
  examples, optionally tied to a `word_group`), `conversation_examples`
  (short verified exchanges per scenario) — see
  `supabase/migrations/0008_talk_rag_content.sql`. Every row has
  `native_verified`/`native_reviewer`, same principle as `word_variants`:
  **only verified rows are ever retrievable** (enforced twice — in the
  `match_verified_content()` function's own filter, and again in RLS).
- **Retrieval**: the learner's message (or the opening-line fallback) gets
  embedded (`text-embedding-3-small`) and matched against those three tables
  via `pgvector` cosine similarity (`match_verified_content`, `extensions.vector`).
  This has to happen server-side — embedding requires the same secret API
  key — which is why `talk-to-a-tunisian` is no longer a pure "thin proxy"
  the way `talk-tts`/`talk-stt` still are; see the comment at the top of that
  function for why this is a deliberate, narrow exception.
- **Reviewer workflow**: every AI-generated turn gets logged as a pending
  candidate in `corrections`. `app/admin/corrections.tsx` — reachable only by
  its direct route, not linked from Settings/Home nav, no new auth/role
  system for now (a deliberate scope choice for this single-household app;
  revisit if that ever changes) — lists pending turns, and either
  ("✅ Correct as shown") promotes the AI's text as-is or ("❌ Save
  correction") promotes an edited version, via the `talk-review` Edge
  Function (embeds the final text, inserts into `phrases`/`sentences` with
  `native_verified: true`). This is how the verified corpus grows from real
  usage, not just manual seeding.
- **Seed content**: `scripts/seed-talk-rag-content.mjs` inserts ~8 rows
  spanning the existing scenarios so retrieval has something to find while
  testing. **Deliberately inserted as `native_verified: false`** — this
  content is AI-drafted, not checked by a native Tunisian speaker, and
  marking it verified would be exactly the misrepresentation the whole
  `native_verified` system exists to prevent. Review it yourself and flip
  specific rows via direct SQL/the Supabase table editor (not through the
  corrections screen — that only reviews AI *conversation* turns, not these
  seed rows) once you're comfortable with them:
  ```bash
  OPENAI_API_KEY=sk-... SUPABASE_URL=https://your-project-ref.supabase.co \
    SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-talk-rag-content.mjs
  ```
  Needs the service-role key specifically (Project Settings → API) since it
  writes content before any user session exists — never put these values in
  `.env`/`EXPO_PUBLIC_*`.
- **Cost controls**: a 20-conversation-turn/profile/day cap (UTC calendar
  day), checked before any paid call — the client surfaces a
  `daily_limit_reached` error with its own copy, not the generic rate-limit
  message. Every chat and embedding call logs its token usage to
  `ai_usage_log` (`profile_id`, `call_type`, `model`, token counts) — no
  dashboard for it yet, query the table directly to see actual spend.

## Project structure

```
app/                     Expo Router routes only (screens + navigation)
  word/[wordGroupId].tsx  word detail (variants, progress, favorite, practice)
  words/[lessonId].tsx    word list for a lesson
  favorites/, review.tsx  favorites list, review session
  talk/                   Talk to a Tunisian (scenario picker + conversation)
  admin/corrections.tsx   native-reviewer correction queue (unlinked route)
src/
  components/            UI components, grouped by feature
    exercises/
      kid/                listen-and-tap
      adult/              reading-match, typing-spelling, speaking
      shared/             exercise chrome shared by both tracks
    onboarding/, lesson-map/, session/, ui/
  data/                   Supabase queries + row->model mappers (data layer)
    talkContext.ts         scenario vocabulary, learner-context, and level fetching for Talk to a Tunisian
    corrections.ts          pending corrections + submitting a review decision
  hooks/                  useSessionTimer, useExerciseQueue, useWordAudioPlayer, useConversation,
                          useTutorSpeech (AI voice), useVoiceRecorder (learner mic input)
  lib/
    auth/                 AuthContext (email/password now; built to add Google/Apple later)
    account/              ActiveProfileContext (which profile is active)
    onboarding/           OnboardingContext (wizard state across onboarding steps)
    notifications/        daily reminder scheduling
    offline/              audio download/cache for offline playback
    supabase/              client setup
    ai/                    AI provider abstraction (mock + Edge Function), prompt building,
                            response validation, binary (TTS/STT) function calls —
                            see "Talk to a Tunisian" above
    talkLevel.ts           pure beginner/intermediate/advanced level calculation
    spacedRepetition.ts, reviewSelection.ts, masteryStatus.ts,
    lessonCompletion.ts, age.ts, wordVariants.ts   pure, unit-tested business logic
  types/                  TypeScript models (models.ts) + raw DB row types (database.ts)
supabase/
  migrations/0001-0008_*.sql
  seed.sql
  functions/talk-to-a-tunisian/   Edge Function: chat + RAG retrieval + daily cap + corrections logging
  functions/talk-tts/             Edge Function proxy: text-to-speech
  functions/talk-stt/             Edge Function proxy: speech-to-text
  functions/talk-review/          Edge Function: reviewer's approve/reject-with-correction promotion
scripts/
  seed-talk-rag-content.mjs   one-off: seeds draft RAG content with real embeddings (see "RAG grounding")
```

## Testing

```bash
npm test
```

Runs Jest (`jest-expo` preset) against `src/**/__tests__` — 102 tests across
13 suites, covering: spaced repetition, review-queue ordering, mastery
status, lesson lock/unlock/completion, age → track derivation (including a
real timezone bug these tests caught — see `parseIsoDateLocal` in
`src/lib/age.ts`), word-variant selection/answer-matching, talk-level
calculation, and the Talk to a Tunisian AI layer (scenario config including
per-scenario level gating, prompt building across all three levels, response
validation including malformed-AI-output cases, the mock provider, word-help
lookup, and child/adult access control — all against the mock provider,
never a real AI call). No integration/E2E tests yet, and nothing exercises
real audio recording/playback or the two new binary Edge Functions
(talk-tts/talk-stt) — everything above is pure-function-level.

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
