# Content pipeline: import → review → record → upload → check

How words get from a spreadsheet to learners, with a native speaker's review
and native recordings. Everything is a **dry run** until you add `--execute`.

## The rules (what the scripts never do)

- Imported words always arrive as **draft**. Only your native reviewer's
  verdicts (step 3) approve anything. Learners only ever see approved words.
- A lesson with no approved words is **hidden** from learners, so new lessons
  appear only as their words are approved — and never block the lessons after
  them.
- Nothing is deleted. An existing word is never moved to another unit or
  lesson (the import stops with an error instead).
- Two different things are tracked per form:
  - `native_verified` — a native speaker checked the **written** word
    (set by the review, step 3);
  - `is_native_voice` — the **recording** is a native speaker (set by the
    audio upload, step 5).
  A text review never marks a recording as native.
- Spelling and transliteration in an imported sheet count as unverified, even
  when they look right. The scripts flag possible problems (`spelling_check`)
  but never correct a word.
- The service-role key comes from your environment only — never a file in the
  repo — and is never printed. Writing needs `--execute` **and**
  `--confirm-host <project>.supabase.co` matching `SUPABASE_URL` exactly.

## Before the first run (once)

1. Apply migration `supabase/migrations/0026_content_review_log.sql` (private
   review history and import notes). Rollback:
   `supabase/rollbacks/0026_content_review_log.rollback.sql`.
2. Add the reviewer's account to `public.reviewers` by hand in the SQL editor
   (being an admin is **not** enough — see docs/language-review.md). If the
   reviewer is your admin account, add that account:

   ```sql
   insert into public.reviewers (user_id) values ('<the account id>');
   ```
3. Open PowerShell in the repo and set the connection. The key is typed into
   a hidden prompt, not into the command:

   ```powershell
   $env:SUPABASE_URL = "https://<project-ref>.supabase.co"
   $secure = Read-Host "Service-role key (hidden)" -AsSecureString
   $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
   $env:SUPABASE_SERVICE_ROLE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
   [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
   ```

   When you're done: `Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY` (or close the
   window).

Keep working files (review sheets, recordings) in `content-work/` or
`recordings/` in the repo folder — both are ignored by git, as are all
`.mp3` / `.m4a` files.

## The workflow

### 1. Import the spreadsheet

```powershell
node scripts/import-content.mjs words.xlsx --validate-only     # the sheet alone, no database
node scripts/import-content.mjs words.xlsx                     # dry run: what would change
node scripts/import-content.mjs words.xlsx --execute --confirm-host <project-ref>.supabase.co
```

**Sheet format** (`.xlsx` — the "Lesson Content" sheet, or the first — or
`.csv`), one row per form:

| Column | Required | Notes |
|---|---|---|
| `unit` | yes | Matched by name to a course unit; a new name creates a unit after the existing ones. A Phrasebook category with the same name is never reused. |
| `lesson_number` | yes | Whole number. Several lessons per unit are fine; lessons are ordered by this number. |
| `word_group_id` | yes | Lowercase letters, digits and `_`. Keeps a word's identity across imports. |
| `variant_label` | yes | `primary`, `also_heard`, `masculine` or `feminine`. A word has **one primary** (plus optional also-heard forms) **or a masculine + feminine pair** — never both. |
| `word_arabic` | yes | Arabic script. |
| `transliteration` | yes | The app's style: lowercase, chat digits (`3 7 9 5 8 2`), single spaces. No accents, apostrophes or punctuation. |
| `english_meaning` | yes | Same for every row of a word. |
| `audio_filename` | no | If given, must be `<word_group_id>__<variant_label>.mp3` (or `.m4a`). |
| `notes` | no | Internal notes for the reviewer (e.g. `[HIGH]`, "check gender forms"). Stored privately, never shown to learners. |
| `lesson_title` | no | A lesson's name. Default: the unit name, numbered when a unit has several lessons ("Greetings 1", "Greetings 2"). |
| `french_meaning` | no | Ignored until translations exist. |

**What it checks** (any problem → nothing is written; row numbers reported):
missing values, extra spaces, labels, ids, transliteration style, Latin in the
Arabic, the one-primary-or-pair rule (also together with a word's existing
forms), the same Arabic twice in a word, a word spread over two lessons, one
lesson number used by two units, and ids that already exist elsewhere.

**Running it again** with the same sheet changes nothing. A changed row
updates that form and sends it back to unreviewed draft. A recording it has
is kept, still marked native: the database (0028) flags it **needs re-check**,
so learners don't hear it until an admin or reviewer confirms it in Admin →
Audio → Re-check, or records a new one.

**Import log** (needs migration 0028): every run started with `--execute` is
recorded — *imported*, *refused* (with its problems) or *failed* — with the
file name, counts and row numbers only, and shows in Admin. Dry runs and
`--validate-only` are never logged: they write nothing at all.

### 2. Export for review

```powershell
node scripts/export-for-review.mjs --out content-work/review.csv
```

A CSV (opens in Excel, Arabic included) of every draft / pending-review form,
in lesson order: `variant_id`, unit, lesson, word, form, meaning, Arabic,
transliteration, your notes, `spelling_check` hints, and empty columns for the
reviewer: **`verdict`** (`ok` / `fix` / `reject`), `corrected_arabic`,
`corrected_transliteration`, `reviewer_note`. Don't edit the other columns.

### 3. Import the review

```powershell
node scripts/import-review.mjs content-work/review.csv --reviewer-account <account id> --reviewer-name "<name>"
node scripts/import-review.mjs content-work/review.csv --reviewer-account <account id> --reviewer-name "<name>" --execute --confirm-host <project-ref>.supabase.co
```

- The `--reviewer-account` must be in `public.reviewers`. The script checks
  this **first**, before reading the sheet or the database, and stops if not.
  (The script uses the service role, which the database's reviewer rule from
  0028 doesn't check — so this check is the guard.)
- `ok` → approved, text verified. `fix` → the corrections are applied, then
  approved; a form with a recording keeps it, flagged for re-check (the report
  warns). `reject` → rejected. An empty verdict leaves the row as it is.
- A word becomes approved (visible) once **all** its remaining forms are
  approved and still make a valid set; a word whose forms are all rejected is
  rejected. If a rejection breaks a masculine/feminine pair, the word stays
  hidden and the report says why.
- Who reviewed, when, the note and the old/new text go into the private
  review history (`content_review_events`, admins only). It's kept even if the
  word is later deleted.
- Problems are reported, never guessed: unknown `variant_id`, an unknown
  verdict, `ok` with a correction, `fix` without one, a row that changed in the
  database since the export (export again). Any problem → nothing is applied.
  Running the same sheet again after it was applied skips those rows.
- Approving a word into a lesson learners can already see reopens that lesson
  for anyone who finished it; the report warns you. Approving a lesson's words
  together avoids it.

### 4. Make the recording sheet

```powershell
node scripts/export-recording-list.mjs --out content-work/recordings.csv
```

Every **approved** form without a native recording, in recording order (unit,
lesson, word, form), with the exact `file_name` to save each recording as.
Only approved forms are listed — record after the text is confirmed.

### 5. Upload the recordings

```powershell
node scripts/upload-audio.mjs recordings/
node scripts/upload-audio.mjs recordings/ --execute --confirm-host <project-ref>.supabase.co
```

- **Naming convention:** `<word_group_id>__<variant_label>.mp3` (or `.m4a`),
  all lowercase — e.g. `hello__primary.mp3`, `welcome__feminine.mp3`. This is
  the `audio_filename` column the workbook already uses. (The app's own
  recorder and the old placeholder audio use other paths; this script follows
  the spreadsheet.)
- Files are uploaded **unchanged** (nothing converted) to the existing
  `audio` bucket at `<word_group_id>/<word_group_id>__<label>-<time>.<ext>` —
  a new path each upload, so no cache keeps serving an old file. The form's
  `audio_path` is set and it's marked as a native voice. `--speaker "<name>"`
  also records the speaker.
- Reported: misnamed files (with a hint), files for words/forms that don't
  exist, forms not approved yet (refused), forms that already have a native
  recording (kept unless `--replace`), the same form twice, and approved forms
  still missing a recording.
- Old files are never deleted; the report lists them.

### 6. Check progress

The admin dashboard → **Content progress**: per unit and overall — words,
% approved, % with native audio, awaiting review — and the forms that still
need a recording (with a link to **Native Recordings**, which also records in
the app and spots files missing from Storage).

## Placeholder audio (what learners hear today)

The seeded audio is computer text-to-speech in Modern Standard Arabic, not
Tunisian (`is_native_voice = false`). Learners get:

- a **"Computer voice — not a Tunisian speaker"** label wherever it can play
  (Word detail, the forms panel, Phrasebook phrase sheet and flashcards);
- it plays **only when tapped** — only native recordings ever autoplay;
- it is **never** used in listening exercises ("Tap the word you hear",
  "Type what you hear", the listening quiz) or as the model in pronunciation
  practice. Without a native recording those ask from the meaning instead,
  or say "No native recording yet — read it and say it";
- the phone's own voice is never used for a word.

As native recordings are uploaded (step 5), words switch over automatically.

## Tests

`npm run test:scripts` (the scripts' logic: validation rules, idempotent
import, several lessons per unit, review ok/fix/reject and unknown ids, audio
matching, dry-run default) and `npm run test:db` (`contentPipeline.test.mjs`:
the same steps against the real schema in a throwaway database;
`contentReviewLog.test.mjs`: the review history's access and deletion rules).
