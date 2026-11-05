import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { AccessCheckProblem, AccessLimitScreen } from '@/components/access/AccessLimit';
import { BackButton } from '@/components/ui/BackButton';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';
import { fetchWordGroupsForLesson } from '@/data/content';
import { fetchFavoriteWordGroupIds } from '@/data/favorites';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { useLessonAccess } from '@/lib/access/useLessonAccess';
import { preferredVariant } from '@/lib/display/displayRules';
import { useDisplayPreferences } from '@/lib/display/useDisplayPreferences';
import { TunisianText } from '@/components/tunisian/TunisianText';
import type { WordGroupWithVariants } from '@/types/models';

export default function LessonWordList() {
  const { colors } = useTheme();
  const { preferences: display } = useDisplayPreferences();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const { activeProfile } = useActiveProfile();
  const [groups, setGroups] = useState<WordGroupWithVariants[] | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const access = useLessonAccess(lessonId);

  useEffect(() => {
    if (!activeProfile || !lessonId || access.status !== 'open') return;
    (async () => {
      const [lessonGroups, favorites] = await Promise.all([
        fetchWordGroupsForLesson(lessonId),
        fetchFavoriteWordGroupIds(activeProfile.id),
      ]);
      setGroups(lessonGroups);
      setFavoriteIds(favorites);
    })();
  }, [activeProfile, lessonId, access.status]);

  if (access.status === 'limit') return <AccessLimitScreen feature={access.target?.feature ?? 'lesson'} />;
  if (access.status === 'missing' || access.status === 'error') {
    return <AccessCheckProblem kind={access.status} onRetry={access.retry} />;
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
          const shown = preferredVariant(item, display.form);
          return (
            <Reveal delay={Math.min(index * 40, 320)}>
              <PressableScale haptic style={[styles.row, shadows.card]} onPress={() => router.push(`/word/${item.id}`)}>
                <View style={{ flex: 1 }}>
                  <TunisianText arabic={shown?.wordArabic} latin={shown?.transliteration} layout="inline" arabicStyle={styles.arabic} latinStyle={styles.meaning} />
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
