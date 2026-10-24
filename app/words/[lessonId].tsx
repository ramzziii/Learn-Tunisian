import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { PremiumGate } from '@/components/premium/Premium';
import { BackButton } from '@/components/ui/BackButton';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';
import { fetchAccessibleLessonWordGroups } from '@/data/premiumAccess';
import { fetchFavoriteWordGroupIds } from '@/data/favorites';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { usePremium } from '@/lib/premium/PremiumContext';
import { PremiumRequiredError } from '@/lib/premium/access';
import { getPrimaryVariant, getMasculineVariant } from '@/lib/wordVariants';
import type { WordGroupWithVariants } from '@/types/models';

export default function LessonWordList() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const { activeProfile } = useActiveProfile();
  const [groups, setGroups] = useState<WordGroupWithVariants[] | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [isPremiumLocked, setIsPremiumLocked] = useState(false);
  const { isPremium, isResolved } = usePremium();

  useEffect(() => {
    if (!activeProfile || !lessonId || !isResolved) return;
    setIsPremiumLocked(false);
    (async () => {
      try {
        const [lessonGroups, favorites] = await Promise.all([
          fetchAccessibleLessonWordGroups(lessonId, isPremium),
          fetchFavoriteWordGroupIds(activeProfile.id),
        ]);
        setGroups(lessonGroups);
        setFavoriteIds(favorites);
      } catch (error) {
        if (error instanceof PremiumRequiredError) setIsPremiumLocked(true);
        else throw error;
      }
    })();
  }, [activeProfile, lessonId, isPremium, isResolved]);

  if (isPremiumLocked) {
    return (
      <PremiumGate
        title="These words are part of Premium"
        message="Your free plan includes the first lesson's words. Upgrade to browse every lesson."
      />
    );
  }

  if (!groups) return <LoadingScreen themed />;

  return (
    <ScreenContainer themed>
      <BackButton themed />
      <Text style={styles.eyebrow}>Lesson words</Text>
      <Text style={styles.title}>Words in this lesson</Text>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.lg }}
        renderItem={({ item, index }) => {
          const display = getPrimaryVariant(item) ?? getMasculineVariant(item) ?? item.variants[0];
          return (
            <Reveal delay={Math.min(index * 40, 320)}>
              <PressableScale haptic style={[styles.row, shadows.card]} onPress={() => router.push(`/word/${item.id}`)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.arabic}>{display?.wordArabic}</Text>
                  <Text style={styles.meaning}>{item.englishMeaning}</Text>
                </View>
                {favoriteIds.has(item.id) ? <Text style={styles.star}>⭐</Text> : null}
                <Text style={styles.chevron}>›</Text>
              </PressableScale>
            </Reveal>
          );
        }}
      />
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    eyebrow: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginTop: spacing.md,
    },
    title: { fontSize: 30, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xs },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
    },
    arabic: { fontSize: 20, color: colors.textPrimary, fontWeight: '600' },
    meaning: { fontSize: 13, color: colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
    star: { fontSize: 16 },
    chevron: { fontSize: 22, color: colors.textSecondary },
  });
