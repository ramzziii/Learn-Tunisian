import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { fetchContentProgress, type ContentProgress, type UnitProgress } from '@/data/admin/contentProgress';
import { useTheme } from '@/lib/theme/ThemeContext';

const SHOWN_NEEDS_RECORDING = 5;
const LABEL_TEXT: Record<string, string> = { primary: 'primary', also_heard: 'also heard', masculine: 'masculine', feminine: 'feminine' };

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

/**
 * Admin → Content → Content progress: how far the catalog is toward live
 * words with native recordings. Four tiles for the whole catalog, then each
 * course unit and Phrasebook category with a native-audio bar (tap to open
 * it), then the first forms that still need a recording, with a way into
 * Audio, where the full list is recorded.
 */
export function ContentProgressSection() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [progress, setProgress] = useState<ContentProgress | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchContentProgress()
      .then(setProgress)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <Text style={styles.error}>Couldn&apos;t load content progress.</Text>;
  if (!progress) return <ActivityIndicator style={styles.loading} color={colors.primary} />;

  const { overall, needsRecording } = progress;
  const course = progress.units.filter((u) => !u.isPhrasebook);
  const phrasebook = progress.units.filter((u) => u.isPhrasebook);

  const tiles = [
    { label: 'Words', value: String(overall.words), color: colors.textPrimary },
    { label: 'Live', value: `${pct(overall.approved, overall.words)}%`, color: colors.success },
    { label: 'Native audio', value: `${pct(overall.withNativeAudio, overall.words)}%`, color: colors.primary },
    {
      label: 'Waiting for review',
      value: String(overall.awaitingReview),
      color: overall.awaitingReview > 0 ? colors.accent : colors.textPrimary,
    },
  ];

  const unitRow = (u: UnitProgress, index: number) => {
    const audio = pct(u.withNativeAudio, u.words);
    const live = pct(u.approved, u.words);
    return (
      <Pressable
        key={u.unitId}
        accessibilityRole="button"
        accessibilityLabel={`${u.name}: ${u.words} words, ${live}% live, ${audio}% with native audio, ${u.awaitingReview} waiting for review`}
        onPress={() => router.push({ pathname: '/admin/units/[unitId]', params: { unitId: u.unitId } })}
        style={[styles.unitRow, index > 0 && styles.divider]}
      >
        <View style={styles.unitTop}>
          <Text style={styles.unitName} numberOfLines={1}>
            {u.name}
          </Text>
          <Text style={styles.unitWords}>{u.words} words</Text>
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${audio}%` }]} />
        </View>
        <View style={styles.unitFacts}>
          <Text style={styles.fact}>{audio}% native audio</Text>
          {live < 100 ? <Text style={styles.fact}>{live}% live</Text> : null}
          {u.awaitingReview > 0 ? <Text style={[styles.fact, styles.factWarn]}>{u.awaitingReview} waiting for review</Text> : null}
        </View>
      </Pressable>
    );
  };

  const sections = [
    { title: 'By course unit', units: course },
    { title: 'By Phrasebook category', units: phrasebook },
  ].filter((s) => s.units.length > 0);

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {tiles.map((t) => (
          <View key={t.label} style={[styles.tile, shadows.card]}>
            <Text style={[styles.tileValue, { color: t.color }]}>{t.value}</Text>
            <Text style={styles.tileLabel}>{t.label}</Text>
          </View>
        ))}
      </View>

      {sections.map((s) => (
        <View key={s.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{s.title}</Text>
          <View style={[styles.card, shadows.card]}>{s.units.map(unitRow)}</View>
        </View>
      ))}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Needs recording · {needsRecording.length}</Text>
        <View style={[styles.card, shadows.card]}>
          {needsRecording.length === 0 ? (
            <Text style={[styles.fact, styles.allDone]}>Every live form has a native recording. 🎉</Text>
          ) : (
            <>
              {needsRecording.slice(0, SHOWN_NEEDS_RECORDING).map((n, i) => (
                <View key={n.variantId} style={[styles.needRow, i > 0 && styles.divider]}>
                  <Text style={styles.needWord} numberOfLines={1}>
                    {n.englishMeaning}
                  </Text>
                  <Text style={styles.fact} numberOfLines={1}>
                    {`${LABEL_TEXT[n.variantLabel] ?? n.variantLabel} · ${n.unitName}`}
                  </Text>
                </View>
              ))}
              {needsRecording.length > SHOWN_NEEDS_RECORDING ? (
                <Text style={styles.more}>+ {needsRecording.length - SHOWN_NEEDS_RECORDING} more</Text>
              ) : null}
              <Pressable accessibilityRole="button" onPress={() => router.push('/admin/audio')} style={styles.cta}>
                <Text style={styles.ctaText}>🎙 Record them in Audio</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { gap: spacing.md, marginBottom: spacing.lg },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    tile: { width: '47%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, gap: 2 },
    tileValue: { fontSize: 26, fontWeight: '800' },
    tileLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
    section: { gap: spacing.sm },
    sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
    card: { backgroundColor: colors.surface, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    unitRow: { paddingVertical: spacing.sm, gap: 6 },
    unitTop: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
    unitName: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    unitWords: { fontSize: 13, color: colors.textSecondary },
    barTrack: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },
    unitFacts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md },
    fact: { fontSize: 12, color: colors.textSecondary },
    factWarn: { color: colors.accent, fontWeight: '700' },
    allDone: { paddingVertical: spacing.sm },
    needRow: { paddingVertical: spacing.sm, gap: 2 },
    needWord: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
    more: { fontSize: 13, color: colors.textSecondary, paddingVertical: spacing.xs },
    cta: {
      marginVertical: spacing.sm,
      minHeight: 44,
      borderRadius: radii.md,
      backgroundColor: `${colors.primary}14`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaText: { fontSize: 15, fontWeight: '700', color: colors.primary },
    error: { fontSize: 13, color: colors.error, marginBottom: spacing.lg },
    loading: { marginBottom: spacing.lg },
  });
