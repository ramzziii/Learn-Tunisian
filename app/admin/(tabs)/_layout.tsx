import { Tabs } from 'expo-router';
import { Platform, Text, type ColorValue } from 'react-native';

import { useTheme } from '@/lib/theme/ThemeContext';

/**
 * Admin, organised by the job at hand: Today (what needs you now), Requests
 * (learners' translation questions), Review (words waiting for review, AI
 * corrections for reviewers), Audio (the recording studio) and Content
 * (search, course, Phrasebook, reports). A route group, so the URLs are
 * /admin, /admin/requests, /admin/review, /admin/audio, /admin/content;
 * every detail screen (word editor, lessons, units…) stays a full-screen
 * route pushed on top, and the old addresses keep working.
 */
export default function AdminTabsLayout() {
  const { colors } = useTheme();
  const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ fontSize: 20, color }}>{glyph}</Text>;

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
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('🏠') }} />
      <Tabs.Screen name="requests" options={{ title: 'Requests', tabBarIcon: icon('💬') }} />
      <Tabs.Screen name="review" options={{ title: 'Review', tabBarIcon: icon('✅') }} />
      <Tabs.Screen name="audio" options={{ title: 'Audio', tabBarIcon: icon('🎙️') }} />
      <Tabs.Screen name="content" options={{ title: 'Content', tabBarIcon: icon('📚') }} />
    </Tabs>
  );
}
