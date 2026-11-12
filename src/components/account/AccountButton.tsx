import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useAccess } from '@/lib/access/AccessContext';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { useTheme } from '@/lib/theme/ThemeContext';

const SIZE = 36;

/** The first letter of the learner's name, uppercased ("" when there's none). */
export function avatarInitial(name: string | null | undefined): string {
  const first = Array.from((name ?? '').trim())[0] ?? '';
  return first.toLocaleUpperCase();
}

/**
 * The account button at the top right of every tab (Home, Learn, Practice,
 * Talk): a round avatar with the learner's initial, or a person icon for a
 * guest. It opens /profile — pushed over the tabs — where a guest gets the
 * existing create-account explanation (RequireAccount).
 */
export function AccountButton() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { tier } = useAccess();
  const { activeProfile } = useActiveProfile();
  const initial = tier === 'guest' ? '' : avatarInitial(activeProfile?.name);

  return (
    <PressableScale
      haptic
      accessibilityRole="button"
      accessibilityLabel="Profile and settings"
      hitSlop={8}
      onPress={() => router.push('/profile')}
      style={[styles.avatar, initial ? styles.avatarFilled : styles.avatarGuest]}
    >
      {initial ? (
        <Text style={styles.initial}>{initial}</Text>
      ) : (
        <Text style={styles.personIcon} accessibilityElementsHidden importantForAccessibility="no">
          👤
        </Text>
      )}
    </PressableScale>
  );
}

/**
 * A tab's top row: its small eyebrow label on the left, the account button
 * on the right — the same spot on all four tabs.
 */
export function TabTopRow({ eyebrow, eyebrowStyle }: { eyebrow: string; eyebrowStyle?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <Text style={[eyebrowStyle, styles.eyebrow]} numberOfLines={1}>
        {eyebrow}
      </Text>
      <AccountButton />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    eyebrow: { flex: 1, marginBottom: 0 },
    avatar: {
      width: SIZE,
      height: SIZE,
      borderRadius: SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarFilled: { backgroundColor: colors.primary },
    avatarGuest: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
    initial: { fontSize: 16, fontWeight: '800', color: colors.textOnPrimary },
    personIcon: { fontSize: 18 },
  });
