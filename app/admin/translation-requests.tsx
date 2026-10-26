import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { listOpenTranslationRequests, type AdminTranslationRequest } from '@/data/admin/translationRequests';
import { deadlineStatus, formatTunisDay } from '@/lib/translationRequests/deadline';

/** Pending learner translation requests, soonest deadline first. */
export default function AdminTranslationRequestsQueue() {
  const [requests, setRequests] = useState<AdminTranslationRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    listOpenTranslationRequests()
      .then(setRequests)
      .catch((err) => setError(err instanceof Error ? err.message : 'unknown error'));
  }, []);

  // Reload on return from a request, so answered/rejected ones drop off.
  useFocusEffect(load);

  const now = new Date(Date.now());
  const overdueCount = (requests ?? []).filter((r) => deadlineStatus(new Date(r.dueAt), now).overdue).length;

  return (
    <ScreenContainer>
      <BackButton />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Translation Requests</Text>
        <Text style={styles.subtitle}>
          Learners were promised an answer within 3 business days (Mon–Fri, Tunis time).
          {requests ? ` ${requests.length} pending · ${overdueCount} overdue.` : ''}
        </Text>

        {error ? (
          <View style={styles.card}>
            <Text style={styles.errorText}>Couldn&apos;t load requests ({error}).</Text>
            <Button label="Retry" variant="secondary" onPress={load} />
          </View>
        ) : requests === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : requests.length === 0 ? (
          <Text style={styles.empty}>No pending requests. 🎉</Text>
        ) : (
          requests.map((request) => {
            const deadline = deadlineStatus(new Date(request.dueAt), now);
            return (
              <PressableScale
                key={request.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/admin/translation-requests/[requestId]', params: { requestId: request.id } })}
                style={[styles.card, shadows.card]}
              >
                <Text style={styles.requestText} numberOfLines={3}>
                  {request.englishText}
                </Text>
                <View style={styles.row}>
                  <Text style={styles.meta}>Sent {formatTunisDay(new Date(request.submittedAt))}</Text>
                  <Text style={[styles.deadline, deadline.overdue && styles.overdue]}>{deadline.label}</Text>
                </View>
                {request.status === 'in_progress' ? <Text style={styles.handled}>Being handled</Text> : null}
              </PressableScale>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl },
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, gap: spacing.xs, marginBottom: spacing.sm },
  requestText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  meta: { fontSize: 12, color: colors.textSecondary },
  deadline: { fontSize: 12, fontWeight: '700', color: colors.success },
  overdue: { color: colors.error },
  handled: { fontSize: 12, fontWeight: '700', color: colors.primary },
  empty: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  errorText: { fontSize: 13, color: colors.error },
});
