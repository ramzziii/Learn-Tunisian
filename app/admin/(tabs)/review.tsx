import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import AdminQueue from '../queue';
import { AdminTabProvider } from '@/components/admin/AdminScreenTop';
import { PressableScale } from '@/components/ui/PressableScale';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { fetchIsReviewer } from '@/data/reviewers';
import { useTheme } from '@/lib/theme/ThemeContext';

/**
 * Admin → Review: words and phrases waiting for review, and — for language
 * reviewers only — "Review one at a time" (correct / fix / reject each form)
 * and the AI corrections from learners' conversations. Being an admin
 * doesn't include language review.
 */
export default function AdminReviewTab() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [isReviewer, setIsReviewer] = useState(false);

  useEffect(() => {
    fetchIsReviewer()
      .then(setIsReviewer)
      .catch(() => setIsReviewer(false));
  }, []);

  // Reviewers only: approving and rejecting is theirs (0028 enforces it).
  const header = isReviewer ? (
    <>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Review one at a time"
        onPress={() => router.push('/admin/review-session')}
        style={[styles.card, shadows.card]}
      >
        <Text style={styles.cardTitle}>✅ Review one at a time</Text>
        <Text style={styles.cardBody}>Correct, fix or reject each waiting form ›</Text>
      </PressableScale>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="AI corrections to check"
        onPress={() => router.push('/admin/corrections')}
        style={[styles.card, shadows.card]}
      >
        <Text style={styles.cardTitle}>🧠 AI corrections</Text>
        <Text style={styles.cardBody}>Check phrases from learners’ conversations ›</Text>
      </PressableScale>
    </>
  ) : null;

  return (
    <AdminTabProvider header={header}>
      <AdminQueue />
    </AdminTabProvider>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.sm, gap: 2 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    cardBody: { fontSize: 13, color: colors.textSecondary },
  });
