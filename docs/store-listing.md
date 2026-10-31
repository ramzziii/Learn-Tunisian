# Store listing draft (App Store and Google Play)

Draft copy for both stores. **The source is `src/constants/appCopy.ts`**: the
Welcome screen and the "Why Tunisian, not MSA?" screen read from it too. Edit
the source first, then paste the change here —
`src/constants/__tests__/appCopy.test.ts` fails if this file and the source
drift apart, and checks every store character limit.

Every claim below was checked against the app on 2026-10-30 (see the audit at
the end). Items marked **TODO(owner)** aren't claimed yet.

## App name (choose one, 30 characters max on both stores)

- Learn Tunisian
- Learn Tunisian: Derja Arabic
- Learn Tunisian – Speak Derja

## Apple subtitle (30 characters max)

Everyday Tunisian Arabic

## Google Play short description (80 characters max)

Learn everyday spoken Tunisian Arabic (Derja), a few minutes a day.

## Full description (both stores, 4,000 characters max)

```text
Learn Tunisian helps adults learn Tunisian Arabic, often called Derja — the language people in Tunisia use in everyday conversation.

Many Arabic courses teach Modern Standard Arabic (MSA), the formal Arabic of news and books. Learn Tunisian focuses on the Derja you’ll hear at home, in cafés and around town.

WHAT YOU CAN DO
• Work through short lessons on everyday words and phrases
• Browse a phrasebook for everyday situations and flip through flashcards
• Read simple notes on Tunisian grammar patterns
• Practise the Arabic alphabet: letters and their sounds
• Review the words you find hardest, with spaced repetition
• Read Tunisian proverbs and sayings in Culture Corner
• See words in Arabic script, Latin transliteration, or both
• Set a daily goal of 5, 10 or 15 minutes, with an optional reminder
• Keep audio you’ve already played for offline listening

WHO IT’S FOR
• Travelers heading to Tunisia
• People with Tunisian family or a Tunisian partner
• Diaspora learners reconnecting with their roots
• Curious learners who enjoy languages

A CALM WAY TO LEARN
No ads and no streak pressure. Your daily goal is a target, not a limit: at the end of a session you can always add more time. Reminders are optional, and you can change or turn them off anytime.

FOR ADULTS
Learn Tunisian is for adults aged 18 and over, with one learner profile per account. You can delete your account from inside the app.

Free to start learning.
```

## Apple keywords (100 characters max, comma-separated, no spaces)

```text
tunisian,derja,darja,tounsi,tunisia,arabic,dialect,phrasebook,vocabulary,travel,language
```

88 characters. Apple already indexes words in the app name and subtitle, so
"learn" is left out.

## Apple promotional text (170 characters max)

Learn the Tunisian Arabic people actually speak, a few minutes a day. Lessons, phrasebook, flashcards and review — no ads, no streak pressure.

## What’s new (first release)

Our first release: short lessons, a phrasebook, flashcards, grammar notes, alphabet practice, review and Culture Corner, plus a daily goal and an optional reminder.

## Screenshot captions (under eight words each)

| # | Screen to capture | Caption |
|---|---|---|
| 1 | Learn tab (lessons by unit) | Short lessons in everyday Tunisian |
| 2 | Phrasebook | Phrases for everyday situations |
| 3 | Phrasebook flashcards | Flip through phrase flashcards |
| 4 | Alphabet practice | Learn Arabic letters and sounds |
| 5 | Review | Review the words you find hardest |

Capture these from the real app with real (reviewed) content showing.

## Review notes (for App Review / Play review)

Verified facts only:

- Learn Tunisian is intended for adults (18+). The first screen after
  "Start learning free" asks for a date of birth; under-18 dates are refused,
  and no account is created or date stored.
- Sign-up is by email and password. One learner profile per account.
- Account deletion is in the app: Profile → Account → Delete account (typed
  confirmation). It deletes the account and its data.
- Notifications are optional: permission is requested only if the learner
  chooses to set a daily reminder.
- There are no ads and no in-app purchases or payment system.
- Demo account for the reviewer: **TODO(owner)** — create one and give its
  sign-in details in the store console, not in this repository.
- AI conversation practice (Talk): **TODO(owner)** — not described, because
  it runs on a built-in demo (mock) mode until the AI service is set up. Add
  a note only once it is live.
- Age rating: **not decided here**. The owner must complete Apple's age
  rating questionnaire and Google Play's content rating (IARC) questionnaire.

## Claims audit (2026-10-30)

| Claim | Evidence | Status |
|---|---|---|
| Focuses on spoken Tunisian Arabic (Derja), not MSA | Welcome copy, Talk scenarios, grammar notes (`src/constants/grammarNotes.ts`) | Used |
| For adults 18+, one profile per account | Age gate (`app/onboarding/age.tsx`, `isAdult`), migration 0019 | Used |
| Short lessons on everyday words and phrases | Learn tab, `app/lesson/[lessonId].tsx` | Used (no counts) |
| Phrasebook and flashcards | `app/phrasebook/`, Practice tab | Used |
| Grammar notes, alphabet practice, Culture Corner | `app/grammar.tsx`, `app/alphabet*.tsx`, `app/culture.tsx` | Used |
| Review with spaced repetition | `src/lib/spacedRepetition.ts`, `app/review.tsx` | Used |
| Arabic script / transliteration choice | Display preferences (migration 0023) | Used |
| 5/10/15-minute goal, optional reminder, "Add more time" | `app/onboarding/goal.tsx`, `reminder.tsx`, `SessionCompleteCard` | Used |
| No ads, no streak pressure | No ad SDK; no streak mechanics | Used (no "ever") |
| Delete account in the app | `app/account/delete.tsx` | Used |
| Offline | Only audio already played is cached (`src/lib/offline/audioCache.ts`) | Used in that narrow form |
| Free | No payment system; every account is free | Used ("Free to start learning") |
| AI conversation practice, voice replies | Mock mode unless `EXPO_PUBLIC_TALK_AI_MODE=live` and functions deployed | TODO(owner) |
| Native recordings (listening, repeat-after-me) | Screens exist; recordings must be uploaded; seeded audio is MSA TTS | TODO(owner) |
| Ask for a translation | Screen exists; needs someone answering requests | TODO(owner) |
| Native-speaker-verified content | Every `native_verified` is false | Omitted |
| Lessons personalised to goals and level | Goal only reorders Talk scenarios; level unused | Omitted (removed from Welcome) |
| Word or lesson counts | Content is a draft | Omitted |

## Owner checklist (before submitting to either store)

- [ ] TODO(owner): Replace the draft lesson content and placeholder TTS
      audio with reviewed Tunisian content and real recordings. Today all
      content is an unverified draft and the audio is MSA text-to-speech —
      the "everyday Tunisian" positioning depends on this.
- [ ] TODO(owner): Have the Culture Corner proverbs and grammar notes
      checked by a native speaker (both are marked unverified in code).
- [ ] TODO(owner): Before mentioning native recordings anywhere, upload them
      and confirm they play in Listening Practice and Repeat after me.
- [ ] TODO(owner): Decide on Talk. Either set up the AI service (live mode,
      Edge Functions, provider key, spending limit) and then add it to the
      listing, or hide the tab for the first release — reviewers will see it.
- [ ] TODO(owner): Fix the Plans screen before review. It shows "Try
      Premium free for 7 days", "Cancel anytime" and a refund promise, but
      there's no payment system, and 🔒 Premium items can't be unlocked.
      Both stores reject trials and locked content that can't be bought.
- [ ] TODO(owner): Host the real Terms of Use and Privacy Policy and supply
      their URLs (the consent screen text is still a placeholder). Both stores
      require a privacy policy URL.
- [ ] TODO(owner): Provide a support contact (URL or email) for the store
      listings. Don't commit a personal address to this repository.
- [ ] TODO(owner): Create a reviewer demo account and enter its details in
      App Store Connect / Play Console.
- [ ] TODO(owner): Capture the five screenshots from the real app on the
      required device sizes.
- [ ] TODO(owner): Complete Apple's App Privacy details and Google Play's
      Data safety form (account email, date of birth, learning progress,
      voice recordings if Talk goes live).
- [ ] TODO(owner): Complete the Apple age rating and Google Play content
      rating questionnaires; set the target audience to adults.
- [ ] TODO(owner): Confirm the keywords and app name don't clash with
      existing trademarks.
