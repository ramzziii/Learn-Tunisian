import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { fetchContentProgress } from '@/data/admin/contentProgress';
import { fetchAdminMetrics } from '@/data/admin/metrics';
import { listOpenTranslationRequests } from '@/data/admin/translationRequests';
import { fetchIsReviewer } from '@/data/reviewers';
import { buildNeedsAttention, type NeedsAttentionRow } from '@/lib/admin/needsAttention';
import { usePremium } from '@/lib/premium/PremiumContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { deadlineStatus } from '@/lib/translationRequests/deadline';

interface TodayData {
  isReviewer: boolean;
  waiting: number;
  live: number;
  withNativeAudio: number;
  rows: NeedsAttentionRow[];
}

async function loadToday(): Promise<TodayData> {
  const [metrics, requests, progress, isReviewer] = await Promise.all([
    fetchAdminMetrics(),
    listOpenTranslationRequests(),
    fetchContentProgress(),
    fetchIsReviewer(),
  ]);
  const now = new Date(Date.now());
  const waiting = metrics.wordGroupsByStatus.draft + metrics.wordGroupsByStatus.pending_review;
  return {
    isReviewer,
    waiting,
    live: metrics.wordGroupsByStatus.approved,
    withNativeAudio: progress.overall.withNativeAudio,
    rows: buildNeedsAttention({
      requestsOpen: requests.length,
      requestsOverdue: requests.filter((r) => deadlineStatus(new Date(r.dueAt), now).overdue).length,
      wordsWaitingForReview: waiting,
      recordingsNeeded: progress.needsRecording.length,
      correctionsWaiting: metrics.pendingCorrectionsCount,
      isReviewer,
    }),
  };
}

/**
 * Admin → Today: what needs you now (most urgent first), the content pipeline
 * at a glance (waiting for review → live → with native audio), and how you're
 * viewing the app. A failed load says so — never zeros.
 */
export default function AdminToday() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { adminPreview, setAdminPreview } = usePremium();
  const [data, setData] = useState<TodayData | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    loadToday()
      .then(setData)
      .catch(() => setLoadError(true));
  }, []);
  useFocusEffect(load);

  const stage = (label: string, value: number, href: '/admin/review' | '/admin/content' | '/admin/audio') => (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
      onPress={() => router.push(href)}
      style={[styles.stage, shadows.card]}
    >
      <Text style={styles.stageValue}>{value}</Text>
      <Text style={styles.stageLabel}>{label}</Text>
    </PressableScale>
  );

  return (
    <ScreenContainer themed>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.title} accessibilityRole="header">
          Admin
        </Text>
        <Text style={styles.role}>{data?.isReviewer ? 'Admin · Language reviewer' : 'Admin'}</Text>

        <View style={[styles.previewRow, shadows.card]}>
          <Text style={styles.previewText}>View app as Premium</Text>
          <Switch
            accessibilityLabel="View app as Premium"
            value={adminPreview === 'premium'}
            onValueChange={(on) => setAdminPreview(on ? 'premium' : 'free')}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>

        {loadError ? (
          <View style={styles.problem}>
            <Text style={styles.muted}>Couldn&apos;t load today&apos;s work.</Text>
            <Button themed label="Try again" variant="secondary" onPress={load} />
          </View>
        ) : !data ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            <Text style={styles.heading} accessibilityRole="header">
              Words and phrases
            </Text>
            <View style={styles.pipeline}>
              {stage('Waiting for review', data.waiting, '/admin/review')}
              <Text style={styles.arrow}>→</Text>
              {stage('Live', data.live, '/admin/content')}
              <Text style={styles.arrow}>→</Text>
              {stage('With native audio', data.withNativeAudio, '/admin/audio')}
            </View>

            <Text style={styles.heading} accessibilityRole="header">
              Needs you now
            </Text>
            {data.rows.length === 0 ? (
              <Text style={styles.caughtUp}>All caught up 🎉</Text>
            ) : (
              data.rows.map((row) => (
                <PressableScale
                  key={row.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${row.title}. ${row.detail}`}
                  onPress={() => router.push(row.href)}
                  style={[styles.task, shadows.card]}
                >
                  <Text style={styles.taskIcon}>{row.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskTitle}>{row.title}</Text>
                    <Text style={styles.muted}>{row.detail}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </PressableScale>
              ))
            )}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scroll: { gap: spacing.sm, paddingBottom: spacing.xxl },
    title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.sm },
    role: { fontSize: 13, color: colors.textSecondary },
    heading: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.lg },
    previewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      minHeight: 52,
      marginTop: spacing.sm,
    },
    previewText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    pipeline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    stage: { flex: 1, backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.sm, alignItems: 'center', minHeight: 72, justifyContent: 'center' },
    stageValue: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
    stageLabel: { fontSize: 11, color: colors.textSecondary, textAlign: 'center' },
    arrow: { fontSize: 16, color: colors.textSecondary },
    task: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, minHeight: 56 },
    taskIcon: { fontSize: 22 },
    taskTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    chevron: { fontSize: 20, color: colors.textSecondary },
    caughtUp: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },
    muted: { fontSize: 13, color: colors.textSecondary },
    problem: { gap: spacing.sm, marginTop: spacing.md },
  });
