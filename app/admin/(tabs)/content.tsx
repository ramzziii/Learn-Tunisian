import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AnalyticsOverview } from '@/components/admin/AnalyticsOverview';
import { ContentProgressSection } from '@/components/admin/ContentProgressSection';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { listUnitsAdmin } from '@/data/admin/content';
import { fetchLinkCandidatesAdmin } from '@/data/admin/phraseWords';
import { buildSearchIndex, searchWords } from '@/lib/search/searchIndex';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { Unit, WordGroupWithVariants } from '@/types/models';

const SEARCH_RESULTS = 20;

/**
 * Admin → Content: search every word and phrase (English, Arabic or Latin),
 * the course (units → lessons → words) and the Phrasebook (categories →
 * phrases) listed separately, and the reports (content progress, analytics).
 */
export default function AdminContentTab() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [words, setWords] = useState<WordGroupWithVariants[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    setLoadError(false);
    Promise.all([listUnitsAdmin(), fetchLinkCandidatesAdmin()])
      .then(([u, w]) => {
        setUnits(u);
        setWords(w);
      })
      .catch(() => setLoadError(true));
  }, []);
  // Reload on return, so edits made in a unit or word show up here.
  useFocusEffect(load);

  const index = useMemo(() => buildSearchIndex(words ?? []), [words]);
  const results = query.trim() ? searchWords(index, query, SEARCH_RESULTS) : [];
  const course = (units ?? []).filter((u) => u.isCurriculum);
  const phrasebook = (units ?? []).filter((u) => !u.isCurriculum);

  const unitRow = (u: Unit) => (
    <PressableScale
      key={u.id}
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/admin/units/[unitId]', params: { unitId: u.id } })}
      style={[styles.row, shadows.card]}
    >
      <Text style={styles.rowTitle}>{u.name}</Text>
      <Text style={styles.chevron}>›</Text>
    </PressableScale>
  );

  return (
    <ScreenContainer themed>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title} accessibilityRole="header">
          Content
        </Text>

        <TextInput
          accessibilityLabel="Search all words and phrases"
          placeholder="Search all words and phrases (English, عربي or Latin)"
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.search}
        />
        {loadError ? (
          <View style={styles.problem}>
            <Text style={styles.muted}>Couldn&apos;t load the content.</Text>
            <Button themed label="Try again" variant="secondary" onPress={load} />
          </View>
        ) : !units || !words ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
        ) : query.trim() ? (
          results.length === 0 ? (
            <Text style={styles.muted}>Nothing matches.</Text>
          ) : (
            results.map(({ group }) => {
              const form = group.variants.find((v) => v.variantLabel === 'primary') ?? group.variants[0];
              return (
                <PressableScale
                  key={group.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${group.englishMeaning}`}
                  onPress={() => router.push({ pathname: '/admin/word-groups/[wordGroupId]', params: { wordGroupId: group.id } })}
                  style={[styles.row, shadows.card]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{group.englishMeaning}</Text>
                    <Text style={styles.muted}>{`${form?.transliteration ?? ''} · ${form?.wordArabic ?? ''}`}</Text>
                  </View>
                  <StatusBadge status={group.contentStatus} />
                </PressableScale>
              );
            })
          )
        ) : (
          <>
            <Text style={styles.heading} accessibilityRole="header">
              Course units
            </Text>
            {course.map(unitRow)}
            <Text style={styles.heading} accessibilityRole="header">
              Phrasebook categories
            </Text>
            {phrasebook.map(unitRow)}
            <Button themed label="Add a unit or category" variant="secondary" onPress={() => router.push('/admin/units')} />

            <Text style={styles.heading} accessibilityRole="header">
              Content progress
            </Text>
            <ContentProgressSection />
            <Text style={styles.heading} accessibilityRole="header">
              Learners &amp; learning
            </Text>
            <AnalyticsOverview />
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scroll: { gap: spacing.sm, paddingBottom: spacing.xxl },
    title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.sm },
    heading: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.lg },
    search: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 16,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, minHeight: 52 },
    rowTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    chevron: { fontSize: 20, color: colors.textSecondary },
    muted: { fontSize: 13, color: colors.textSecondary },
    problem: { gap: spacing.sm, marginTop: spacing.md },
  });
