# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v58.0.0/ before writing any code.

This project is pinned to Expo SDK 58 (upgraded 2026-10 from SDK 57, and
2026-09 from SDK 54 before that) because the App Store build of Expo Go
tracks whatever SDK is currently on the listing, and it moved on to SDK 58 —
older-SDK projects no longer open in it
(see the "Expo Go and the App Store" changelog series on docs.expo.dev).
Match whatever SDK the App Store's Expo Go build currently requires — check
before bumping further, since it can move again.

Upgrade notes from the 54→57 jump (in case the same class of issue recurs on
a future bump):
- Upgrade one SDK at a time (`npm install expo@^N.0.0` → `npx expo install
  --fix` → `npx expo-doctor`), not straight to latest — each version's own
  changelog calls out breaking changes the next version's doesn't repeat.
- SDK 56 decoupled `expo-router` from `@react-navigation/*` — anything
  importing `useFocusEffect`/`useIsFocused` etc. from `@react-navigation/native`
  needs to import it from `expo-router` instead (same signature).
- (SDK 57 only, now resolved) `@react-native-community/datetimepicker`'s
  config plugin used to import `@expo/config-plugins` directly, so it was
  added as an explicit devDependency. As of the SDK 58 versions the plugin
  imports `expo/config-plugins`, so that devDependency was removed and
  `expo-doctor` is clean again. If a plugin regresses to importing
  `@expo/config-plugins` directly, re-add it pinned to the version `expo`'s
  own package.json depends on.
- `jest-expo`'s RN preset moved to a separate `@react-native/jest-preset`
  package as of SDK 56 — install it explicitly, pinned to the same version
  as `react-native`.
- `StyleSheet.absoluteFillObject` was removed in favor of `StyleSheet.absoluteFill`
  (now itself a plain spreadable object).
- `newArchEnabled` was removed from `app.json`'s schema in SDK 55 (New
  Architecture is the only option now) — delete the key rather than leave it.

Upgrade notes from the 57→58 jump:
- `npx expo install expo@^58.0.0 --fix` handled the version alignment
  (React Native 0.88, React 19.3). Re-pin `@react-native/jest-preset` to the
  new `react-native` version afterwards.
- `expo-file-system`'s `File.write()` is async now — `await` it before
  anything reads the file (see src/hooks/useTutorSpeech.ts).
- `expo-doctor` flagged `expo-font` as a missing peer of `@expo/vector-icons`
  (Expo Go provides it; standalone builds may crash without it) — installed.
- Web export output is unchanged (single-page `index.html`); no `web.output`
  config was needed.
