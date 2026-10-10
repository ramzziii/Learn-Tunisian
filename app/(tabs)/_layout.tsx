import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { useTheme } from '@/lib/theme/ThemeContext';

/**
 * The app's real navigation spine — Home / Learn / Practice / Talk /
 * Profile. Being a route GROUP ("(tabs)"), this folder name never appears
 * in the URL: app/(tabs)/home.tsx is still reached at exactly "/home", so
 * every existing router.push('/home')-style call elsewhere in the app kept
 * working unchanged when these screens moved here.
 *
 * Everything else (lesson sessions, review, phrasebook, alphabet, culture,
 * settings sub-screens, onboarding, auth) stays outside this group as
 * ordinary full-screen routes, pushed on top of the tab bar exactly the way
 * Home already pushed to /lesson/[lessonId] before this change — only the
 * five section landing pages themselves are tabs.
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
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
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
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👤</Text> }}
      />
    </Tabs>
  );
}
