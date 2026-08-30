import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { fetchWordGroupsForLesson } from '@/data/content';
import { fetchFavoriteWordGroupIds } from '@/data/favorites';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { getPrimaryVariant, getMasculineVariant } from '@/lib/wordVariants';
import type { WordGroupWithVariants } from '@/types/models';

export default function LessonWordList() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const { activeProfile } = useActiveProfile();
  const [groups, setGroups] = useState<WordGroupWithVariants[] | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!activeProfile || !lessonId) return;
    (async () => {
      const [lessonGroups, favorites] = await Promise.all([
        fetchWordGroupsForLesson(lessonId),
        fetchFavoriteWordGroupIds(activeProfile.id),
      ]);
      setGroups(lessonGroups);
      setFavoriteIds(favorites);
    })();
  }, [activeProfile, lessonId]);

  if (!groups) return <LoadingScreen />;

  return (
    <ScreenContainer>
      <BackButton />
      <Text style={styles.title}>Words in this lesson</Text>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.lg }}
        renderItem={({ item }) => {
          const display = getPrimaryVariant(item) ?? getMasculineVariant(item) ?? item.variants[0];
          return (
            <PressableScale
              style={[styles.row, shadows.card]}
              onPress={() => router.push(`/word/${item.id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.arabic}>{display?.wordArabic}</Text>
                <Text style={styles.meaning}>{item.englishMeaning}</Text>
              </View>
              {favoriteIds.has(item.id) ? <Text style={styles.star}>⭐</Text> : null}
              <Text style={styles.chevron}>›</Text>
            </PressableScale>
          );
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
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
