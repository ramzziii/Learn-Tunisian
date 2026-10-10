import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PhraseDetailModal } from '@/components/phrasebook/PhraseDetailModal';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { fetchPhrasebookCategories, fetchWordGroupsForLesson } from '@/data/content';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { getViewedPhraseIds, markPhraseViewed } from '@/lib/phrasebookProgress';
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
  const [data, setData] = useState<CategoryData | null>(null);
  const [loadError, setLoadError] = useState(false);
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
      const phrases = await fetchWordGroupsForLesson(category.lessonId);
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

  if (!activeProfile || (data === null && !loadError)) return <LoadingScreen />;

  if (loadError || !data) {
    return (
      <ScreenContainer>
        <BackButton />
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>😕</Text>
          <Text style={styles.errorTitle}>Couldn&apos;t load this category</Text>
          <Button label="Try again" variant="secondary" onPress={load} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <BackButton />
      <View style={styles.headerRow}>
        <Text style={styles.title}>{data.name}</Text>
        <Text style={styles.count}>
          {viewedIds.filter((id) => data.phrases.some((p) => p.id === id)).length}/{data.phrases.length}
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {data.phrases.map((phrase, index) => {
          const variant = getPrimaryVariant(phrase);
          const isViewed = viewedIds.includes(phrase.id);
          return (
            <Reveal key={phrase.id} delay={Math.min(index * 40, 400)}>
              <PressableScale
                haptic
                onPress={() => selectPhrase(phrase)}
                style={[styles.row, isViewed && styles.rowViewed, shadows.card]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowEnglish}>{phrase.englishMeaning}</Text>
                  {variant ? <Text style={styles.rowTransliteration}>{variant.transliteration}</Text> : null}
                </View>
                {isViewed ? <Text style={styles.checkmark}>✓</Text> : null}
              </PressableScale>
            </Reveal>
          );
        })}
      </ScrollView>

      <Button label="Practice this category" onPress={() => router.push(`/lesson/${data.lessonId}`)} />

      <PhraseDetailModal phrase={selectedPhrase} track={activeProfile.track} onClose={() => setSelectedPhrase(null)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.md },
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  count: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  list: { gap: spacing.sm, paddingBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  rowViewed: { backgroundColor: '#EAF6EF' },
  rowEnglish: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  rowTransliteration: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', marginTop: 2 },
  checkmark: { fontSize: 16, color: colors.success, fontWeight: '700', marginLeft: spacing.sm },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  errorEmoji: { fontSize: 48, marginBottom: spacing.sm },
  errorTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
});
