import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PhraseDetailModal } from '@/components/phrasebook/PhraseDetailModal';
import { PremiumGate } from '@/components/premium/Premium';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { fetchPhrasebookCategories } from '@/data/content';
import { canAccessPhrasebookCategory, fetchAccessibleLessonWordGroups } from '@/data/premiumAccess';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { getViewedPhraseIds, markPhraseViewed } from '@/lib/phrasebookProgress';
import { useTheme } from '@/lib/theme/ThemeContext';
import { getPrimaryVariant } from '@/lib/wordVariants';
import type { WordGroupWithVariants } from '@/types/models';

interface CategoryData {
  name: string;
  lessonId: string;
  phrases: WordGroupWithVariants[];
}

export default function PhrasebookCategoryScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const { activeProfile } = useActiveProfile();
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [data, setData] = useState<CategoryData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [isPremiumLocked, setIsPremiumLocked] = useState(false);
  const [viewedIds, setViewedIds] = useState<string[]>([]);
  const [selectedPhrase, setSelectedPhrase] = useState<WordGroupWithVariants | null>(null);

  const load = useCallback(async () => {
    if (!categoryId || !activeProfile) return;
    setLoadError(false);
    try {
      const [categories, viewed] = await Promise.all([
        fetchPhrasebookCategories(),
        getViewedPhraseIds(activeProfile.id),
      ]);
      const category = categories.find((c) => c.unitId === categoryId);
      if (!category) {
        // Most likely cause: 0007_phrasebook_content.sql hasn't been run
        // against this Supabase project yet, so fetchPhrasebookCategories()
        // returned an empty/different list and this unitId matches nothing.
        console.error(
          `Phrasebook category "${categoryId}" not found among ${categories.length} loaded categories — ` +
            'has supabase/migrations/0007_phrasebook_content.sql been run against this project?'
        );
        setLoadError(true);
        return;
      }
      // Checked before the category's phrases are fetched, so a direct link
      // to a locked category never loads them.
      if (!canAccessPhrasebookCategory(activeProfile.isPremium, category.unitId, categories)) {
        setIsPremiumLocked(true);
        return;
      }
      const phrases = await fetchAccessibleLessonWordGroups(category.lessonId, activeProfile.isPremium);
      setData({ name: category.name, lessonId: category.lessonId, phrases });
      setViewedIds(viewed);
    } catch (error) {
      console.error('Failed to load phrasebook category', categoryId, error);
      setLoadError(true);
    }
  }, [categoryId, activeProfile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const selectPhrase = (phrase: WordGroupWithVariants) => {
    setSelectedPhrase(phrase);
    if (!activeProfile || viewedIds.includes(phrase.id)) return;
    setViewedIds((prev) => [...prev, phrase.id]);
    markPhraseViewed(activeProfile.id, phrase.id);
  };

  if (isPremiumLocked) {
    return (
      <PremiumGate
        title="This category is part of Premium"
        message="Your free plan includes the Greetings phrasebook. Upgrade to unlock every category."
      />
    );
  }

  if (!activeProfile || (data === null && !loadError)) return <LoadingScreen themed />;

  if (loadError || !data) {
    return (
      <ScreenContainer themed>
        <BackButton themed />
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>😕</Text>
          <Text style={styles.errorTitle}>Couldn&apos;t load this category</Text>
          <Button themed label="Try again" variant="secondary" onPress={load} />
        </View>
      </ScreenContainer>
    );
  }

  const viewedCount = viewedIds.filter((id) => data.phrases.some((p) => p.id === id)).length;
  const progress = data.phrases.length > 0 ? viewedCount / data.phrases.length : 0;

  return (
    <ScreenContainer themed style={{ padding: 0 }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <BackButton themed />
          <Text style={styles.title}>{data.name}</Text>
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <ProgressBar themed progress={progress} gradientColors={gradients.primary} />
            </View>
            <Text style={styles.count}>
              {viewedCount}/{data.phrases.length}
            </Text>
          </View>
        </View>

        <View style={styles.list}>
          {data.phrases.map((phrase, index) => {
            const variant = getPrimaryVariant(phrase);
            const isViewed = viewedIds.includes(phrase.id);
            const hasRealAudio = !!variant?.audioPath;
            return (
              <Reveal key={phrase.id} delay={Math.min(index * 40, 400)}>
                <PressableScale
                  haptic
                  onPress={() => selectPhrase(phrase)}
                  style={[styles.row, isViewed && styles.rowViewed, styles.shadowCard]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowEnglish}>{phrase.englishMeaning}</Text>
                    {variant ? <Text style={styles.rowTransliteration}>{variant.transliteration}</Text> : null}
                  </View>
                  {hasRealAudio ? (
                    <View style={styles.audioBadge}>
                      <Text style={styles.audioBadgeIcon}>🔊</Text>
                    </View>
                  ) : null}
                  {isViewed ? (
                    <View style={styles.checkCircle}>
                      <Text style={styles.checkmark}>✓</Text>
                    </View>
                  ) : (
                    <Text style={styles.chevron}>›</Text>
                  )}
                </PressableScale>
              </Reveal>
            );
          })}
        </View>

        <Button
          themed
          label="Practice this category"
          onPress={() => router.push(`/lesson/${data.lessonId}`)}
          style={styles.ctaButton}
        />
      </ScrollView>

      <PhraseDetailModal phrase={selectedPhrase} track={activeProfile.track} onClose={() => setSelectedPhrase(null)} />
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    shadowCard: {
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
    header: { marginBottom: spacing.lg },
    title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.sm },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
    progressTrack: { flex: 1 },
    count: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, minWidth: 36, textAlign: 'right' },
    list: { gap: spacing.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
    },
    rowViewed: { backgroundColor: `${colors.success}14` },
    rowEnglish: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
    rowTransliteration: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', marginTop: 2 },
    audioBadge: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: `${colors.primary}1F`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    audioBadgeIcon: { fontSize: 12 },
    checkCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.success,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkmark: { fontSize: 12, color: colors.textOnPrimary, fontWeight: '700' },
    chevron: { fontSize: 18, color: colors.textSecondary },
    ctaButton: { marginTop: spacing.lg },
    errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    errorEmoji: { fontSize: 48, marginBottom: spacing.sm },
    errorTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  });
