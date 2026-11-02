import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, shadows, spacing } from '@/constants/theme';
import { fetchContentProgress, type ContentProgress, type ProgressCounts } from '@/data/admin/contentProgress';

const SHOWN_NEEDS_RECORDING = 10;
const LABEL_TEXT: Record<string, string> = { primary: 'primary', also_heard: 'also heard', masculine: 'masculine', feminine: 'feminine' };

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);
const summary = (c: ProgressCounts) =>
  `${c.words} words · ${pct(c.approved, c.words)}% approved · ${pct(c.withNativeAudio, c.words)}% with native audio · ${c.awaitingReview} awaiting review`;

/**
 * Admin dashboard → Content progress: how far the catalog is toward verified
 * words with native recordings — per unit and overall — and which approved
 * forms still need a recording (the full list, with recording, lives in
 * Native Recordings).
 */
export function ContentProgressSection() {
  const [progress, setProgress] = useState<ContentProgress | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchContentProgress()
      .then(setProgress)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <Text style={styles.error}>Couldn&apos;t load content progress.</Text>;
  if (!progress) return <ActivityIndicator style={styles.loading} color={colors.primary} />;

  return (
    <View style={[styles.card, shadows.card]}>
      <Text style={styles.overall}>{summary(progress.overall)}</Text>

      {progress.units.map((u) => (
        <View key={u.unitId} style={styles.unit}>
          <Text style={styles.unitName}>{u.isPhrasebook ? `${u.name} (Phrasebook)` : u.name}</Text>
          <Text style={styles.unitLine}>{summary(u)}</Text>
        </View>
      ))}

      <Text style={styles.subheading}>Needs recording ({progress.needsRecording.length})</Text>
      {progress.needsRecording.length === 0 ? (
        <Text style={styles.unitLine}>Every approved form has a native recording.</Text>
      ) : (
        progress.needsRecording.slice(0, SHOWN_NEEDS_RECORDING).map((n) => (
          <Text key={n.variantId} style={styles.unitLine}>
            {`${n.englishMeaning} — ${LABEL_TEXT[n.variantLabel] ?? n.variantLabel} (${n.unitName})`}
          </Text>
        ))
      )}
      {progress.needsRecording.length > SHOWN_NEEDS_RECORDING ? (
        <Text style={styles.unitLine}>…and {progress.needsRecording.length - SHOWN_NEEDS_RECORDING} more</Text>
      ) : null}
      {progress.needsRecording.length > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/admin/recordings')} style={styles.link} hitSlop={8}>
          <Text style={styles.linkText}>Record them in Native Recordings</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.lg, gap: spacing.xs },
  overall: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  unit: { paddingVertical: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  unitName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  unitLine: { fontSize: 12, color: colors.textSecondary },
  subheading: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  link: { marginTop: spacing.sm, alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  linkText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  error: { fontSize: 13, color: colors.error, marginBottom: spacing.lg },
  loading: { marginBottom: spacing.lg },
});
