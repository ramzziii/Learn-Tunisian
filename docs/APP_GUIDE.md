# Learn Tunisian — App Guide

A complete description of what the app does today, how it is structured and
navigated, and where it stands. Written so that someone new to the project
(a person or an AI reviewer) can understand the whole product and give
informed recommendations without running it.

Last updated: 2026-10-31. Where this guide and the code disagree, the code
wins; the deeper per-topic docs are linked at the end.

---

## 1. What the app is

**Learn Tunisian** is a mobile app (iOS/Android, plus a web build) that teaches
**spoken Tunisian Arabic (Derja)** — the everyday language of Tunisia — rather
than Modern Standard Arabic. It is for **adults (18+)**, with **one learner
profile per account**.

Core idea: short daily sessions (5, 10 or 15 minutes) of lessons, practice
and review, with spaced repetition deciding what comes back and when. A calm
tone by design: no ads, no penalties, no lives/hearts, no leaderboards, no
streak-loss warnings.

### Current status (honest snapshot)

| Area | State |
|---|---|
| App features | Broad and working: curriculum, exercises, review, flashcard quiz, phrasebook, alphabet, grammar, culture, listening/speaking practice, AI conversation, translation requests, admin tools |
| Learning content | **Draft.** ~5 curriculum units / ~50 words plus 10 phrasebook categories, AI-drafted and **not native-speaker verified**. Seeded audio is placeholder text-to-speech in Modern Standard Arabic, not Tunisian — labelled "Computer voice", played only on tap, never in listening or pronunciation exercises. A bulk pipeline (import → native review → recording sheet → audio upload) grows it toward 300–500 verified words: [content-pipeline.md](content-pipeline.md), [content-plan.md](content-plan.md) |
| AI conversation (Talk) | Runs in **mock mode** unless the owner deploys the Edge Functions with an AI key and sets `EXPO_PUBLIC_TALK_AI_MODE=live` |
| Access | **Guest preview** (no account, device only), **Free** (a few items per feature) and **Premium** — see [access-and-guest-preview.md](access-and-guest-preview.md) |
| Payments | **None.** Premium exists in the code but nothing can be bought; the Plans screen is a preview |
| Legal | Terms/Privacy text on the consent screen is a **placeholder** — a release blocker |
| Store listing | Draft in [store-listing.md](store-listing.md) with a claims audit and owner checklist |

---

## 2. Tech stack

- **Expo SDK 58** (expo 58.0.x, expo-router 58), **React Native 0.88**, **React 19.3**, TypeScript (strict).
- **expo-router** file-based navigation with typed routes.
- **Supabase**: Postgres with row-level security (RLS), Auth (email + password), Storage (audio), Edge Functions (Deno) for AI and account deletion.
- Audio: `expo-audio` (playback/recording), `expo-file-system` (offline audio cache), `expo-speech` (device voice, used only in a few places).
- `expo-notifications` for the single optional daily reminder.
- Tests: Jest (jest-expo, React Native Testing Library v14) — ~140 test files, ~1,380 tests; database tests with PGlite (`npm run test:db`).
- CI (GitHub Actions): typecheck → Jest → web export → expo-doctor (advisory).

---

## 3. Navigation structure

### 3.1 Route map

```
/                         app/index.tsx — redirect only (see 3.2)
/welcome                  Welcome (signed out): "Try a free lesson" / "Create account / Sign in"
/why-tunisian             "Why Tunisian, not MSA?" explainer

/guest/age                Guest preview: "Are you 18 or older?" (yes / no, no date of birth)
/guest/create-account     Create-account explanation (nudge, limits, account-only places)
/guest/carry-over         After sign-up: bring the preview's progress over (if any)

/onboarding/age           1. Date-of-birth age gate (before an account exists)
/auth/sign-up             2. Create account (email + password)
/auth/sign-in, /auth/forgot-password, /auth/reset-code, /auth/reset-password
/onboarding/consent       3. Terms & Privacy consent
/onboarding/profile       4. Name (+ DOB shown read-only)
/onboarding/preferences   5. Mother tongue, country, level, learning goal, form preference
/onboarding/goal          6. Daily goal: 5 / 10 / 15 minutes
/onboarding/reminder      7. Optional daily reminder → creates the profile → /home
/onboarding/plans         Premium pricing preview (reachable from Profile; not a step)
/profiles                 One-time chooser for legacy accounts with several profiles

(tabs) — bottom tab bar, the app's spine
  /home                   Home
  /learn                  Learn (curriculum)
  /practice               Practice hub
  /talk                   Talk (AI conversation scenarios)
  /profile                Profile & settings

Pushed full-screen on top of the tabs
  /todays-practice        Today's Practice (guided session from Home)
  /lesson/[lessonId]      Lesson session
  /words/[lessonId]       Word list for a lesson
  /word/[wordGroupId]     Word detail
  /review                 Spaced-repetition review session
  /flashcards             Flashcard decks
  /flashcards/[deckId]    Flashcard quiz session
  /phrasebook             Phrasebook categories (+ link to phrase cards)
  /phrasebook/[categoryId]  Phrases in a category
  /phrasebook/flashcards  Browse-and-listen phrase cards
  /grammar                Grammar notes
  /listening-practice     Listening quiz
  /speaking               Chooser: Practice words / Repeat after me
  /speaking-practice      Speaking drill
  /repeat-after-me        Repeat native recordings
  /alphabet               Alphabet hub
  /alphabet-practice, /alphabet-flashcards, /alphabet-matching, /alphabet-diacritics
  /culture                Culture Corner (proverbs)
  /favorites              Saved words
  /search                 Dictionary / Search (from the search bar on Learn)
  /translation-requests   Ask for a translation
  /talk/[scenarioId]      AI conversation
  /account/delete         Delete account

/admin/...                Admin tools (admins only; see §9)
```

Every screen outside the tab group is pushed as a full-screen stack screen
(slide from right, swipe back on iOS). Headers are hidden; screens draw their
own back/close buttons.

### 3.2 Where the app sends you on launch (`app/index.tsx`)

1. Auth still loading → spinner.
2. Not signed in → **/home** in guest mode (after "Try a free lesson"),
   otherwise **/welcome**.
3. Signed in, no profile yet → **/onboarding/consent** (continue setup).
4. Several legacy profiles, none chosen → **/profiles**.
5. Otherwise → **/home**.

The onboarding layout also sends an account that already has a profile back
to the app, so a second profile can't be created (the database enforces one
per account too).

### 3.3 Signup / onboarding flow

Welcome → **age gate** → **sign up** → **consent** → **profile** →
**preferences** → **daily goal** → **reminder** → Home. Progress dots show
"Step N of 6": age gate 1, consent 2, profile 3, preferences 4, goal 5,
reminder 6 (sign-up itself has no dots).

- **Age gate**: date of birth typed as MM / DD / YYYY (numeric fields,
  auto-advance, validation of real/future dates). Under 18 → an adults-only
  message; the date is not stored, logged or sent, and no account is made.
  The device then blocks retrying for 24 hours, storing only a yes/no flag
  and its expiry (the guest "Are you 18 or older?" question does the same).
- After the reminder step, a device holding guest-preview data goes to
  **/guest/carry-over** before Home (see
  [access-and-guest-preview.md](access-and-guest-preview.md)).
- **Daily goal**: "How much time do you want to commit to learning Tunisian
  each day?" — 5, 10 (default) or 15 minutes. A target, not a limit.
- **Reminder**: optional. Notification permission is requested only if the
  learner taps "Set reminder"; "Not now" skips it. A denied permission is
  explained and signup still finishes.
- The profile, consent record and goal settings are written only at the last
  step.

### 3.4 Providers wrapping every screen (`app/_layout.tsx`)

Theme → Auth → Guest → Admin → Active profile → Display preferences →
Premium → Access (tier and used-item counts) → Onboarding draft state. The
active profile's `is_premium` is re-read when the app returns to the
foreground.

---

## 4. The tabs

The tabs answer two questions: **"What should I learn next?"** (Home's one
action, and Learn) and **"How do I practise?"** (Practice).

### Home (`/home`)
Deliberately minimal:
1. Greeting and today's minutes toward the daily goal.
2. **One primary action: Start today's practice** (→ `/todays-practice`). It
   also works for a brand-new learner, using the first lesson's words.
3. Only when words are due: a quiet secondary link, **"N words due"** →
   Review.

A guest sees no goal card: one action, **Try lesson 1**, and a quiet "Create
a free account" link.

(Removed from Home: the daily-challenges checklist, the quick-action row, the
"recommended next" card and the 🔥 day count. Challenge flags are still
recorded by Review and Speaking Practice, and the day-count calculation
still exists, but nothing displays them now.)

### Learn (`/learn`)
A search bar at the top opens **Dictionary / Search** (§6.12).
The curriculum map: units → lessons, each lesson **completed / unlocked /
locked**. Lessons unlock **sequentially**: a lesson is completed when every
word in it has been answered correctly at least once, which unlocks the next.
Progress teasers (words learning / mastered). Each lesson can be started or
its word list browsed. A lesson with no approved words yet (e.g. freshly
imported drafts) is hidden, and so is a unit with no visible lessons — they
never block the lessons after them.

- **Start here** (only before any lesson is completed): an Alphabet card at
  the top.
- **Explore Tunisian** (below the curriculum): Alphabet, Phrasebook, Grammar
  Notes, Culture Corner and **Ask for a translation** (with a "your
  translation is ready" notice when an answer has arrived).

### Practice (`/practice`)
Three groups:
- **Review & remember**: Review, Flashcards.
- **Listen**: Listening Practice.
- **Speak**: Speaking Practice (opens the chooser: Practice words / Repeat
  after me).

### Talk (`/talk`)
"Talk to a Tunisian": 5 conversation scenarios (At a Café, At the Market,
Meeting Someone, Family, Ordering Food). **Premium only**: everyone sees the
list; Premium opens all 5 (no level lock); a free account sees a Premium lock
and the upgrade flow; a guest gets the create-account explanation. Scenarios
matching the learner's goal are marked "For you". See §6.10.

### Profile (`/profile`)
Settings only, under headings: admin entry (admins only, at the top) ·
progress stats · **Daily goal & reminder** (goal, reminder on/off and time,
Save) · **Display** (appearance light/dark/match device, script and form
preferences) · **Premium** (status, plans preview) · **About** ("Why
Tunisian, not MSA?") · **Account** (change password, sign out, delete
account) · admin-only "view as free/Premium" preview. Favorites moved to
Flashcards → *Saved words*; translation requests moved to Learn.

---

## 5. Content model

All learning content lives in Supabase:

- **units** → **lessons** → **word_groups** → **word_variants**.
- A **word group** is one concept (an English meaning). Its **variants** are
  ways of saying it: exactly one `primary`, or a `masculine` + `feminine`
  pair (grammatical forms, enforced by a DB constraint), plus optional
  "also heard" synonyms.
- Each variant has Arabic script, a Latin transliteration (Tunisian chat
  style, e.g. `a7mer`), an optional audio file, notes, and verification
  fields (`native_verified`, `is_native_voice`, approver).
- `content_status` (`draft` / `pending_review` / `approved` / `rejected` /
  `archived`) on groups and variants. **Learners only see `approved`** — this
  is enforced in the app's data-access functions (RLS lets signed-in users
  read all rows so admins can edit).
- `native_verified` = a native speaker checked the **written** word (set by
  review); `is_native_voice` = the **recording** is native (set by an audio
  upload or the admin recorder). A word's audio is a native recording only
  with `is_native_voice`; otherwise it's a "computer voice" (placeholder).
- **Words used** (0027, `phrase_word_links`): a phrase (any word group) can
  link to the words in it — lesson words or Phrasebook entries — in a saved
  order, with the word as it appears in the phrase ("Sakker", "el beb").
  Content, not user data; learners read, only admins change it (through
  `set_phrase_word_links`); guests read `guest_preview_phrase_word_links`.
- Bulk content work (spreadsheet import, review CSV round trip, recording
  sheet, audio upload) is done with `scripts/*.mjs`; review history and
  import notes are kept privately (`content_review_events`,
  `content_source_notes`, 0026). See [content-pipeline.md](content-pipeline.md).
- **Curriculum units** (`is_curriculum = true`) form the lesson map;
  **phrasebook categories** are units with `is_curriculum = false`, one lesson
  each.
- Some content is static in the app: grammar notes, proverbs, alphabet
  letters, Talk scenarios.

---

## 6. Features in detail

### 6.1 Sessions, daily goal and completion (shared engine)
Lessons, Review and Listening Practice run on **SessionRunner**:
- A **time-based session** (the daily goal, 5/10/15 min) with a progress bar;
  exercises cycle until time is up.
- At the end, the standard **completion card**: minutes, words practised,
  correct count; buttons *Back to home*, *Continue to next lesson* (when
  relevant), *Review weak words* (when there were misses), and **"Want to keep
  going?" +5 / +10 / +15 min** — extends this session only, never the saved
  goal.
- A **revisit round** at the end gives a second chance on words missed or
  mispronounced.
- Minutes are logged to `session_logs` once, when the learner leaves; this
  feeds "today's minutes", the day count and challenges.

### 6.2 Exercise types
Picked per word in rotation: **reading match** (hear a word, tap the right
Arabic), **typing/spelling** (type the transliteration; any variant
accepted), **speaking** (hear → record → play back → try again; no automatic
pronunciation scoring), **listen → choose the recording**, **listen → choose
the meaning**. Only native recordings are ever played in these: without one,
reading match and typing ask from the meaning ("Tap the Tunisian for …",
"Type the Tunisian for this") and speaking says "No native recording yet —
read it and say it". Every answer shows a result sheet (*Great job!* / *Not quite*
with the right answer, sound + haptic, *Next* with a 3-second countdown).
Distractors always come from other word groups, never another form of the
same word.

### 6.3 Progress, mastery and spaced repetition
- One `progress` row per (profile, word group): correct/incorrect counts,
  status (`new` → `learning` → `known`), and the spaced-repetition state.
- **Scheduler** (`src/lib/spacedRepetition.ts`, a light SM-2): input is only
  *right or wrong*. Right: next review in 1 day, then 6 days, then previous
  interval × ease (ease +0.1, capped at 3.0). Wrong: back in 1 day, ease −0.2
  (floor 1.3).
- **Due** = `next_review_at` has passed, or the word was missed twice in a
  row ("struggling"). Ordered most-overdue first.
- Every exercise answer anywhere goes through `recordWordGroupResult`, so all
  activities share one schedule.

### 6.4 Review (`/review`)
A session over due/struggling words, on the shared engine. "All caught up"
when nothing is due. Not counted (no daily limit); like all practice it only
uses approved words from lessons and categories the learner has open.

### 6.5 Flashcards (`/flashcards`, `/flashcards/[deckId]`)
A **quiz**, not a self-rating deck:
- **Decks**: *My favorites* and one deck per category containing words the
  learner has **already practised** — nothing from lessons not reached. Each
  deck shows card and due counts (due cards come first); empty decks have
  friendly empty states. There is no "due" deck: Review handles due words.
- **More ways to study** (links): *Phrase cards — listen and browse*
  (`/phrasebook/flashcards`) and *Saved words* (`/favorites`).
- **Questions**: per deck, a direction toggle — *Tunisian → meaning* ("What
  does this mean?") or *meaning → Tunisian* ("Which is the Tunisian?").
  3–4 answer choices; wrong answers come from other words the learner has
  met, never another form of the right word and never a look-alike (same
  meaning or same Tunisian text). Any form of the right word is accepted.
  Cards without enough fair choices are skipped.
- **Audio** plays automatically when a card appears (after answering, in the
  meaning → Tunisian direction, so it doesn't give the answer away).
- **After answering**: the right choice is highlighted green ("✓ Correct
  answer"), a wrong pick red ("✗ Your answer"), plus the standard result
  sheet. One result per card is recorded through the shared scheduler.
- Batches of 15, then the completion card with **Another batch**. Minutes
  count toward the daily goal (logged as a review session). Decks aren't
  counted; they only hold words from lessons and categories the learner has
  open. Guests' decks come from the preview words practised on the device.
- The **Phrasebook browse cards** (`/phrasebook/flashcards`) are a separate
  flow: browse-and-listen only, no quiz. Reached from Phrasebook and from
  Flashcards.

### 6.6 Today's Practice (`/todays-practice`)
One short guided session from Home: up to 5 due review words + 2 new words
from the current lesson + 2 Repeat After Me recordings already opened, then a
revisit round. Using the current lesson's words starts that lesson, so if it
isn't open yet it's opened (counted) while the allowance has room. Minutes
logged once at the end. Needs an account.

### 6.7 Phrasebook (`/phrasebook`)
Categories of everyday phrases. Each category counts as one item when first
opened (guest preview: Greetings + First Encounters; free: 5 in total). A
category screen lists phrases with audio, a detail modal, and favorites.
The phrase sheet (and the word page of a multi-word entry) shows **Words
used**: a card per linked word, in the saved order, with the word as it
appears in the phrase and its meaning; a card opens that word's page. Only
approved words appear; a word from a lesson the learner can't open yet shows
only the phrase's own form, locked, and follows the usual access rules.

### 6.8 Listening & speaking
- **Listening Practice**: listening-quiz questions only, from the learner's
  weakest words, favorites and current lesson; only words with an approved
  native recording qualify (needs ≥ 3, otherwise an honest empty state).
  Not offered to guests.
- **Speaking** (`/speaking`) chooses between **Practice words** (a speaking
  drill on weakest words → favorites → current lesson) and **Repeat after me**
  (repeat recordings an admin selected; up to 3 attempts per item; each
  recording counts as one item when first started — guest 2, free 5 in total;
  progress saved per item). Practice words only uses words from open lessons
  and categories (a guest drills at most 2).
- Microphone permission is requested in context, with an explanation, the
  first time it's needed.

### 6.9 Alphabet, grammar, culture
- **Alphabet**: letter hub with *Learn the letters* (practice), flashcards,
  a matching game (speed match), and diacritics (each letter with the three
  short vowels). Each letter counts as one item when first opened (guest 2,
  free 5, any letters); practice and speed match use the open letters,
  opening the next in teaching order if too few (speed match needs 3).
- **Grammar Notes**: static notes (sentence order, pronouns, conjugation
  tables with examples). Any 2 notes for a guest, 5 for a free account.
- **Culture Corner**: Tunisian proverbs and sayings with meanings; viewed
  ones are tracked. Any 2 proverbs for a guest, 5 for a free account.

### 6.10 Talk to a Tunisian (AI conversation)
- Scenario-based, **voice-first** chat with an AI tutor: the tutor's replies
  are spoken (text-to-speech); the learner answers by voice (speech-to-text)
  or typing.
- Grounded in the app's own vocabulary plus a small retrieval (RAG) corpus of
  phrases/sentences.
- All provider calls go through Supabase Edge Functions
  (`talk-to-a-tunisian`, `talk-tts`, `talk-stt`) that hold the API key; the
  client never sees it.
- **Cost controls**: a per-account daily quota plus a global monthly budget
  reserved atomically before each paid call (`meteredCall`), reconciled
  afterwards.
- **Language review**: AI turns can be corrected; only accounts listed in
  `reviewers` can verify AI-generated Tunisian (via `talk-review`), which is
  how verified phrases/sentences grow. Admin ≠ reviewer.
- Without configuration it runs a **mock provider** (scripted replies,
  device voice, typing only).

### 6.11 Translation requests (`/translation-requests`)
A learner asks for an English phrase in Tunisian; an admin answers with
Arabic, transliteration, meaning and a native recording, privately visible to
that learner (optional email notification via `translation-answered-email`).
Free plan: one request (enforced in the database). Guests need an account.

### 6.12 Dictionary / Search (`/search`)
Type English, Arabic script or Latin letters (with 3, 7, 9…) to find words
and phrases — only ones the learner can open (guest: the preview, opening 2
results; free: open lessons and categories; Premium: everything approved).
Searched in memory on the device; nothing typed is sent or logged. Details,
ranking and the approved letter aliases:
[access-and-guest-preview.md](access-and-guest-preview.md#dictionary--search).

### 6.13 Word detail & favorites
`/word/[id]`: all forms, audio, notes, a **verification badge** ("Draft —
pending native review" vs "Native-speaker verified"), progress status, a
one-word practice drill, and a ⭐ favorite toggle. `/favorites` lists saved
words. A word from a lesson or category the learner hasn't opened shows a
friendly locked state instead (word and meaning hidden), and isn't listed.

### 6.14 Display preferences
- **Script**: Arabic, Latin transliteration, or both.
- **Form** for two-form words: masculine, feminine or both first — a
  *display* preference only, never treated as the learner's gender (tests
  guard this). Words without a recording for a form say "No recording for
  this form yet" instead of playing another form or a device voice.
- **Theme**: light, dark, match device.

### 6.15 Reminders
One optional daily local notification at a chosen time, neutral wording.
Set at signup or in Profile; permission requested only on opt-in.

---

## 7. Guest, Free and Premium

Full rules, storage and limits: [access-and-guest-preview.md](access-and-guest-preview.md).

| Feature (item) | Guest | Free (total, guest use included) | Premium |
|---|---|---|---|
| Lessons (lesson) | first 2 in course order | 5 | all |
| Phrasebook (category) | Greetings + First Encounters | 5 | all |
| Grammar Notes (note) | any 2 | 5 | all |
| Culture Corner (proverb) | any 2 | 5 | all |
| Alphabet (letter) | any 2 | 5 | all |
| Repeat After Me (recording) | 2 | 5 | all |
| Review / Flashcards / Speaking / Favorites / Today's Practice | preview words only | open lessons' words | all approved words |
| Listening | not offered | open lessons' words | all approved words |
| Dictionary / Search | search the preview, open 2 results | open lessons' words | all approved words |
| Translation requests | — | 1 | unlimited |
| Talk | create-account explanation | locked (upgrade flow) | all 5 scenarios |

An item counts when first opened and is never counted twice; completed
lessons always reopen; nothing is counted while Premium, and when Premium
ends what was opened stays open. Talk is also refused by the server for
non-Premium accounts (403 `premium_required`, before any quota or provider
call).

**There is no payment system.** Locked items open a pricing preview
(`/onboarding/plans`: monthly/yearly, "7-day free trial" copy) whose buttons
charge nothing. `profiles.is_premium` can be set manually; admins can preview
either experience (the free-plan preview counts only on their device). This
is a known open issue for store review (§11).

### Guest preview

Guests are device-only: no account, no server writes, no Edge Function calls.
They read content through four read-only views (migration 0024) that expose
only the rows flagged by `scripts/select-guest-preview.sql`. To fill in that
script, run this **read-only** query in the SQL editor. It lists the first two
curriculum lessons and the first two phrasebook categories in course order,
with their words, approval status and whether each word has an approved form:

```sql
-- Read-only: candidates for the guest preview. Changes nothing.
with ordered as (
  select l.id as lesson_id, l.unit_id, l.lesson_number, l.title,
         u.name as unit_name, u.is_curriculum,
         row_number() over (partition by u.is_curriculum
                            order by u.sort_order, l.sort_order, l.id) as position
  from public.lessons l
  join public.units u on u.id = l.unit_id
)
select o.is_curriculum, o.position, o.unit_name, o.lesson_number, o.title,
       o.lesson_id, w.id as word_id, w.english_meaning, w.content_status,
       exists (select 1 from public.word_variants v
               where v.word_group_id = w.id and v.content_status = 'approved') as has_approved_form
from ordered o
left join public.word_groups w on w.unit_id = o.unit_id and w.lesson_number = o.lesson_number
where o.position <= 2
order by o.is_curriculum desc, o.position, w.sort_order;
```

Use only rows with `content_status = 'approved'` and `has_approved_form =
true`. The phrasebook rows must be Greetings and First Encounters (the script
checks this and aborts otherwise).

---

## 8. Backend (Supabase)

**Tables** (migrations `supabase/migrations/0001`–`0025`):
- Accounts & people: `accounts`, `profiles` (one per account, enforced by a
  trigger), `consent_records`, `daily_goal_settings`,
  `learner_display_preferences`, `reviewers`.
- Content: `units`, `lessons`, `word_groups`, `word_variants` (the original
  flat `words` table was replaced in 0003), Talk corpus `phrases`,
  `sentences`, `conversation_examples`.
- Learning data: `progress`, `favorites`, `session_logs`,
  `translation_requests`, `corrections`, `feature_item_claims` (items a
  free account has opened, 0025).
- Guest preview: `is_guest_preview` flags and four read-only
  `guest_preview_*` views (0024).
- Stored **on the device** (AsyncStorage, per profile): Repeat After Me item
  progress, alphabet/proverb/phrasebook "viewed" progress, daily-challenge
  flags, the admin's free-plan preview counts, theme. Guest mode keeps its
  used items, practice results and favorites on the device too, and the age
  gate's 24-hour retry block is device-only.
- AI cost control: `ai_daily_usage`, `ai_budget_reservations`,
  `ai_usage_log`.

**Edge Functions** (`supabase/functions/*`, logic in `handler.ts`, unit-tested
under Jest): `talk-to-a-tunisian`, `talk-tts`, `talk-stt`, `talk-review`,
`translation-answered-email`, `delete-account`.

**Account deletion**: in-app (type DELETE to confirm). The function deletes
only the caller's own account: storage files → `delete_account_data` (data
deleted or anonymised) → Auth user last; success is reported only after the
Auth user is gone. Local device data for the profile is cleared too.

**Security notes**: RLS on every table; learners can only read/write their
own rows; content writes are admin-only; `phrases`/`sentences` and resolved
corrections are written only by `talk-review` with the service role.

---

## 9. Admin tools (`/admin`, admins only)

Five tabs, organised by the job at hand (reached from a card at the top of
Profile, visible only to admins; every screen follows light/dark mode):

| Tab | What's there |
|---|---|
| **Today** (`/admin`) | The pipeline at a glance — *waiting for review → live → with native audio* — and **Needs you now** (translation requests, words waiting for review, AI corrections for reviewers, forms needing a recording), most urgent first; "All caught up" when nothing waits. Also the *View app as Premium* switch. |
| **Requests** | Learners' translation questions, soonest deadline first; answer with text and audio. |
| **Review** | Words and phrases waiting for review (open one to approve, fix or reject); **AI corrections** for language reviewers only. |
| **Audio** | The recording studio: *To record* (no recording, missing file, or a computer voice to replace), *Skipped*, *Explanations*, in course order. |
| **Content** | Search every word and phrase; course units and Phrasebook categories listed separately (→ lessons → word editor: forms, audio, *Words used*, status); content progress and learner analytics. |

Plain names: a *word or phrase* (word group) has *forms* (variants); *Live*
= approved; *Text checked by a native speaker* = `native_verified`; *Native
recording* = `is_native_voice`. The old addresses (`/admin/queue`,
`/admin/recordings`, …) still open the same screens on their own.
---

## 10. Offline behaviour

- **Audio** that has been played (or prefetched for a lesson) is cached on
  disk and plays offline.
- **Content and progress are online**: lists are fetched from Supabase each
  time; there is no offline content cache and **no offline queue** for
  answers — a failed progress write is dropped (lessons) or reported on
  screen (flashcards).
- Talk mock mode works offline; live mode needs the network.

---

## 11. Product principles and known gaps

**Principles** (enforced in code review and some tests): adults only; one
profile per account; no ads; no guilt, penalties, lives or leaderboards;
minimal, contextual permissions; honesty about content status (draft badges,
no invented claims); grammatical form is display-only, never identity.

**Known gaps / open questions** — useful starting points for recommendations:
1. **Content** is a small unverified draft with MSA text-to-speech audio —
   the biggest gap between the app and a launchable product.
2. **Premium without payments**: locked content can't be unlocked and the
   Plans screen mentions a trial; needs either real in-app purchase or
   removing the locks for launch.
12. **Access limits are app-side for v1** (except Talk, which the server
    refuses): content tables stay readable by any signed-in user, bundled
    content can be read from the app, guest counts reset on reinstall, and one
    person can make several accounts. See
    [access-and-guest-preview.md](access-and-guest-preview.md#known-limits-of-v1-bypassable-on-purpose).
3. **Legal**: real Terms of Use and Privacy Policy are missing.
4. **Offline**: no content cache and no queued progress writes.
5. **Overlap**: *Review* and *Today's Practice* both serve due words (Today's
   Practice mixes in new words and Repeat After Me); Flashcards also show due
   counts per deck.
6. **Speech**: no automatic pronunciation scoring; speech-to-text has no
   dedicated Tunisian mode (transcribes into standard Arabic script).
7. **Small-content edge cases**: quizzes need ≥ 3 words practised; early
   users see many empty states.
8. **Unused calculations**: the 🔥 day count and daily challenges are no
   longer displayed; their code and stored data remain (could be removed or
   reused later).
9. **No analytics/crash reporting** wired for production.
10. **Store submission**: see [store-listing.md](store-listing.md) owner checklist.
11. **Device-only progress**: Repeat After Me, alphabet, proverb and
    challenge progress live on the device, so they don't follow the learner
    to a new phone or survive a reinstall.

---

## 12. Code map

```
app/                    Screens (expo-router; one file = one route)
src/components/         UI by feature: session/, exercises/, flashcards/,
                        tunisian/ (TunisianText, FormDisplay), onboarding/,
                        premium/, ui/ (Button, ScreenContainer, FeedbackSheet…)
src/data/               All Supabase queries (the data-access boundary)
src/lib/                Pure logic & contexts: spacedRepetition, flashcards,
                        reviewSelection, lessonCompletion, todaysPractice,
                        listening, access/ (guest/free/Premium rules),
                        guest/ (preview mode, carry-over), premium/,
                        display/, auth/, account/,
                        notifications/, offline/, ai/, theme/, onboarding/
src/hooks/              useSessionTimer, useWordAudioPlayer, useExerciseQueue…
src/constants/          appCopy (marketing copy), dailyGoal, grammar notes,
                        proverbs, Talk scenarios, theme
supabase/migrations/    Schema, RLS, functions (0001–0025)
supabase/rollbacks/     Rollback scripts for 0024 / 0025
scripts/                Hand-run SQL (guest preview selection, checks)
supabase/functions/     Edge Functions (handler.ts + index.ts each)
supabase/tests/         Database tests (PGlite)
docs/                   This guide, store listing, cost controls,
                        language review, account deletion, testing
```

## 13. Further reading

- [README.md](../README.md) — setup, environment, per-feature technical notes.
- [APP_OVERVIEW.md](../APP_OVERVIEW.md) — original design decisions and history.
- [access-and-guest-preview.md](access-and-guest-preview.md) — Guest / Free / Premium rules, Talk enforcement, age retry block.
- [launch-checklist-age-and-legal.md](launch-checklist-age-and-legal.md) — open age and legal items before launch.
- [store-listing.md](store-listing.md) — store copy, claims audit, owner checklist.
- [cost-controls.md](cost-controls.md) — AI quotas and budget.
- [language-review.md](language-review.md) — reviewer allowlist and verification.
- [content-pipeline.md](content-pipeline.md) — bulk import, native review, recordings, progress.
- [content-plan.md](content-plan.md) — proposed structure for 300–500 words.
- [account-deletion.md](account-deletion.md) — what is deleted or anonymised.
- [TESTING.md](TESTING.md) — how to run the test suites.
- [CLAUDE.md](../CLAUDE.md) / [AGENTS.md](../AGENTS.md) — rules for contributors and AI agents.
