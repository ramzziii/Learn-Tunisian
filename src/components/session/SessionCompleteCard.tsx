import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, gradients, radii, shadows, spacing } from '@/constants/theme';
import type { Badge } from '@/lib/badges';
import type { DailyGoalMinutes, SessionType, Track } from '@/types/models';

const ADD_MORE_OPTIONS: DailyGoalMinutes[] = [5, 10, 15];

interface SessionCompleteCardProps {
  minutesLearned: number;
  wordsCount: number;
  correctCount: number;
  incorrectCount: number;
  sessionType: SessionType;
  track: Track;
  onClose: () => void;
  onAddMore: (minutes: DailyGoalMinutes) => void;
  /** Only offered when there's something to review — a completed review
   * session doesn't offer to review itself again. */
  onReviewWeakWords?: () => void;
  /** Only offered when there's a genuinely different next lesson to
   * recommend — jumps straight in rather than routing back through Home. */
  onContinueLesson?: () => void;
  /** Same reason copy Home's "Recommended next" card uses for this same
   * pick, shown under the Continue button so the language stays consistent. */
  continueLessonReason?: string;
  /** Kid track only — badges newly crossed this session, shown as a small
   * celebration above the rest of the card. */
  newlyEarnedBadges?: Badge[];
}

/**
 * Every session's natural stopping point: a positive completion message with
 * a clear, bounded set of choices — "Close", "Review weak words" (only when
 * there's something worth reviewing), or "Continue learning" — never an
 * auto-advance into more content.
 */
export function SessionCompleteCard({
  minutesLearned,
  wordsCount,
  correctCount,
  incorrectCount,
  sessionType,
  track,
  onClose,
  onAddMore,
  onReviewWeakWords,
  onContinueLesson,
  continueLessonReason,
  newlyEarnedBadges = [],
}: SessionCompleteCardProps) {
  const pop = useRef(new Animated.Value(0)).current;
  const isReview = sessionType === 'review';
  const isKid = track === 'kid';
  const totalAnswered = correctCount + incorrectCount;
  // A light, honest encouragement line — only shown when there's enough
  // signal to say something true (more right than wrong), not on every card.
  const showsImproving = totalAnswered >= 3 && correctCount > incorrectCount;
  // 1-3 stars from the correct ratio — a kid-friendly stand-in for the
  // adult track's numeric "X/Y correct" stat, never framed as a "miss."
  const starCount =
    totalAnswered === 0 ? 3 : correctCount / totalAnswered >= 0.8 ? 3 : correctCount / totalAnswered >= 0.5 ? 2 : 1;

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 10 }).start();
  }, [pop]);

  return (
    <View style={styles.overlay}>
      <Animated.View
        style={[
          styles.card,
          shadows.raised,
          {
            opacity: pop,
            transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
          },
        ]}
      >
        <LinearGradient colors={gradients.celebration} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
          <Text style={styles.emoji}>{isReview ? '🔄' : '🎉'}</Text>
        </LinearGradient>

        <Text style={styles.title}>{isKid ? 'Woohoo! 🎉' : isReview ? 'Review complete!' : 'Great job!'}</Text>
        <Text style={styles.subtitle}>
          {isKid
            ? "You're doing great — keep it up!"
            : isReview
              ? 'Nice work keeping your Tunisian fresh.'
              : 'You completed your learning for today.'}
        </Text>
        {!isKid && showsImproving ? (
          <Text style={styles.improvingText}>You&apos;re improving in this topic 📈</Text>
        ) : null}

        {isKid ? (
          <View style={styles.starsRow}>
            {[1, 2, 3].map((i) => (
              <Text key={i} style={styles.star}>
                {i <= starCount ? '⭐' : '☆'}
              </Text>
            ))}
          </View>
        ) : null}

        {newlyEarnedBadges.length > 0 ? (
          <View style={styles.newBadges}>
            {newlyEarnedBadges.map((badge) => (
              <Text key={badge.id} style={styles.newBadgeText}>
                🏅 New badge: {badge.emoji} {badge.title}!
              </Text>
            ))}
          </View>
        ) : null}

        {isKid ? (
          <View style={styles.statsRow}>
            <Stat value={minutesLearned} label={minutesLearned === 1 ? 'minute' : 'minutes'} />
            <Stat value={wordsCount} label={isReview ? 'reviewed' : 'practiced'} />
          </View>
        ) : (
          <>
            <View style={styles.statsRow}>
              <Stat value={minutesLearned} label={minutesLearned === 1 ? 'minute' : 'minutes'} />
              <Stat value={wordsCount} label={isReview ? 'reviewed' : 'practiced'} />
              <Stat value={totalAnswered > 0 ? `${correctCount}/${totalAnswered}` : correctCount} label="correct" />
            </View>
            {incorrectCount > 0 ? (
              <Text style={styles.needsPractice}>
                {incorrectCount} {incorrectCount === 1 ? 'word' : 'words'} could use more practice next time.
              </Text>
            ) : null}
          </>
        )}

        <Button label="Close" onPress={onClose} style={{ marginTop: spacing.xl, width: '100%' }} />
        {onContinueLesson ? (
          <>
            <Button
              label="Continue to next lesson"
              variant="secondary"
              onPress={onContinueLesson}
              style={{ marginTop: spacing.sm, width: '100%' }}
            />
            {continueLessonReason ? <Text style={styles.continueReasonText}>{continueLessonReason}</Text> : null}
          </>
        ) : null}
        {onReviewWeakWords ? (
          <Button
            label="Review weak words"
            variant="secondary"
            onPress={onReviewWeakWords}
            style={{ marginTop: spacing.sm, width: '100%' }}
          />
        ) : null}

        <Text style={styles.addMoreLabel}>Want to keep going?</Text>
        <View style={styles.addMoreRow}>
          {ADD_MORE_OPTIONS.map((minutes) => (
            <PressableScale key={minutes} haptic style={styles.addMoreButton} onPress={() => onAddMore(minutes)}>
              <Text style={styles.addMoreButtonText}>+{minutes} min</Text>
            </PressableScale>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(36, 32, 33, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emoji: { fontSize: 48 },
  title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.sm },
  subtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  improvingText: { fontSize: 13, fontWeight: '600', color: colors.success, textAlign: 'center', marginTop: spacing.xs },
  starsRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  star: { fontSize: 36 },
  newBadges: { marginTop: spacing.md, alignItems: 'center', gap: spacing.xs },
  newBadgeText: { fontSize: 14, fontWeight: '700', color: colors.primaryDark, textAlign: 'center' },
  continueReasonText: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs },
  statsRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.lg },
  stat: { alignItems: 'center', minWidth: 56 },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.primaryDark },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  needsPractice: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },
  addMoreLabel: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xl, marginBottom: spacing.sm },
  addMoreRow: { flexDirection: 'row', gap: spacing.sm },
  addMoreButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  addMoreButtonText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
});
