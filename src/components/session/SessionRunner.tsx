import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, StyleSheet, Text, View } from 'react-native';

import { ExerciseRenderer } from '@/components/exercises/shared/ExerciseRenderer';
import { SessionCompleteCard } from '@/components/session/SessionCompleteCard';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, spacing } from '@/constants/theme';
import { recordWordGroupResult } from '@/data/progress';
import { recordSessionLog } from '@/data/sessionLogs';
import { useExerciseQueue } from '@/hooks/useExerciseQueue';
import { useFadeInOnChange } from '@/hooks/useFadeInOnChange';
import { useSessionTimer } from '@/hooks/useSessionTimer';
import { masteryLabel, type MasteryLabel } from '@/lib/masteryStatus';
import type { DailyGoalMinutes, SessionType, Track, WordGroupWithVariants } from '@/types/models';

const MASTERY_BADGE_COLOR: Record<MasteryLabel, string> = {
  New: colors.textSecondary,
  Learning: colors.accent,
  'Almost there': colors.primaryDark,
  Mastered: colors.success,
};

interface SessionRunnerProps {
  groups: WordGroupWithVariants[];
  goalMinutes: DailyGoalMinutes;
  profileId: string;
  track: Track;
  sessionType: SessionType;
  /** Shown when `groups` is empty — differs between a lesson with no content and a review queue with nothing due. */
  emptyMessage: string;
  /** Where "Close" on the completion card and the exit button return to. Defaults to /home. */
  exitHref?: Href;
  /** Fires once, the moment the session's time goal is reached (before the
   * user necessarily taps Close) — e.g. for marking a daily challenge done. */
  onComplete?: () => void;
}

/**
 * The shared time-bounded exercise engine — used identically by a lesson
 * session and a review session. Progress recording, the exercise queue, and
 * the completion flow are all exactly the same regardless of which content
 * fed it, by design: review isn't a separate progress system.
 */
export function SessionRunner({
  groups,
  goalMinutes,
  profileId,
  track,
  sessionType,
  emptyMessage,
  exitHref,
  onComplete,
}: SessionRunnerProps) {
  const timer = useSessionTimer(goalMinutes);
  const { currentExercise, next } = useExerciseQueue(groups, track);

  useEffect(() => {
    if (timer.isComplete) onComplete?.();
    // Deliberately fires only on the isComplete transition, not on every
    // onComplete identity change — a fresh inline callback each render
    // shouldn't re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.isComplete]);
  const destination = exitHref ?? '/home';
  const fadeAnim = useFadeInOnChange(currentExercise?.key);

  const [stats, setStats] = useState({ correct: 0, incorrect: 0 });
  const practicedGroupIds = useRef(new Set<string>());
  const hasLoggedRef = useRef(false);

  const [masteryBadge, setMasteryBadge] = useState<MasteryLabel | null>(null);
  const badgeAnim = useRef(new Animated.Value(0)).current;

  const showMasteryBadge = useCallback(
    (label: MasteryLabel) => {
      setMasteryBadge(label);
      badgeAnim.setValue(0);
      Animated.sequence([
        Animated.timing(badgeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.delay(1100),
        Animated.timing(badgeAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    },
    [badgeAnim]
  );

  const handleAnswer = (wasCorrect: boolean) => {
    if (!currentExercise) return;
    practicedGroupIds.current.add(currentExercise.targetGroup.id);
    setStats((prev) => ({
      correct: prev.correct + (wasCorrect ? 1 : 0),
      incorrect: prev.incorrect + (wasCorrect ? 0 : 1),
    }));
    recordWordGroupResult(profileId, currentExercise.targetGroup.id, wasCorrect)
      .then((result) => showMasteryBadge(masteryLabel(result.correctCount)))
      .catch(() => {
        // Progress is best-effort in v1; a failed write shouldn't block the session.
      });
    next();
  };

  const logAndExit = useCallback(
    (to: Href = destination) => {
      if (!hasLoggedRef.current && timer.elapsedSeconds > 0) {
        hasLoggedRef.current = true;
        recordSessionLog(profileId, sessionType, timer.elapsedSeconds).catch(() => {
          // Best-effort — a failed log shouldn't block navigation.
        });
      }
      router.replace(to);
    },
    [destination, profileId, sessionType, timer.elapsedSeconds]
  );

  const handleExitPress = () => {
    if (timer.isComplete) {
      logAndExit();
      return;
    }
    Alert.alert('Leave this session?', "Your progress so far is saved, but you'll need to start a new session.", [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => logAndExit() },
    ]);
  };

  if (groups.length === 0) {
    return (
      <ScreenContainer>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <PressableScale haptic onPress={handleExitPress} accessibilityLabel="Exit session" style={styles.closeButton}>
          <Text style={styles.closeIcon}>✕</Text>
        </PressableScale>
        <View style={{ flex: 1 }}>
          <ProgressBar progress={timer.goalSeconds > 0 ? timer.elapsedSeconds / timer.goalSeconds : 0} />
        </View>
      </View>

      {/* Absolutely positioned so it never shifts the exercise below it —
          a quick, subtle confirmation of that word's mastery, not a
          blocking interruption. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.masteryBadgeWrap,
          {
            opacity: badgeAnim,
            transform: [{ translateY: badgeAnim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
          },
        ]}
      >
        {masteryBadge ? (
          <View style={[styles.masteryBadge, { backgroundColor: MASTERY_BADGE_COLOR[masteryBadge] }]}>
            <Text style={styles.masteryBadgeText}>{masteryBadge}</Text>
          </View>
        ) : null}
      </Animated.View>

      {currentExercise ? (
        <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
          <ExerciseRenderer exercise={currentExercise} onComplete={handleAnswer} />
        </Animated.View>
      ) : (
        <LoadingScreen />
      )}

      {timer.isComplete ? (
        <SessionCompleteCard
          minutesLearned={Math.max(1, Math.round(timer.elapsedSeconds / 60))}
          wordsCount={practicedGroupIds.current.size}
          correctCount={stats.correct}
          incorrectCount={stats.incorrect}
          sessionType={sessionType}
          onClose={() => logAndExit()}
          onAddMore={(minutes) => timer.addMinutes(minutes)}
          onReviewWeakWords={
            sessionType !== 'review' && stats.incorrect > 0 ? () => logAndExit('/review') : undefined
          }
        />
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  closeIcon: { fontSize: 16, color: colors.textSecondary },
  masteryBadgeWrap: { position: 'absolute', top: 56, right: spacing.lg, zIndex: 1 },
  masteryBadge: { borderRadius: radii.pill, paddingVertical: 4, paddingHorizontal: spacing.sm },
  masteryBadgeText: { fontSize: 11, fontWeight: '700', color: colors.textOnPrimary },
  emptyText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxl },
});
