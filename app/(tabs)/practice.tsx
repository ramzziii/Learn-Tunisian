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
  /** Fixed identity accent — same approach as Phrasebook's CATEGORY_META. */
  color: string;
  title: string;
  subtitle: string;
  href: Parameters<typeof router.push>[0];
}

const CARDS: HubCard[] = [
  { emoji: '📖', color: '#3E7CB1', title: 'Phrasebook', subtitle: 'Real phrases for everyday situations', href: '/phrasebook' },
  { emoji: '🗂️', color: '#4A90A4', title: 'Flashcards', subtitle: 'Browse and listen to every phrase', href: '/phrasebook/flashcards' },
  { emoji: '📝', color: '#8B6BAE', title: 'Grammar Notes', subtitle: 'Tounsi patterns explained simply', href: '/grammar' },
  { emoji: '🎙️', color: '#C0567D', title: 'Speaking Practice', subtitle: 'Say 5 phrases out loud', href: '/speaking-practice' },
  { emoji: '🅰️', color: '#D9A441', title: 'Alphabet Practice', subtitle: 'Learn letters and sounds', href: '/alphabet' },
  { emoji: '🔄', color: '#4CA771', title: 'Review', subtitle: 'Keep your weak words fresh', href: '/review' },
  { emoji: '📜', color: '#B15C4A', title: 'Culture Corner', subtitle: 'Real Tunisian proverbs & sayings', href: '/culture' },
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
      <Text style={styles.eyebrow}>Sharpen your skills</Text>
      <Text style={styles.title}>Practice</Text>
      <Text style={styles.subtitle}>Everything to sharpen your Tunisian, in one place.</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {CARDS.map((card, index) => (
          <Reveal key={card.title} delay={Math.min(index * 50, 400)}>
            <PressableScale haptic onPress={() => router.push(card.href)} style={[styles.card, styles.shadowCard]}>
              <View style={[styles.iconTile, { backgroundColor: `${card.color}26` }]}>
                <Text style={styles.cardEmoji}>{card.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
              </View>
              <View style={[styles.chevronCircle, { borderColor: card.color }]}>
                <Text style={[styles.chevron, { color: card.color }]}>›</Text>
              </View>
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
    eyebrow: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginTop: spacing.md,
    },
    title: { fontSize: 30, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xs },
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
    iconTile: { width: 52, height: 52, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
    cardEmoji: { fontSize: 26 },
    cardTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
    cardSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    chevronCircle: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    chevron: { fontSize: 18, fontWeight: '700' },
  });
};
