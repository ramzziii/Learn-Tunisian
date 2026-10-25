import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RecordingStation } from '@/components/admin/RecordingStation';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { fetchSkippedRecordings, restoreSkippedRecording, type RecordingQueueItem } from '@/data/admin/recordingQueue';
import { useAuth } from '@/lib/auth/AuthContext';

/**
 * Admin: word forms that were skipped in Native Recordings and still have no
 * native voice. Record one here (saving clears the skip, then the next
 * skipped word comes up), or put it back on the Native Recordings list.
 */
export default function AdminSkippedRecordings() {
  const { session } = useAuth();
  const actorAccountId = session?.user.id ?? '';
  const [items, setItems] = useState<RecordingQueueItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    setItems(null);
    try {
      setItems(await fetchSkippedRecordings());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = (id: string) => {
    if (!items) return;
    const index = items.findIndex((i) => i.variant.id === id);
    const remaining = items.filter((i) => i.variant.id !== id);
    setItems(remaining);
    return remaining[index] ?? remaining[0] ?? null;
  };

  const putBack = async (id: string) => {
    setRowError(null);
    setRestoringId(id);
    try {
      await restoreSkippedRecording(id, actorAccountId);
      remove(id);
    } catch (err) {
      setRowError(`Couldn't put it back — ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setRestoringId(null);
    }
  };

  if (loadError) {
    return (
      <ScreenContainer>
        <BackButton />
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>Couldn&apos;t load skipped recordings</Text>
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

  const current = currentId ? items.find((i) => i.variant.id === currentId) : null;

  if (current) {
    return (
      <ScreenContainer>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.stationHeader}>
            <Pressable onPress={() => setCurrentId(null)} hitSlop={8}>
              <Text style={styles.link}>‹ Skipped words</Text>
            </Pressable>
            <Text style={styles.leftCount}>{items.length} left</Text>
          </View>
          <RecordingStation
            key={current.variant.id}
            item={current}
            actorAccountId={actorAccountId}
            onSaved={() => setCurrentId(remove(current.variant.id)?.variant.id ?? null)}
          />
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <BackButton />
      <Text style={styles.title}>Skipped Recordings</Text>
      {items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>No skipped words</Text>
          <Text style={styles.centeredBody}>Words you skip in Native Recordings show up here.</Text>
        </View>
      ) : (
        <>
          <Text style={styles.subtitle}>
            {items.length} skipped {items.length === 1 ? 'word' : 'words'} without a recording
          </Text>
          {rowError ? <Text style={styles.errorText}>{rowError}</Text> : null}
          <ScrollView contentContainerStyle={styles.list}>
            {items.map((item) => (
              <View key={item.variant.id} style={[styles.row, shadows.card]}>
                <View style={styles.rowHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowMeaning}>{item.englishMeaning}</Text>
                    <Text style={styles.rowSub}>
                      {item.variant.transliteration} · {item.variant.variantLabel.replace('_', ' ')}
                    </Text>
                  </View>
                  <Text style={styles.rowArabic}>{item.variant.wordArabic}</Text>
                </View>
                <View style={styles.actions}>
                  <View style={styles.cell}>
                    <Button
                      label="Put back"
                      variant="ghost"
                      onPress={() => putBack(item.variant.id)}
                      loading={restoringId === item.variant.id}
                    />
                  </View>
                  <View style={styles.cell}>
                    <Button label="Record" variant="secondary" onPress={() => setCurrentId(item.variant.id)} />
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.sm },
  link: { fontSize: 14, fontWeight: '700', color: colors.primary },
  list: { gap: spacing.sm, paddingVertical: spacing.md, paddingBottom: spacing.xxl },
  scroll: { gap: spacing.md, paddingBottom: spacing.xxl },
  row: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowMeaning: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  rowArabic: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  actions: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1, minWidth: 0 },
  stationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  leftCount: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  errorText: { fontSize: 13, color: colors.error, textAlign: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  centeredTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  centeredBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
});
