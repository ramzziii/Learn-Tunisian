import { router, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { ExerciseRenderer } from '@/components/exercises/shared/ExerciseRenderer';
import { SessionCompleteCard } from '@/components/session/SessionCompleteCard';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, spacing } from '@/constants/theme';
import { recordWordGroupResult } from '@/data/progress';
import { recordSessionLog } from '@/data/sessionLogs';
import { useExerciseQueue } from '@/hooks/useExerciseQueue';
import { useFadeInOnChange } from '@/hooks/useFadeInOnChange';
import { useSessionTimer } from '@/hooks/useSessionTimer';
import type { DailyGoalMinutes, SessionType, Track, WordGroupWithVariants } from '@/types/models';

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
}: SessionRunnerProps) {
  const timer = useSessionTimer(goalMinutes);
  const { currentExercise, next } = useExerciseQueue(groups, track);
  const destination = exitHref ?? '/home';
  const fadeAnim = useFadeInOnChange(currentExercise?.key);

  const [stats, setStats] = useState({ correct: 0, incorrect: 0 });
  const practicedGroupIds = useRef(new Set<string>());
  const hasLoggedRef = useRef(false);

  const handleAnswer = (wasCorrect: boolean) => {
    if (!currentExercise) return;
    practicedGroupIds.current.add(currentExercise.targetGroup.id);
    setStats((prev) => ({
      correct: prev.correct + (wasCorrect ? 1 : 0),
      incorrect: prev.incorrect + (wasCorrect ? 0 : 1),
    }));
    recordWordGroupResult(profileId, currentExercise.targetGroup.id, wasCorrect).catch(() => {
      // Progress is best-effort in v1; a failed write shouldn't block the session.
    });
    next();
  };

  const logAndExit = useCallback(() => {
    if (!hasLoggedRef.current && timer.elapsedSeconds > 0) {
      hasLoggedRef.current = true;
      recordSessionLog(profileId, sessionType, timer.elapsedSeconds).catch(() => {
        // Best-effort — a failed log shouldn't block navigation.
      });
    }
    router.replace(destination);
  }, [destination, profileId, sessionType, timer.elapsedSeconds]);

  const handleExitPress = () => {
    if (timer.isComplete) {
      logAndExit();
      return;
    }
    Alert.alert('Leave this session?', "Your progress so far is saved, but you'll need to start a new session.", [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: logAndExit },
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
        <Pressable onPress={handleExitPress} accessibilityLabel="Exit session" style={styles.closeButton}>
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <ProgressBar progress={timer.goalSeconds > 0 ? timer.elapsedSeconds / timer.goalSeconds : 0} />
        </View>
      </View>

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
          onClose={logAndExit}
          onAddMore={(minutes) => timer.addMinutes(minutes)}
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
  emptyText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxl },
});
