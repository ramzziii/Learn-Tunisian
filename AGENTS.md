# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

This project is pinned to Expo SDK 57 (upgraded 2026-09 from SDK 54) because
the App Store build of Expo Go tracks whatever SDK is currently on the
listing, and it moved on to SDK 57 — SDK 54 projects no longer open in it
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
- `@react-native-community/datetimepicker`'s config plugin imports
  `@expo/config-plugins` directly (instead of the `expo/config-plugins`
  sub-export), which doesn't resolve unless something hoists that package to
  the project root. Fixed here by adding `@expo/config-plugins` as an
  explicit devDependency pinned to the version `expo`'s own package.json
  depends on — `expo-doctor` will flag it as "shouldn't be installed
  directly" but says to ignore that warning when it's fulfilling exactly
  this kind of peer dependency.
- `jest-expo`'s RN preset moved to a separate `@react-native/jest-preset`
  package as of SDK 56 — install it explicitly, pinned to the same version
  as `react-native`.
- `StyleSheet.absoluteFillObject` was removed in favor of `StyleSheet.absoluteFill`
  (now itself a plain spreadable object).
- `newArchEnabled` was removed from `app.json`'s schema in SDK 55 (New
  Architecture is the only option now) — delete the key rather than leave it.
