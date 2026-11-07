import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { acknowledgeImportRun, fetchImportRuns, summaryLine, type ImportRun } from '@/data/admin/importRuns';
import { useTheme } from '@/lib/theme/ThemeContext';

const SHOWN_PROBLEMS = 5;
const OUTCOME: Record<ImportRun['outcome'], { label: string; icon: string }> = {
  imported: { label: 'Imported', icon: '✅' },
  refused: { label: 'Refused — nothing written', icon: '⛔' },
  failed: { label: 'Failed part-way', icon: '⚠️' },
};

/**
 * Admin → Imports: the log of content imports run with --execute (dry runs
 * are never logged), newest first — what changed, and for refused or failed
 * runs the problems by sheet row. "Mark as seen" clears it from Today.
 */
export default function AdminImports() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [runs, setRuns] = useState<ImportRun[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);
  const [ackingId, setAckingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setRuns(await fetchImportRuns());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markSeen = async (id: string) => {
    setAckError(null);
    setAckingId(id);
    try {
      await acknowledgeImportRun(id);
      setRuns((list) => list?.map((r) => (r.id === id ? { ...r, acknowledgedAt: new Date().toISOString() } : r)) ?? list);
    } catch (err) {
      setAckError(`Couldn't mark it as seen — ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setAckingId(null);
    }
  };

  return (
    <ScreenContainer themed>
      <BackButton themed />
      <Text style={styles.title}>Imports</Text>
      <Text style={styles.subtitle}>Content imports run for real (dry runs aren’t logged), newest first.</Text>
      {loadError ? (
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>Couldn&apos;t load the import log</Text>
          <Button themed label="Try again" variant="secondary" onPress={load} />
        </View>
      ) : !runs ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : runs.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>No imports yet</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {ackError ? <Text style={styles.errorText}>{ackError}</Text> : null}
          {runs.map((run) => {
            const needsALook = run.outcome !== 'imported' && !run.acknowledgedAt;
            return (
              <View key={run.id} style={[styles.card, shadows.card, needsALook && styles.cardAttention]}>
                <Text style={styles.outcome}>
                  {OUTCOME[run.outcome].icon} {OUTCOME[run.outcome].label}
                </Text>
                <Text style={styles.file}>{run.sourceFile}</Text>
                <Text style={styles.meta}>
                  {new Date(run.startedAt).toLocaleString()} · {run.rowsRead} rows read
                </Text>
                {run.outcome === 'imported' ? <Text style={styles.meta}>{summaryLine(run.summary)}</Text> : null}
                {run.problems.slice(0, SHOWN_PROBLEMS).map((p, i) => (
                  <Text key={i} style={styles.problem}>
                    {p.rows && p.rows.length > 0 ? `Row ${p.rows.join(', ')}: ` : ''}
                    {p.message}
                  </Text>
                ))}
                {run.problems.length > SHOWN_PROBLEMS ? (
                  <Text style={styles.meta}>+ {run.problems.length - SHOWN_PROBLEMS} more problems</Text>
                ) : null}
                {needsALook ? (
                  <Button themed label="Mark as seen" variant="secondary" onPress={() => markSeen(run.id)} loading={ackingId === run.id} />
                ) : run.acknowledgedAt && run.outcome !== 'imported' ? (
                  <Text style={styles.meta}>Seen</Text>
                ) : null}
              </View>
            );
          })}
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
    card: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, gap: 4 },
    cardAttention: { borderWidth: 1.5, borderColor: colors.accent },
    outcome: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
    file: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    meta: { fontSize: 12, color: colors.textSecondary },
    problem: { fontSize: 13, color: colors.error },
    errorText: { fontSize: 13, color: colors.error, textAlign: 'center' },
    centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    centeredTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  });
