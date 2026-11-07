import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AdminScreenTop } from '@/components/admin/AdminScreenTop';
import { RecordingStation } from '@/components/admin/RecordingStation';
import { Button } from '@/components/ui/Button';
import { ComputerVoiceNote } from '@/components/ui/ComputerVoiceNote';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { confirmAudioMatches, confirmErrorMessage, fetchRecheckQueue, type RecordingQueueItem } from '@/data/admin/recordingQueue';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import { useEditWordFromQueue } from '@/lib/admin/useEditWordFromQueue';
import { useAuth } from '@/lib/auth/AuthContext';
import { useTheme } from '@/lib/theme/ThemeContext';

/**
 * Admin → Audio → Re-check (0028): recordings whose word was respelled after
 * they were recorded. Learners don't hear them meanwhile. Listen, then either
 * "Still matches" (confirm_audio_matches — admins and reviewers) or record a
 * new one (a new file clears the flag by itself). The file is never deleted.
 */
export default function AdminRecheckRecordings() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { session } = useAuth();
  const actorAccountId = session?.user.id ?? '';
  const [items, setItems] = useState<RecordingQueueItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    setItems(null);
    try {
      setItems(await fetchRecheckQueue());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const editWord = useEditWordFromQueue(fetchRecheckQueue, setItems);

  const remove = (id: string) => {
    if (!items) return null;
    const index = items.findIndex((i) => i.variant.id === id);
    const remaining = items.filter((i) => i.variant.id !== id);
    setItems(remaining);
    return remaining[index] ?? remaining[0] ?? null;
  };

  const stillMatches = async (id: string) => {
    setRowError(null);
    setConfirmingId(id);
    try {
      await confirmAudioMatches(id);
      remove(id);
    } catch (err) {
      setRowError(confirmErrorMessage(err));
    } finally {
      setConfirmingId(null);
    }
  };

  if (loadError) {
    return (
      <ScreenContainer themed>
        <AdminScreenTop />
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>Couldn&apos;t load recordings to re-check</Text>
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

  const current = currentId ? items.find((i) => i.variant.id === currentId) : null;

  if (current) {
    return (
      <ScreenContainer themed>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.stationHeader}>
            <Pressable onPress={() => setCurrentId(null)} hitSlop={8} accessibilityRole="button">
              <Text style={styles.link}>‹ Re-check list</Text>
            </Pressable>
            <Text style={styles.leftCount}>{items.length} left</Text>
          </View>
          <RecordingStation
            key={current.variant.id}
            item={current}
            actorAccountId={actorAccountId}
            onSaved={() => setCurrentId(remove(current.variant.id)?.variant.id ?? null)}
            onEdit={() => editWord(current.variant.wordGroupId)}
          />
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer themed>
      <AdminScreenTop />
      <Text style={styles.title}>Re-check</Text>
      {items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>Nothing to re-check</Text>
          <Text style={styles.centeredBody}>When a word&apos;s spelling changes, its recording shows up here until someone listens.</Text>
        </View>
      ) : (
        <>
          <Text style={styles.subtitle}>
            The spelling changed after these were recorded. Learners don&apos;t hear them until you check.
          </Text>
          {rowError ? <Text style={styles.errorText}>{rowError}</Text> : null}
          <ScrollView contentContainerStyle={styles.list}>
            {items.map((item) => (
              <View key={item.variant.id} style={[styles.row, shadows.card]}>
                <View style={styles.rowHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowMeaning}>{item.englishMeaning}</Text>
                    <Text style={styles.rowSub}>
                      Now spelled: {item.variant.transliteration} · {item.variant.variantLabel.replace('_', ' ')}
                    </Text>
                  </View>
                  <Text style={styles.rowArabic}>{item.variant.wordArabic}</Text>
                </View>
                <ListenButton item={item} colors={colors} />
                <View style={styles.actions}>
                  <View style={styles.cell}>
                    <Button
                      themed
                      label="✓ Still matches"
                      variant="secondary"
                      onPress={() => stillMatches(item.variant.id)}
                      loading={confirmingId === item.variant.id}
                    />
                  </View>
                  <View style={styles.cell}>
                    <Button themed label="Record a new one" variant="ghost" onPress={() => setCurrentId(item.variant.id)} />
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

/** The current recording, as it is (admins hear it; learners don't until it's confirmed). */
function ListenButton({ item, colors }: { item: RecordingQueueItem; colors: ThemeColors }) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const audio = useWordAudioPlayer(item.variant);
  return (
    <View style={styles.listenRow}>
      <Pressable
        onPress={audio.play}
        disabled={!audio.hasAudio || audio.isResolving}
        accessibilityRole="button"
        accessibilityLabel={`Listen to the recording of ${item.englishMeaning}`}
        style={styles.listen}
      >
        <Text style={styles.listenText}>{audio.isResolving ? 'Loading…' : audio.isPlaying ? '🔊 Playing…' : '▶ Listen'}</Text>
      </Pressable>
      {audio.source === 'computer' ? <ComputerVoiceNote /> : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
    listenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    listen: {
      minHeight: 40,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      backgroundColor: `${colors.primary}14`,
      justifyContent: 'center',
    },
    listenText: { fontSize: 14, fontWeight: '700', color: colors.primary },
    actions: { flexDirection: 'row', gap: spacing.sm },
    cell: { flex: 1, minWidth: 0 },
    stationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
    leftCount: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
    errorText: { fontSize: 13, color: colors.error, textAlign: 'center' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    centeredTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
    centeredBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  });
