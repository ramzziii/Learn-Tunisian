# Access: Guest preview, Free and Premium

How the app decides who can open what. The rules live in one place,
`src/lib/access/accessRules.ts`, and every screen asks the access layer
(`useAccess()` from `src/lib/access/AccessContext.tsx`) instead of deciding
locally.

## Tiers

| Tier | Who | Where "used items" are counted |
|---|---|---|
| **Guest** | Signed out, after "Try a free lesson" and the 18+ question. Device only. | On the device (`learn-tunisian.guest-data`) |
| **Free** | Signed-in account without Premium | On the server (`feature_item_claims`, migration 0025) |
| **Premium** | `profiles.is_premium`, or an admin (unless previewing the free plan) | Nothing is counted |

An admin previewing the free plan is counted on the device only
(`learn-tunisian.preview-claims.<profileId>`). This never touches their real
counts or entitlement. Profile → "Reset free-plan limits" clears it. The
preview acts like a new free account: the admin's own completed lessons
don't reopen for free there. While it's on, every screen shows a "Viewing as
a free user" banner (`FreePreviewBanner`, in `ScreenContainer`) that opens
Profile.

Lock badges say what unlocks the item (`lockKind` in accessRules.ts): a
guest sees "🔒 Sign up" on anything a free account would open, and
"🔒 Premium" only on Premium-only items; signed-in free accounts always see
"🔒 Premium".

## The access table

| Feature | Item | Guest | Free (total, guest use included) | Premium |
|---|---|---|---|---|
| Learn | lesson | the first 2 lessons in course order (the preview) | 5 lessons | all (lessons still unlock in order) |
| Phrasebook | category | Greetings + First Encounters (the preview) | 5 | all |
| Grammar Notes | note | Basic sentence order only (fixed, not counted) | Basic sentence order, Present tense, Questions; every other note is Premium | all |
| Culture Corner | proverb | any 2 | 5 | all |
| Alphabet | letter | any 2 | 5 | all letters |
| Repeat After Me | recording | 2 preview recordings (if 2 qualify) | 5 | all |
| Review, Flashcards, Speaking, Favorites, Today's Practice | — (not counted) | preview words practised on the device | words from lessons / categories already open | every approved word |
| Listening | — (not counted) | not offered | words from open lessons / categories | every approved word |
| Dictionary / Search | result opened | search the preview; open 2 results (device only) | search open lessons' words; open freely | search every approved word |
| Translation requests | request | none (needs an account) | 1 in total (enforced by the database) | unlimited |
| Talk to a Tunisian | — | visible; explains it needs an account and Premium | visible, locked (upgrade flow) | all 5 scenarios |

Rules behind the table:

- **An item counts when first opened or started**: a lesson or category when
  its screen opens, a note when it's expanded, a proverb or letter when it's
  opened, a recording when it starts. An item is never counted twice. Once
  opened, it stays open.
- **A completed lesson always reopens**, even past the limit.
- **Free = 5 in total per feature, including what the guest used.** At
  sign-up the guest's used items are recorded on the account (at most 2 per
  feature), so a guest with 2 lessons gets 3 more.
- **Nothing is counted while Premium.** When Premium ends, everything already
  opened stays open, nothing is deleted, and new items count toward the free
  total.
- **Practice isn't counted.** It only uses *approved* words from lessons and
  categories the learner has open: opened, or (lessons) completed. See
  `src/lib/access/practiceScope.ts` and `usePracticeScope()`. A word outside
  that scope shows a friendly locked state on its detail screen, without
  showing the word or its meaning.
- **Alphabet activities** (practice rounds, Speed Match) use the letters
  already open. If too few are open, the next ones in teaching order are
  opened (and counted). Speed Match needs 3 letters, so guests (2) get the
  create-account prompt instead. Speed Match rounds are unlimited.
- **Today's Practice**: review words come from the open lessons and
  categories. Its new words come from the current lesson. Using them starts
  that lesson, so if it isn't open yet it's opened (counted, like tapping it
  on Learn) while the allowance has room; otherwise there are no new words.
  It only offers Repeat After Me recordings already opened (all with
  Premium).
- **At the limit**: a guest sees "Create a free account to keep learning"; a
  free account sees the Premium gate ("You've used your 5 free …").
- **Admin is not reviewer.** Access tiers never grant review rights (see
  [language-review.md](language-review.md)).

If the counts can't be loaded or a claim can't reach the server, the screen
shows an explicit error ("Couldn't check your access"). It never falls back
to opening the item.

## Dictionary / Search

`app/search.tsx`, opened from the search bar at the top of Learn. A learner
types English, Arabic script or Latin letters (with the chat digits 3, 7, 9,
5, 8, 2) and gets one result per word or phrase.

**What can be found (never more):**

| Tier | Searchable | Opening a result |
|---|---|---|
| Guest | approved guest-preview words and phrases | 2 results (different words), counted on the device as `dictionary_result`; then the create-account prompt. Typing never counts. |
| Free | approved words from lessons / categories already opened or completed (the practice scope) | unlimited, nothing counted |
| Premium | every approved word | unlimited |

- **No leaks.** The loader (`src/data/search.ts`) only ever asks for what
  the learner can open: the guest views; the open lessons and categories
  (one filtered query); or, with Premium, every approved word in pages. A
  locked word is never fetched, indexed or counted. The empty state is the
  same static text whatever was typed ("No matching words you can open
  yet." + "Ask for this word" + a fixed upgrade line), so it can't hint that
  a locked match exists.
- **Private.** The index is built in memory only (never on disk) and
  searched on the device: typing makes no network call and is never logged
  or sent to analytics. "Ask for this word" opens a translation request
  prefilled with the text; it's sent only if the learner presses Send.
- **Kept in step with access.** The index is keyed by account, tier and the
  open lessons/categories, so sign-in, carry-over, the Premium refresh, the
  admin preview toggle and newly opened lessons rebuild it; AccessProvider
  clears it on sign-out and tier changes. No connection and no index:
  "Search needs a connection".
- **Word detail** keeps its rules; the one addition is that a guest may see
  the (at most 2) preview words they opened from search.

**Matching** (`src/lib/search/searchKeys.ts` builds every key; the stored
spelling is never modified):

- English: lowercase, punctuation ignored; one typo allowed for words of 5+
  letters (lowest rank).
- Arabic: diacritics and tatweel ignored; alef forms (أ إ آ ٱ → ا) meet only
  in a lower-ranked alias key. ة / ه and ى / ي are **not** merged.
- Latin: lowercase; apostrophes, hyphens and spaces ignored. No typo
  tolerance for Arabic or Latin.
- Ranking: exact → starts with → contains → the same on alias keys →
  English with one typo. One row per word group; a "matched: also heard /
  masculine / feminine" note only when a non-primary form matched.

**Approved Latin aliases** (the same letter written two ways; alias rank):

| Sound | Canonical | Also accepted |
|---|---|---|
| خ | `5` | `kh` |
| غ | `8` | `gh` |
| ق | `9` | `q` |
| ح | `7` | `ḥ` |
| ع | `3` | `ʿ`, `ʕ` |
| ء | `2` | an apostrophe (`'`, `’`, `ʼ`) |

Never merged: 7 / h, 3 / a, 9 / k, 5 / k, 8 / g, 2 / a (a stored `7abib`
is not found by `habib`). Not approved, so left out: `sh` / `ch`, `u` /
`ou`, ة / ه, ى / ي — they'd need native-reviewer confirmation.

## Guest preview

- **Entry**: Welcome → "Try a free lesson" → "Are you 18 or older?" (yes / no,
  no date of birth). "Yes" starts guest mode; "No" shows the adults-only
  message and starts the device retry block (below).
- **Device only**: no anonymous Auth users, no server writes, no Edge Function
  calls. Content is read through the guest views from migration 0024 (anon
  key, read-only). Progress, favorites and used items are stored only on the
  device.
- **Account-only places** show the create-account explanation instead,
  without loading anything, even from a direct link. These are Profile and
  Settings, Translation requests, Account deletion, the profile chooser,
  Today's Practice and Talk sessions (`RequireAccount`, `app/talk/[scenarioId].tsx`).
- **Home** for a guest: no goal card; one action, "Try lesson 1"; a quiet
  "Create a free account" link.
- **Nudge**: after a guest finishes a lesson, "Create a free account to keep
  learning" (Create account / Not now) appears at most once per app launch
  (`src/lib/guest/nudge.ts`). It never blocks; "Not now" goes back.
- **Carry-over at sign-up** (`app/guest/carry-over.tsx`, after the profile is
  created, only if the device holds preview data):
  1. The guest's used items are always recorded on the new account
     (`import_guest_feature_items`).
  2. "Bring your preview progress?" With a yes, practice results and saved
     words move to the profile. With "Not now", they are cleared from the
     device.
  3. If moving fails, the device keeps everything, an error says so, and the
     learner can retry (or skip, which clears).
  4. Finally the preview data, the guest-mode flag and the preview's
     `learn-tunisian.*.guest` device keys are removed.

## Talk is Premium only

- **In the app**: the Talk tab lists all 5 scenarios for everyone. Premium
  opens any of them (there is no level lock any more). A free account gets
  the Premium lock and the upgrade flow. A guest gets the create-account
  explanation. The session route (`/talk/[scenarioId]`) checks again before
  any conversation, voice or recorder hook runs.
- **On the server**: `talk-to-a-tunisian` (chat) and `talk-tts` (tutor voice)
  call `requirePremium` (`supabase/functions/_shared/aiBudget.ts`) right after
  verifying the JWT. This happens before the provider key, the daily quota,
  the monthly budget or any provider call. A non-Premium account gets
  **403 `premium_required`**. If the entitlement can't be checked, the
  answer is 503 and nothing is spent. Premium means a profile of that account
  with `is_premium = true`, or an admin account.
- `talk-stt` (speech-to-text) stays available to signed-in free accounts,
  because pronunciation checks in Speaking practice use it. `talk-review`
  stays reviewer-only.
- No Talk quota or AI pricing was changed.

## Age gate retry block

- The sign-up age gate keeps the date-of-birth check. The guest path asks
  only "Are you 18 or older?".
- Either way, an under-18 answer stores only a yes/no flag and its expiry
  (`learn-tunisian.age-retry-block`) for **24 hours**
  (`AGE_RETRY_BLOCK_HOURS` in `src/lib/age/retryBlock.ts`). Until then both
  age screens show the adults-only message with no way to retry. The date of
  birth itself is never stored, logged or sent.
- The wording is friendly and gives no hints about which date would pass.
- See [launch-checklist-age-and-legal.md](launch-checklist-age-and-legal.md)
  for what remains before launch. Nothing in the app or docs claims legal
  compliance.

## Database (migrations 0024, 0025)

Neither migration has been applied to production by this change. Apply them
in this order, and only after review:

1. **`0024_guest_preview.sql`** adds `is_guest_preview` flags on `units`,
   `lessons` and `word_groups`. It also adds four read-only views
   (`guest_preview_units`, `guest_preview_lessons`,
   `guest_preview_word_groups`, `guest_preview_word_variants`) with
   `security_barrier`, explicit columns and approved content only. Grants are
   SELECT-only to `anon` and `authenticated`. It selects nothing by itself,
   and no grants or policies on existing tables change. (Later,
   `0027_phrase_word_links.sql` adds a fifth view in the same style,
   `guest_preview_phrase_word_links`: "Words used" links of preview phrases
   to approved words only.)
2. **`scripts/select-guest-preview.sql`** (run by hand after 0024) chooses
   the preview content by id. It checks that there are exactly 2 + 2
   lessons, that they are the first two in course order, that the two
   categories are Greetings and First Encounters, and that every word is
   approved and has an approved form. Any problem aborts it and flags nothing.
   Use the read-only query in [APP_GUIDE.md](APP_GUIDE.md#guest-preview) to
   fill it in.
3. **`0025_feature_item_claims.sql`** adds the table `feature_item_claims`
   (one row per account, feature and item; RLS select-own) and two RPCs:
   - `claim_feature_item(feature, item_key)`: auth required; already claimed
     → true; Premium → true without recording; at most 5 per feature (under
     an advisory lock).
   - `import_guest_feature_items(items)`: at most 2 per feature and 50 items;
     idempotent.

   Rows are deleted with the account (`delete_account_data` and
   [account-deletion.md](account-deletion.md)).

Rollbacks: `supabase/rollbacks/0024_guest_preview.rollback.sql` and
`supabase/rollbacks/0025_feature_item_claims.rollback.sql`. Tests:
`supabase/tests/guestPreview.test.mjs`, `featureClaims.test.mjs` and
`accountDeletion.test.mjs` (`npm run test:db`).

## Known limits of v1 (bypassable on purpose)

These limits steer an honest learner; they are not DRM:

- Content tables (`units`, `lessons`, `word_groups`, `word_variants`) remain
  readable by any signed-in user through the API (RLS), so a free account
  could read locked content directly. Locks are applied in the app.
- The used-item counts are enforced server-side for free accounts (an RPC
  refuses a sixth claim), but the screens decide what to show from them.
- Bundled content (grammar notes, proverbs, letters) ships inside the app and
  can be read by unpacking it.
- Guest counts and the age retry block live on the device; reinstalling the
  app or clearing its data resets them.
- One person can create several accounts.
- The audio bucket is public, so a recording URL works for anyone who has it
  (unchanged in this work).
- Talk is the exception: the paid calls are refused by the server.

## Manual steps

1. Review and apply `0024_guest_preview.sql`, then fill in and run
   `scripts/select-guest-preview.sql`, then apply
   `0025_feature_item_claims.sql` (staging first, never straight to
   production).
2. Approve the content you want in the preview (draft words can't be
   selected).
3. Deploy the updated `talk-to-a-tunisian` and `talk-tts` Edge Functions.
4. Set `EXPO_PUBLIC_SUPPORT_EMAIL` in your local `.env` (placeholder in
   `.env.example`).
5. Work through [launch-checklist-age-and-legal.md](launch-checklist-age-and-legal.md).

## Code map

```
src/lib/access/accessRules.ts      the table: tiers, allowances, decideItemAccess
src/lib/access/AccessContext.tsx   useAccess(): tier, claimed, decide, open, resetPreview
src/lib/access/useLessonAccess.ts  opens a lesson / category before its content loads
src/lib/access/practiceScope.ts    which words practice may use (+ usePracticeScope)
src/lib/access/useOpenLetterPool.ts letters for alphabet activities
src/lib/search/                   search keys, index, in-memory cache (Dictionary / Search)
src/data/search.ts                access-filtered loader for the search index
src/components/access/AccessLimit.tsx  limit screen, "couldn't check" screen, locked-tap action
src/lib/guest/                     guest mode, device store, nudge, carry-over
src/data/guest/                    guest reads (preview views) and device-only writes
src/data/featureClaims.ts          claim / import RPCs
app/guest/                         18+ question, create-account prompt, carry-over
```
