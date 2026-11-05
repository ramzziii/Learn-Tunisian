import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { spacing } from '@/constants/theme';
import { useAdminPreviewState } from '@/lib/premium/adminPreviewState';

/**
 * Shown on every screen while an admin previews the free plan, so it's
 * always clear which plan the app is showing. Tapping it opens Profile,
 * where the "View app as Premium" switch lives. Nothing for anyone else.
 */
export function FreePreviewBanner() {
  const premium = useAdminPreviewState();
  if (!premium?.isAdmin || premium.adminPreview !== 'free') return null;

  return (
    <Pressable
      style={styles.banner}
      onPress={() => router.push('/profile')}
      accessibilityRole="button"
      accessibilityLabel="Viewing the app as a free user. Open Profile to switch back to Premium."
    >
      <Text style={styles.text}>👀 Viewing as a free user · Switch in Profile</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: '#F2A65A', paddingVertical: spacing.xs, paddingHorizontal: spacing.md, alignItems: 'center' },
  text: { color: '#242021', fontSize: 13, fontWeight: '700' },
});
