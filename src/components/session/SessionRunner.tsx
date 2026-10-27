import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, StyleSheet, Text, View } from 'react-native';

import { ExerciseRenderer } from '@/components/exercises/shared/ExerciseRenderer';
import { RevisitIntro } from '@/components/session/RevisitIntro';
import { SessionCompleteCard } from '@/components/session/SessionCompleteCard';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';
import { fetchLessonMap } from '@/data/content';
import { recordWordGroupResult } from '@/data/progress';
import { recordSessionLog } from '@/data/sessionLogs';
import { useExerciseQueue } from '@/hooks/useExerciseQueue';
import { useSlideInOnChange } from '@/hooks/useSlideInOnChange';
import { useSessionTimer } from '@/hooks/useSessionTimer';
import { masteryLabel, type MasteryLabel } from '@/lib/masteryStatus';
import { recommendNextStep } from '@/lib/nextStepRecommendation';
import { buildRevisitExercises, updateRevisitList } from '@/lib/speakingRevisit';
import type { ExerciseItem, ExerciseOutcome } from '@/types/exercises';
import type { DailyGoalMinutes, LessonWithState, SessionType, WordGroupWithVariants } from '@/types/models';

const masteryBadgeColors = (colors: ThemeColors): Record<MasteryLabel, string> => ({
  New: colors.textSecondary,
  Learning: colors.accent,
  'Almost there': colors.primaryDark,
  Mastered: colors.success,
});

interface SessionRunnerProps {
  groups: WordGroupWithVariants[];
  goalMinutes: DailyGoalMinutes;
  profileId: string;
  sessionType: SessionType;
  /** Shown when `groups` is empty — differs between a lesson with no content and a review queue with nothing due. */
  emptyMessage: string;
  /** Where "Close" on the completion card and the exit button return to. Defaults to /home. */
  exitHref?: Href;
  /** The lesson this session is running, if any — used only to avoid
   * recommending the exact same lesson as "Continue" right after finishing
   * it. Review sessions (no single current lesson) omit this. */
  currentLessonId?: string;
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
  sessionType,
  emptyMessage,
  exitHref,
  currentLessonId,
  onComplete,
}: SessionRunnerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const timer = useSessionTimer(goalMinutes);
  const { currentExercise: queuedExercise, next } = useExerciseQueue(groups);

  // Words left mispronounced in speaking exercises are replayed once the time
  // goal is reached, before the summary — see src/lib/speakingRevisit.ts.
  const [revisitIds, setRevisitIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<'main' | 'revisit-intro' | 'revisit' | 'done'>('main');
  const [revisitQueue, setRevisitQueue] = useState<ExerciseItem[]>([]);
  const [revisitIndex, setRevisitIndex] = useState(0);

  useEffect(() => {
    if (timer.isComplete && phase === 'main') setPhase(revisitIds.length > 0 ? 'revisit-intro' : 'done');
    // Only the goal being reached moves on from 'main'; revisitIds is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.isComplete, phase]);

  const currentExercise = phase === 'revisit' ? (revisitQueue[revisitIndex] ?? null) : queuedExercise;
  const showComplete = phase === 'done';

  useEffect(() => {
    if (timer.isComplete) onComplete?.();
    // Deliberately fires only on the isComplete transition, not on every
    // onComplete identity change — a fresh inline callback each render
    // shouldn't re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.isComplete]);
  const destination = exitHref ?? '/home';
  const slideIn = useSlideInOnChange(currentExercise?.key);

  const [stats, setStats] = useState({ correct: 0, incorrect: 0 });
  const practicedGroupIds = useRef(new Set<string>());
  const hasLoggedRef = useRef(false);

  const [masteryBadge, setMasteryBadge] = useState<MasteryLabel | null>(null);
  const badgeAnim = useRef(new Animated.Value(0)).current;


  const [nextLesson, setNextLesson] = useState<{ lesson: LessonWithState; reasonText: string } | null>(null);
  const hasCheckedNextLessonRef = useRef(false);

  useEffect(() => {
    if (!timer.isComplete || hasCheckedNextLessonRef.current) return;
    hasCheckedNextLessonRef.current = true;
    (async () => {
      try {
        const units = await fetchLessonMap(profileId);
        const allLessons = units.flatMap((u) => u.lessons);
        // Forced reviewDueCount to 0, same as the Home screen's own lesson
        // pick — review already has its own dedicated flow, this is purely
        // "what's the next lesson worth doing."
        const recommendation = recommendNextStep(allLessons, 0);
        const candidate = recommendation?.type === 'lesson' ? recommendation.lesson : null;
        // Don't recommend the exact lesson just finished — Add more time
        // already covers "do more of this one."
        if (candidate && candidate.id !== currentLessonId) {
          // Same reason copy Home's "Recommended next" card uses, so the
          // language stays consistent from lesson to completion to home.
          const reasonText =
            recommendation?.type === 'lesson' && recommendation.reason === 'weak_spot'
              ? 'Keep building up an area that needs more practice'
              : 'Pick up right where you left off';
          setNextLesson({ lesson: candidate, reasonText });
        } else {
          setNextLesson(null);
        }
      } catch {
        // Best-effort — no "Continue" button if this fails, nothing blocks.
      }
    })();
  }, [timer.isComplete, profileId, currentLessonId]);

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

  const startRevisit = () => {
    setRevisitQueue(buildRevisitExercises(revisitIds, groups));
    setRevisitIds([]); // one second chance per word, not a loop
    setRevisitIndex(0);
    setPhase('revisit');
  };

  const handleAnswer = (wasCorrect: boolean, outcome?: ExerciseOutcome) => {
    if (!currentExercise) return;
    if (phase === 'main') {
      setRevisitIds((prev) => updateRevisitList(prev, currentExercise.targetGroup.id, currentExercise, outcome));
    }
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
    if (phase === 'revisit') {
      if (revisitIndex + 1 >= revisitQueue.length) setPhase('done');
      else setRevisitIndex((i) => i + 1);
      return;
    }
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
      <ScreenContainer themed>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer themed>
      <View style={styles.header}>
        <PressableScale haptic onPress={handleExitPress} accessibilityLabel="Exit session" style={styles.closeButton}>
          <Text style={styles.closeIcon}>✕</Text>
        </PressableScale>
        <View style={{ flex: 1 }}>
          <ProgressBar themed progress={timer.goalSeconds > 0 ? timer.elapsedSeconds / timer.goalSeconds : 0} />
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
          <View style={[styles.masteryBadge, { backgroundColor: masteryBadgeColors(colors)[masteryBadge] }]}>
            <Text style={styles.masteryBadgeText}>{masteryBadge}</Text>
          </View>
        ) : null}
      </Animated.View>

      {phase === 'revisit' ? <Text style={styles.revisitLabel}>🔁 Revisiting tricky words</Text> : null}

      {phase === 'revisit-intro' ? (
        <RevisitIntro count={revisitIds.length} onStart={startRevisit} onSkip={() => setPhase('done')} />
      ) : currentExercise ? (
        <Animated.View style={[{ flex: 1 }, slideIn]}>
          <ExerciseRenderer exercise={currentExercise} onComplete={handleAnswer} />
        </Animated.View>
      ) : (
        <LoadingScreen themed />
      )}

      {showComplete ? (
        <SessionCompleteCard
          minutesLearned={Math.max(1, Math.round(timer.elapsedSeconds / 60))}
          wordsCount={practicedGroupIds.current.size}
          correctCount={stats.correct}
          incorrectCount={stats.incorrect}
          sessionType={sessionType}
          onClose={() => logAndExit()}
          onAddMore={(minutes) => {
            timer.addMinutes(minutes);
            setPhase('main');
          }}
          onReviewWeakWords={
            sessionType !== 'review' && stats.incorrect > 0 ? () => logAndExit('/review') : undefined
          }
          onContinueLesson={nextLesson ? () => logAndExit(`/lesson/${nextLesson.lesson.id}`) : undefined}
          continueLessonReason={nextLesson?.reasonText}
        />
      ) : null}
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    revisitLabel: { fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: spacing.sm },
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
