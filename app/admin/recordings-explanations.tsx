import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RecordingStation } from '@/components/admin/RecordingStation';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { fetchMissingExplanations, type ExplanationQueueItem } from '@/data/admin/recordingQueue';
import { useAuth } from '@/lib/auth/AuthContext';

/** The item at `index` after one was removed, wrapping to the start; null if none left. */
function nextAt(items: ExplanationQueueItem[], index: number): ExplanationQueueItem | null {
  if (items.length === 0) return null;
  return items[index] ?? items[0];
}

/**
 * Native Recordings → Missing Explanations: words that already have a
 * pronunciation recording but no explanation recording. Tap one to add an
 * explanation (record or upload); after saving, the next one comes up.
 * Skip only moves on — explanations are optional, so nothing is stored.
 */
export default function AdminMissingExplanations() {
  const { session } = useAuth();
  const actorAccountId = session?.user.id ?? '';
  const [items, setItems] = useState<ExplanationQueueItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    setItems(null);
    try {
      setItems(await fetchMissingExplanations());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const advance = (dropCurrent: boolean) => {
    if (!items || !currentId) return;
    const index = items.findIndex((i) => i.variant.id === currentId);
    if (dropCurrent) {
      const remaining = items.filter((i) => i.variant.id !== currentId);
      setItems(remaining);
      setCurrentId(nextAt(remaining, index)?.variant.id ?? null);
    } else {
      setCurrentId(items.length > 1 ? (items[index + 1] ?? items[0]).variant.id : null);
    }
  };

  if (loadError) {
    return (
      <ScreenContainer>
        <BackButton />
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>Couldn&apos;t load the list</Text>
          <Button label="Try again" variant="secondary" onPress={load} />
        </View>
      </ScreenContainer>
    );
  }

  if (!items) {
    return (
      <ScreenContainer>
        <BackButton />
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (items.length === 0) {
    return (
      <ScreenContainer>
        <BackButton />
        <View style={styles.centered}>
          <Text style={styles.centeredEmoji}>🎉</Text>
          <Text style={styles.centeredTitle}>Every recorded word has an explanation</Text>
        </View>
      </ScreenContainer>
    );
  }

  const current = currentId ? items.find((i) => i.variant.id === currentId) : null;

  if (current) {
    return (
      <ScreenContainer>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.stationHeader}>
            <Pressable onPress={() => setCurrentId(null)} hitSlop={8}>
              <Text style={styles.link}>‹ All words</Text>
            </Pressable>
            <Text style={styles.leftCount}>{items.length} left</Text>
          </View>
          <RecordingStation
            key={current.variant.id}
            mode="explanation"
            item={current}
            actorAccountId={actorAccountId}
            onSaved={() => advance(true)}
            onSkip={() => advance(false)}
          />
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <BackButton />
      <Text style={styles.title}>Missing Explanations</Text>
      <Text style={styles.subtitle}>
        {items.length} {items.length === 1 ? 'word has' : 'words have'} no explanation recording yet. Explanations are
        optional — a native speaker explaining the word in English, Arabic, or both.
      </Text>
      <ScrollView contentContainerStyle={styles.list}>
        {items.map((item) => (
          <Pressable
            key={item.variant.id}
            onPress={() => setCurrentId(item.variant.id)}
            style={({ pressed }) => [styles.row, shadows.card, pressed && styles.rowPressed]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowMeaning}>{item.englishMeaning}</Text>
              <Text style={styles.rowSub}>
                {item.variant.transliteration} · {item.variant.variantLabel.replace('_', ' ')}
              </Text>
            </View>
            <Text style={styles.rowArabic}>{item.variant.wordArabic}</Text>
            <Text style={styles.reason}>No explanation</Text>
          </Pressable>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.sm },
  link: { fontSize: 14, fontWeight: '700', color: colors.primary },
  list: { gap: spacing.sm, paddingVertical: spacing.md, paddingBottom: spacing.xxl },
  scroll: { gap: spacing.md, paddingBottom: spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  rowPressed: { opacity: 0.7 },
  rowMeaning: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  rowArabic: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  reason: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    backgroundColor: `${colors.textSecondary}14`,
    borderRadius: radii.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
    overflow: 'hidden',
  },
  stationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  leftCount: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  centeredEmoji: { fontSize: 48 },
  centeredTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
});
