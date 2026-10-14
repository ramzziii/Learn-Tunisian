# Testing & CI

## Running locally

```sh
npm test            # Jest (watch: npm run test:watch)
npm run typecheck   # tsc --noEmit
npm run test:ci     # what CI runs
npx expo-doctor     # SDK 57 project health (advisory — see below)
```

No Supabase credentials or `.env` are needed for any of these. Tests that
touch the data layer use `src/test-utils/fakeSupabase.ts`, a scripted stand-in
for the supabase-js query builder that records every query/write and can
return realistic failures (RLS denial `42501`, 0-row update `PGRST116`,
constraint `23505`, trigger errors).

## What CI runs (`.github/workflows/ci.yml`)

On every pull request and every push to `main`, with no secrets:

| Job | Steps | Blocking |
| --- | --- | --- |
| `checks` | `npm ci` → `npm run typecheck` → `npm run test:ci` → `npx expo export --platform web` (bundles every route; smoke check) | Yes |
| `expo-doctor` | `npx expo-doctor` | No (`continue-on-error`) |

`expo-doctor` is advisory because it compares installed versions against the
latest SDK 57 patch releases fetched from the network, so it turns red when
Expo publishes a patch rather than when a PR breaks something. It also always
flags `@expo/config-plugins`, which is installed on purpose (see AGENTS.md).

## Where the critical flows are tested

| Journey | Tests |
| --- | --- |
| Free vs. Premium boundaries | `src/lib/__tests__/premiumAccess.test.ts`, `src/lib/__tests__/freeAllowance.test.ts` |
| Locked content by direct link | `src/data/__tests__/premiumAccess.test.ts` (content never fetched), `src/__tests__/routes/lessonRouteAccess.test.tsx` (gate rendered instead of a session) |
| Admin edits & Supabase rejections | `src/data/admin/__tests__/content.test.ts`, `src/lib/admin/__tests__/wordGroupValidation.test.ts` |
| Audio upload → save path → delete old file | `src/lib/__tests__/audioPlayback.test.ts`, `src/components/admin/__tests__/AudioRecorderField.test.tsx` (what the admin sees on failure/success) |
| Learner playback refresh after re-recording | `src/lib/__tests__/audioCacheResolution.test.ts` (native cache/download/fallback and web) |
| Lesson/review/progress | `src/data/__tests__/progress.test.ts`, `src/hooks/__tests__/useExerciseQueue.test.ts`, plus the pure scheduling/mastery tests in `src/lib/__tests__/` |

Component and route tests use `@testing-library/react-native` (v14 — note
`render`/`renderHook` are async and must be awaited). Route tests live under
`src/__tests__/routes/`, never inside `app/`: Expo Router treats every file in
`app/` as a route.

## Not covered by CI (manual or credentialed)

### Database-level checks (needs a Supabase project)
The tests above prove the *client* handles RLS/constraint failures correctly;
they can't prove the policies themselves are right. Check against a
**separate test project or `supabase start` locally — never production**:

- A non-admin can't write `units`/`lessons`/`word_groups`/`word_variants` or
  upload to the `audio` bucket.
- A learner can only read/write their own `progress`, `favorites`,
  `session_logs`.
- **Known gap:** `profiles_all_own` lets a user update their own row,
  including `is_premium` — Premium is currently self-grantable, and Premium
  content isn't restricted by RLS (gating is client-side). Fix before
  charging money.

If these become automated, put them in `supabase/tests/` (pgTAP, run with
`supabase test db`) as a separate workflow that only runs where a local
Supabase stack is available — not in the ordinary PR job.

### Device-level checks (needs a phone/simulator)
Not reproducible in Jest: microphone permission + recording, actual audio
playback (e.g. iOS refusing a cached file without an audio extension),
notifications, haptics. Before a release, on Expo Go or a dev build:
record → save → play on another device; play a lesson offline after
downloading it; deny the mic permission and confirm the explanation shows.

### End-to-end (recommended next step, not added yet)
Nothing E2E is configured. Smallest practical next steps, in order:

1. **Web:** Playwright against `npx expo start --web` (or the exported
   `dist/`), signed in as a seeded test account in a *test* Supabase project.
   Start with three flows: sign-in → first lesson; free user taps a locked
   lesson → plans screen; admin re-records a word → learner hears the new one.
   Needs: a test Supabase project + seeded accounts, passed as CI secrets, and
   run on `main` / nightly rather than every PR.
2. **Mobile:** Maestro flows against an EAS development build. Needs EAS set
   up first (below).

## Release / CD

Not automated, and deliberately not part of CI:

- There is **no `eas.json`** and no `EXPO_TOKEN` or store credentials in the
  repo, so there's nothing to reuse. Setting it up: `npx eas-cli login`,
  `npx eas-cli build:configure` (creates `eas.json` with
  development/preview/production profiles), then App Store Connect / Play
  Console credentials via `eas credentials`.
- Once that exists, a sensible next workflow is **manual-only**
  (`workflow_dispatch`) or tag-triggered `eas build --profile preview`, using
  an `EXPO_TOKEN` repository secret — never on every pull request.
- `expo-font` is missing as a peer of `@expo/vector-icons` (flagged by
  expo-doctor). Expo Go supplies it, but a standalone build may crash on the
  Talk screen's icons — install it (`npx expo install expo-font`) before the
  first EAS build.
