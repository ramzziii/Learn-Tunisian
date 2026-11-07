import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AdminScreenTop, useAdminTab } from '@/components/admin/AdminScreenTop';
import { RecordingStation } from '@/components/admin/RecordingStation';
import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { fetchRecordingQueue, skipRecording, type RecordingQueueItem } from '@/data/admin/recordingQueue';
import { useEditWordFromQueue } from '@/lib/admin/useEditWordFromQueue';
import { useAuth } from '@/lib/auth/AuthContext';
import { useTheme } from '@/lib/theme/ThemeContext';

const REASON_SHORT: Record<RecordingQueueItem['reason'], string> = {
  no_audio: 'No recording',
  missing_file: 'File missing',
  not_native: 'Computer voice',
  needs_recheck: 'Re-check',
};

/** The item after `id` in list order, wrapping to the start; null if none left. */
function nextAfter(items: RecordingQueueItem[], removedIndex: number): RecordingQueueItem | null {
  if (items.length === 0) return null;
  return items[removedIndex] ?? items[0];
}

/**
 * Admin: every word form still needing a native voice. Tap one to record it;
 * after Save (or Skip) the next one comes up straight away, until every word
 * has a native voice. Skipped forms move to Skipped Recordings.
 */
export default function AdminRecordings() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { inTab } = useAdminTab();
  const { session } = useAuth();
  const actorAccountId = session?.user.id ?? '';
  const [items, setItems] = useState<RecordingQueueItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [skipError, setSkipError] = useState<string | null>(null);
  const [isSkipping, setIsSkipping] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    setItems(null);
    try {
      setItems(await fetchRecordingQueue());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const editWord = useEditWordFromQueue(fetchRecordingQueue, setItems);

  const removeCurrentAndAdvance = () => {
    if (!items || !currentId) return;
    const index = items.findIndex((i) => i.variant.id === currentId);
    const remaining = items.filter((i) => i.variant.id !== currentId);
    setItems(remaining);
    setSkipError(null);
    setCurrentId(nextAfter(remaining, index)?.variant.id ?? null);
  };

  const skip = async () => {
    if (!currentId || isSkipping) return;
    setIsSkipping(true);
    setSkipError(null);
    try {
      await skipRecording(currentId, actorAccountId);
      removeCurrentAndAdvance();
    } catch (err) {
      setSkipError(`Couldn't skip — ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setIsSkipping(false);
    }
  };

  if (loadError) {
    return (
      <ScreenContainer themed>
        <AdminScreenTop />
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>Couldn&apos;t load the recordings list</Text>
          <Button themed label="Try again" variant="secondary" onPress={load} />
        </View>
      </ScreenContainer>
    );
  }

  if (!items) {
    return (
      <ScreenContainer themed>
        <AdminScreenTop />
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (items.length === 0) {
    return (
      <ScreenContainer themed>
        <AdminScreenTop />
        <View style={styles.centered}>
          <Text style={styles.centeredEmoji}>🎉</Text>
          <Text style={styles.centeredTitle}>Every word has a native voice</Text>
          <Text style={styles.centeredBody}>Nothing left to record. Skipped words are under Skipped.</Text>
          {inTab ? null : (
            <>
              <Button themed label="Skipped" variant="secondary" onPress={() => router.push('/admin/recordings-skipped')} />
              <Button themed label="Missing explanations" variant="ghost" onPress={() => router.push('/admin/recordings-explanations')} />
            </>
          )}
        </View>
      </ScreenContainer>
    );
  }

  const current = currentId ? items.find((i) => i.variant.id === currentId) : null;

  if (current) {
    return (
      <ScreenContainer themed>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.stationHeader}>
            <Pressable onPress={() => setCurrentId(null)} hitSlop={8}>
              <Text style={styles.link}>‹ All words</Text>
            </Pressable>
            <Text style={styles.leftCount}>{items.length} left</Text>
          </View>
          {skipError ? <Text style={styles.errorText}>{skipError}</Text> : null}
          <RecordingStation
            key={current.variant.id}
            item={current}
            actorAccountId={actorAccountId}
            onSaved={removeCurrentAndAdvance}
            onSkip={skip}
            isSkipping={isSkipping}
            onEdit={() => editWord(current.variant.wordGroupId)}
          />
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer themed>
      <AdminScreenTop />
      <Text style={styles.title}>Words to record</Text>
      <Text style={styles.subtitle}>
        {items.length} {items.length === 1 ? 'word needs' : 'words need'} a native voice
      </Text>
      {inTab ? null : (
        <View style={styles.links}>
          <Pressable onPress={() => router.push('/admin/recordings-skipped')} hitSlop={8}>
            <Text style={styles.link}>Skipped ›</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/admin/recordings-explanations')} hitSlop={8}>
            <Text style={styles.link}>Missing explanations ›</Text>
          </Pressable>
        </View>
      )}
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
            <Text style={styles.reason}>{REASON_SHORT[item.reason]}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.sm },
    link: { fontSize: 14, fontWeight: '700', color: colors.primary },
    links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
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
      color: colors.error,
      backgroundColor: `${colors.error}14`,
      borderRadius: radii.pill,
      paddingVertical: 2,
      paddingHorizontal: spacing.xs,
      overflow: 'hidden',
    },
    stationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
    leftCount: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
    errorText: { fontSize: 13, color: colors.error, textAlign: 'center' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    centeredEmoji: { fontSize: 48 },
    centeredTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
    centeredBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
  });
