import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import {
  ANALYTICS_PERIOD_DAYS,
  AnalyticsAccessDeniedError,
  fetchAnalyticsOverview,
  type AnalyticsOverview as Overview,
} from '@/data/admin/analytics';
import { ADMIN_EXCLUSION_NOTE, ANALYTICS_SECTIONS, UNAVAILABLE_SECTIONS } from '@/lib/admin/analyticsDefinitions';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep 25 – Oct 24, 2026 (UTC)" for [start, end) — end is exclusive. */
export function formatPeriod(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const lastDay = new Date(new Date(endIso).getTime() - 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return `${fmt(start)} – ${fmt(lastDay)}, ${lastDay.getUTCFullYear()} (UTC)`;
}

const formatCount = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; overview: Overview }
  | { kind: 'denied' }
  | { kind: 'not-deployed' }
  | { kind: 'error' };

/**
 * The analytics half of the admin dashboard: aggregate learner and learning
 * numbers for a chosen period (from the admin-only database function), each
 * with its definition, plus sections that have no trustworthy source yet.
 * Loading, error, access-denied and unavailable states are all distinct —
 * no number is ever shown that wasn't actually returned.
 */
export function AnalyticsOverview() {
  const [days, setDays] = useState<number>(30);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback(async (period: number) => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ready', overview: await fetchAnalyticsOverview(period) });
    } catch (err) {
      if (err instanceof AnalyticsAccessDeniedError) setState({ kind: 'denied' });
      else if ((err as { code?: string }).code === '42883') setState({ kind: 'not-deployed' });
      else setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    load(days);
  }, [load, days]);

  return (
    <View style={styles.container}>
      <View style={styles.periodRow}>
        {ANALYTICS_PERIOD_DAYS.map((d) => (
          <Pressable
            key={d}
            accessibilityRole="button"
            accessibilityState={{ selected: d === days }}
            onPress={() => setDays(d)}
            style={[styles.periodChip, d === days && styles.periodChipActive]}
          >
            <Text style={[styles.periodText, d === days && styles.periodTextActive]}>{d} days</Text>
          </Pressable>
        ))}
      </View>

      {state.kind === 'loading' ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Loading analytics…</Text>
        </View>
      ) : state.kind === 'denied' ? (
        <View style={styles.stateBox}>
          <Text style={styles.errorText}>
            Analytics are only available to admins — the database refused this request. Try signing in again.
          </Text>
        </View>
      ) : state.kind === 'not-deployed' ? (
        <View style={styles.stateBox}>
          <Text style={styles.errorText}>
            Analytics aren&apos;t set up on the database yet — apply supabase/migrations/0014_admin_analytics.sql.
          </Text>
          <Button label="Try again" variant="secondary" onPress={() => load(days)} />
        </View>
      ) : state.kind === 'error' ? (
        <View style={styles.stateBox}>
          <Text style={styles.errorText}>Couldn&apos;t load analytics.</Text>
          <Button label="Try again" variant="secondary" onPress={() => load(days)} />
        </View>
      ) : (
        <ReadyView overview={state.overview} />
      )}

      {UNAVAILABLE_SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={[styles.unavailableCard, shadows.card]}>
            <Text style={styles.unavailableTitle}>Not available yet</Text>
            <Text style={styles.definition}>{section.reason}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function ReadyView({ overview }: { overview: Overview }) {
  const { countries, minGroupSize } = overview.location;
  return (
    <>
      <Text style={styles.periodLabel}>{formatPeriod(overview.period.start, overview.period.end)}</Text>

      {ANALYTICS_SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.grid}>
            {section.metrics.map((metric) => (
              <View key={metric.key} style={[styles.metricCard, shadows.card]}>
                <Text style={styles.metricValue}>{formatCount(metric.value(overview))}</Text>
                <View style={styles.labelRow}>
                  <Text style={styles.metricLabel}>{metric.label}</Text>
                  {metric.allTime ? <Text style={styles.allTimeTag}>all time</Text> : null}
                </View>
                <Text style={styles.definition}>{metric.definition}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location</Text>
        <View style={[styles.tableCard, shadows.card]}>
          {countries.length === 0 ? (
            <Text style={styles.stateText}>No learner locations yet.</Text>
          ) : (
            countries.map((row) => (
              <View key={row.country} style={styles.tableRow}>
                <Text style={styles.tableCountry}>{row.country}</Text>
                <Text style={styles.tableCount}>{formatCount(row.learners)}</Text>
              </View>
            ))
          )}
          <Text style={styles.definition}>
            Learner profiles by country, as entered at sign-up (all time). Countries with fewer than {minGroupSize}{' '}
            learners are grouped as “Other”.
          </Text>
        </View>
      </View>

      <Text style={styles.footnote}>{ADMIN_EXCLUSION_NOTE}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  periodRow: { flexDirection: 'row', gap: spacing.xs },
  periodChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  periodChipActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}14` },
  periodText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  periodTextActive: { color: colors.primary },
  periodLabel: { fontSize: 13, color: colors.textSecondary },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metricCard: { width: '47%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, gap: 2 },
  metricValue: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  metricLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  allTimeTag: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    backgroundColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  definition: { fontSize: 11, color: colors.textSecondary, lineHeight: 15 },
  tableCard: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, gap: spacing.xs },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between' },
  tableCountry: { fontSize: 14, color: colors.textPrimary },
  tableCount: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  unavailableCard: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, gap: 4 },
  unavailableTitle: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  stateBox: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  stateText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  errorText: { fontSize: 13, color: colors.error, textAlign: 'center' },
  footnote: { fontSize: 11, color: colors.textSecondary, fontStyle: 'italic' },
});
