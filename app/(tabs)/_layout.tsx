import { Tabs } from 'expo-router';
import { Platform, Text } from 'react-native';

import { useTheme } from '@/lib/theme/ThemeContext';

/**
 * The app's real navigation spine — four tabs: Home / Learn / Practice /
 * Talk. Profile is not a tab: it's app/profile.tsx, pushed over the tabs
 * from the account button at the top right of each tab
 * (src/components/account/AccountButton.tsx). Being a route GROUP ("(tabs)"), this folder name never appears
 * in the URL: app/(tabs)/home.tsx is still reached at exactly "/home", so
 * every existing router.push('/home')-style call elsewhere in the app kept
 * working unchanged when these screens moved here.
 *
 * Everything else (lesson sessions, review, phrasebook, alphabet, culture,
 * settings sub-screens, onboarding, auth) stays outside this group as
 * ordinary full-screen routes, pushed on top of the tab bar exactly the way
 * Home pushes to /lesson/[lessonId] — only the four section landing pages
 * themselves are tabs.
 *
 * Tab switching stays instant (no added transition) — motion in this app
 * lives in screen pushes and taps, not tab switches; see app/_layout.tsx
 * for the push transition and src/components/ui/PressableScale.tsx for the
 * shared tap motion.
 */
export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        // On the web the bar is 48px: a fixed 28px icon slot and 5px padding
        // left the label 10px and clipped it. 56px leaves it the 14px it needs.
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, ...(Platform.OS === 'web' ? { height: 56 } : null) },
        tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏠</Text> }}
      />
      <Tabs.Screen
        name="learn"
        options={{ title: 'Learn', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📚</Text> }}
      />
      <Tabs.Screen
        name="practice"
        options={{ title: 'Practice', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🎯</Text> }}
      />
      <Tabs.Screen
        name="talk"
        options={{ title: 'Talk', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>💬</Text> }}
      />
    </Tabs>
  );
}
