import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';

interface SpeakingMode {
  emoji: string;
  color: string;
  title: string;
  description: string;
  href: '/speaking-practice' | '/repeat-after-me';
}

/**
 * Practice → Speaking Practice: one entry point for the two speaking
 * activities. They stay separate flows on their own routes — this screen
 * only chooses between them, and shares nothing else (queues, attempts,
 * progress, Premium access and completion are each activity's own).
 */
const MODES: SpeakingMode[] = [
  {
    emoji: '🎙️',
    color: '#C0567D',
    title: 'Practice words',
    description: 'Say words out loud, picked from your learning progress, favorites, or current lesson.',
    href: '/speaking-practice',
  },
  {
    emoji: '🎧',
    color: '#4A90A4',
    title: 'Repeat native recordings',
    description: 'Listen to a native speaker, then repeat — using the recordings chosen for Repeat After Me.',
    href: '/repeat-after-me',
  },
];

export default function SpeakingChoiceScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <ScreenContainer themed>
      <BackButton themed />
      <Text style={styles.title}>Speaking Practice</Text>
      <Text style={styles.subtitle}>Two ways to practise out loud.</Text>

      <View style={styles.list}>
        {MODES.map((mode, index) => (
          <Reveal key={mode.href} delay={index * 60}>
            <PressableScale
              haptic
              onPress={() => router.push(mode.href)}
              accessibilityRole="button"
              accessibilityLabel={`${mode.title}. ${mode.description}`}
              style={[styles.card, styles.shadowCard]}
            >
              <View style={[styles.iconTile, { backgroundColor: `${mode.color}26` }]}>
                <Text style={styles.emoji}>{mode.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{mode.title}</Text>
                <Text style={styles.cardDescription}>{mode.description}</Text>
              </View>
              <View style={[styles.chevronCircle, { borderColor: mode.color }]}>
                <Text style={[styles.chevron, { color: mode.color }]}>›</Text>
              </View>
            </PressableScale>
          </Reveal>
        ))}
      </View>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    shadowCard: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
    title: { fontSize: 30, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.md },
    subtitle: { fontSize: 15, color: colors.textSecondary, marginTop: spacing.xs },
    list: { gap: spacing.md, paddingVertical: spacing.lg },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      minHeight: 88,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconTile: { width: 52, height: 52, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
    emoji: { fontSize: 26 },
    cardTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
    cardDescription: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: 2 },
    chevronCircle: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    chevron: { fontSize: 20, fontWeight: '700', marginTop: -2 },
  });
