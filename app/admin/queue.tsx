import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { StatusBadge } from '@/components/admin/StatusBadge';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { listWordGroupsNeedingReview, type WordGroupNeedingReview } from '@/data/admin/content';

export default function AdminQueue() {
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
      <ScreenContainer>
        <BackButton />
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>Couldn&apos;t load the queue</Text>
          <Button label="Try again" variant="secondary" onPress={load} />
        </View>
      </ScreenContainer>
    );
  }

  if (items === null) return <LoadingScreen />;

  return (
    <ScreenContainer>
      <BackButton />
      <Text style={styles.title}>Approval Queue</Text>
      <Text style={styles.subtitle}>Every word group that isn&apos;t live yet — draft, pending review, or rejected.</Text>

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

const styles = StyleSheet.create({
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
