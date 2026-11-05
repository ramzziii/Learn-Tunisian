import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AdminScreenTop } from '@/components/admin/AdminScreenTop';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { listWordGroupsNeedingReview, type WordGroupNeedingReview } from '@/data/admin/content';
import { useTheme } from '@/lib/theme/ThemeContext';

export default function AdminQueue() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [items, setItems] = useState<WordGroupNeedingReview[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setItems(await listWordGroupsNeedingReview());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return (
      <ScreenContainer themed>
        <AdminScreenTop />
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>Couldn&apos;t load the queue</Text>
          <Button themed label="Try again" variant="secondary" onPress={load} />
        </View>
      </ScreenContainer>
    );
  }

  if (items === null) return <LoadingScreen />;

  return (
    <ScreenContainer themed>
      <AdminScreenTop />
      <Text style={styles.title}>Waiting for review</Text>
      <Text style={styles.subtitle}>Words and phrases that aren&apos;t live yet — waiting for review, or rejected.</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {items.length === 0 ? (
          <Text style={styles.emptyText}>Nothing needs attention right now. 🎉</Text>
        ) : (
          items.map(({ wordGroup, unitName, lessonId }) => (
            <PressableScale
              key={wordGroup.id}
              disabled={!lessonId}
              onPress={() =>
                router.push({ pathname: '/admin/word-groups/[wordGroupId]', params: { wordGroupId: wordGroup.id } })
              }
              style={[styles.row, shadows.card]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{wordGroup.englishMeaning}</Text>
                <Text style={styles.rowMeta}>{unitName} · lesson {wordGroup.lessonNumber}</Text>
              </View>
              <StatusBadge status={wordGroup.contentStatus} />
            </PressableScale>
          ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
    subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.md },
    list: { gap: spacing.sm, paddingBottom: spacing.xl },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    rowTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    rowMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    centeredTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  });
