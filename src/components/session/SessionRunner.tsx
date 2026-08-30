import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ExerciseRenderer } from '@/components/exercises/shared/ExerciseRenderer';
import { SessionCompleteCard } from '@/components/session/SessionCompleteCard';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, spacing } from '@/constants/theme';
import { recordWordGroupResult } from '@/data/progress';
import { useExerciseQueue } from '@/hooks/useExerciseQueue';
import { useSessionTimer } from '@/hooks/useSessionTimer';
import type { DailyGoalMinutes, Track, WordGroupWithVariants } from '@/types/models';

interface SessionRunnerProps {
  groups: WordGroupWithVariants[];
  goalMinutes: DailyGoalMinutes;
  profileId: string;
  track: Track;
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
export function SessionRunner({ groups, goalMinutes, profileId, track, emptyMessage, exitHref }: SessionRunnerProps) {
  const timer = useSessionTimer(goalMinutes);
  const { currentExercise, next } = useExerciseQueue(groups, track);
  const destination = exitHref ?? '/home';

  const handleAnswer = (wasCorrect: boolean) => {
    if (!currentExercise) return;
    recordWordGroupResult(profileId, currentExercise.targetGroup.id, wasCorrect).catch(() => {
      // Progress is best-effort in v1; a failed write shouldn't block the session.
    });
    next();
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
        <Pressable onPress={() => router.back()} accessibilityLabel="Exit session" style={styles.closeButton}>
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <ProgressBar progress={timer.goalSeconds > 0 ? timer.elapsedSeconds / timer.goalSeconds : 0} />
        </View>
      </View>

      {currentExercise ? <ExerciseRenderer exercise={currentExercise} onComplete={handleAnswer} /> : <LoadingScreen />}

      {timer.isComplete ? (
        <SessionCompleteCard
          minutesLearned={Math.max(1, Math.round(timer.goalSeconds / 60))}
          onClose={() => router.replace(destination)}
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
