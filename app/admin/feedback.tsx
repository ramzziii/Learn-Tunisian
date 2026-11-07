import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { fetchFeedback, markFeedbackRead, type FeedbackNote } from '@/data/admin/feedback';
import { useTheme } from '@/lib/theme/ThemeContext';

/**
 * Admin → Feedback (0029): notes learners sent from Profile → Send feedback,
 * newest first — the note, the screen it came from and the app version. Who
 * sent it isn't shown. "Mark as read" clears it from Today.
 */
export default function AdminFeedback() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [notes, setNotes] = useState<FeedbackNote[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setNotes(await fetchFeedback());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (id: string) => {
    setMarkError(null);
    setMarkingId(id);
    try {
      await markFeedbackRead(id);
      setNotes((list) => list?.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)) ?? list);
    } catch (err) {
      setMarkError(`Couldn't mark it as read — ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setMarkingId(null);
    }
  };

  const unread = notes?.filter((n) => !n.readAt).length ?? 0;

  return (
    <ScreenContainer themed>
      <BackButton themed />
      <Text style={styles.title}>Feedback</Text>
      {notes ? <Text style={styles.subtitle}>{unread === 0 ? 'All read' : `${unread} unread`}</Text> : null}
      {loadError ? (
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>Couldn&apos;t load feedback</Text>
          <Button themed label="Try again" variant="secondary" onPress={load} />
        </View>
      ) : !notes ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : notes.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>No feedback yet</Text>
          <Text style={styles.meta}>Notes from Profile → Send feedback show up here.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {markError ? <Text style={styles.errorText}>{markError}</Text> : null}
          {notes.map((note) => (
            <View key={note.id} style={[styles.card, shadows.card, !note.readAt && styles.cardUnread]}>
              <Text style={styles.message}>{note.message}</Text>
              <Text style={styles.meta}>
                {new Date(note.createdAt).toLocaleString()}
                {note.screen ? ` · from ${note.screen}` : ''}
                {note.appVersion ? ` · v${note.appVersion}` : ''}
              </Text>
              {note.readAt ? (
                <Text style={styles.meta}>Read</Text>
              ) : (
                <Button themed label="Mark as read" variant="secondary" onPress={() => markRead(note.id)} loading={markingId === note.id} />
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.sm },
    list: { gap: spacing.sm, paddingVertical: spacing.md, paddingBottom: spacing.xxl },
    card: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, gap: 6 },
    cardUnread: { borderWidth: 1.5, borderColor: colors.primary },
    message: { fontSize: 15, color: colors.textPrimary, lineHeight: 21 },
    meta: { fontSize: 12, color: colors.textSecondary },
    errorText: { fontSize: 13, color: colors.error, textAlign: 'center' },
    centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    centeredTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  });
