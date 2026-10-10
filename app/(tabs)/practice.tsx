import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';

interface HubCard {
  emoji: string;
  title: string;
  subtitle: string;
  href: Parameters<typeof router.push>[0];
}

const CARDS: HubCard[] = [
  { emoji: '📖', title: 'Phrasebook', subtitle: 'Real phrases for everyday situations', href: '/phrasebook' },
  { emoji: '🗂️', title: 'Flashcards', subtitle: 'Browse and listen to every phrase', href: '/phrasebook/flashcards' },
  { emoji: '📝', title: 'Grammar Notes', subtitle: 'Tounsi patterns explained simply', href: '/grammar' },
  { emoji: '🎙️', title: 'Speaking Practice', subtitle: 'Say 5 phrases out loud', href: '/speaking-practice' },
  { emoji: '🅰️', title: 'Alphabet Practice', subtitle: 'Learn letters and sounds', href: '/alphabet' },
  { emoji: '🔄', title: 'Review', subtitle: 'Keep your weak words fresh', href: '/review' },
  { emoji: '📜', title: 'Culture Corner', subtitle: 'Real Tunisian proverbs & sayings', href: '/culture' },
];

/**
 * Every standalone practice/reference feature, one destination — this is a
 * real tab now (see app/(tabs)/_layout.tsx). Fully converted to the live
 * theme system.
 */
export default function PracticeHubScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <ScreenContainer themed>
      <Text style={styles.title}>Practice</Text>
      <Text style={styles.subtitle}>Everything to sharpen your Tunisian, in one place.</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {CARDS.map((card, index) => (
          <Reveal key={card.title} delay={Math.min(index * 50, 400)}>
            <PressableScale haptic onPress={() => router.push(card.href)} style={[styles.card, styles.shadowCard]}>
              <Text style={styles.cardEmoji}>{card.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </PressableScale>
          </Reveal>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) => {
  const shadowCard = { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 };

  return StyleSheet.create({
    shadowCard,
    title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg, lineHeight: 20 },
    list: { gap: spacing.md, paddingBottom: spacing.xxl },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
    },
    cardEmoji: { fontSize: 30 },
    cardTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
    cardSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    chevron: { fontSize: 28, color: colors.textSecondary },
  });
};
