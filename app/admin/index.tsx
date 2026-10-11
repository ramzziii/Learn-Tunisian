import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { SelectableCard } from '@/components/ui/SelectableCard';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { fetchAdminMetrics, type AdminMetrics } from '@/data/admin/metrics';

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [metricsError, setMetricsError] = useState(false);

  const loadMetrics = useCallback(() => {
    setMetricsError(false);
    fetchAdminMetrics()
      .then(setMetrics)
      .catch(() => setMetricsError(true));
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  const needingAttention = metrics ? metrics.wordGroupsByStatus.draft + metrics.wordGroupsByStatus.pending_review : 0;

  return (
    <ScreenContainer>
      <Text style={styles.title}>Admin</Text>
      <Text style={styles.subtitle}>Content management — curriculum and review.</Text>

      {metrics ? (
        <View style={styles.metricsGrid}>
          <MetricCard label="Units" value={metrics.unitCount} />
          <MetricCard label="Lessons" value={metrics.lessonCount} />
          <MetricCard label="Word groups" value={metrics.wordGroupCount} />
          <MetricCard label="Variants" value={metrics.wordVariantCount} />
          <MetricCard label="Needs attention" value={needingAttention} accent />
          <MetricCard label="Corrections pending" value={metrics.pendingCorrectionsCount} accent />
        </View>
      ) : metricsError ? (
        <Text style={styles.metricsError}>Couldn&apos;t load metrics.</Text>
      ) : (
        <ActivityIndicator style={styles.metricsLoading} color={colors.primary} />
      )}

      <SelectableCard title="Content" subtitle="Units, lessons, and word groups" onPress={() => router.push('/admin/units')} />
      <SelectableCard
        title="Approval Queue"
        subtitle={`${needingAttention} word group${needingAttention === 1 ? '' : 's'} awaiting review`}
        onPress={() => router.push('/admin/queue')}
      />
      <SelectableCard
        title="Correction Review"
        subtitle="Pending AI-generated phrases/sentences"
        onPress={() => router.push('/admin/corrections')}
      />
    </ScreenContainer>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <View style={[styles.metricCard, shadows.card]}>
      <Text style={[styles.metricValue, accent && value > 0 && styles.metricValueAccent]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  metricCard: {
    width: '30%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  metricValue: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  metricValueAccent: { color: colors.error },
  metricLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
  metricsError: { fontSize: 13, color: colors.error, marginBottom: spacing.lg },
  metricsLoading: { marginBottom: spacing.lg },
});
