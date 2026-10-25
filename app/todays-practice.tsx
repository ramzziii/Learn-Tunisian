import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { ExerciseRenderer } from '@/components/exercises/shared/ExerciseRenderer';
import { RepeatAfterMeExercise } from '@/components/repeatAfterMe/RepeatAfterMeExercise';
import { RevisitIntro } from '@/components/session/RevisitIntro';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { spacing, type ThemeColors } from '@/constants/theme';
import { recordWordGroupResult } from '@/data/progress';
import { useSlideInOnChange } from '@/hooks/useSlideInOnChange';
import { recordSessionLog } from '@/data/sessionLogs';
import { loadTodaysPractice } from '@/data/todaysPractice';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { markFreeReviewStarted } from '@/lib/premium/freeAllowance';
import { usePremium } from '@/lib/premium/PremiumContext';
import { recordRepeatAfterMeItemResult } from '@/lib/repeatAfterMe/progress';
import { RAM_MAX_ATTEMPTS } from '@/lib/repeatAfterMe/session';
import { sessionLogTypeFor, type TodaysPracticePlan, type TodaysPracticeStep } from '@/lib/todaysPractice';
import { useTheme } from '@/lib/theme/ThemeContext';

type Phase = 'loading' | 'error' | 'empty' | 'active' | 'revisit-intro' | 'revisit' | 'done';

/**
 * Today's Practice: one short guided session started from Home, composed
 * by src/lib/todaysPractice.ts. Every step reuses an existing activity and
 * its existing progress: word exercises → recordWordGroupResult; Repeat
 * After Me → its own per-item progress and 3-attempt rule. Words left
 * mispronounced and missed Repeat After Me items get one more go at the end
 * (the same revisit round as lessons), before completion. Daily-goal
 * minutes are logged once (session_logs) when the session ends or the
 * learner leaves — never per step. Review/streak/challenge flags are left
 * to their own screens.
 */
export default function TodaysPracticeScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { activeProfile } = useActiveProfile();
  const { isPremium, isResolved } = usePremium();

  const [phase, setPhase] = useState<Phase>('loading');
  const [plan, setPlan] = useState<TodaysPracticePlan | null>(null);
  const [index, setIndex] = useState(0);
  const [rightCount, setRightCount] = useState(0);
  // Steps left not right, replayed once at the end (never re-queued).
  const [revisitSteps, setRevisitSteps] = useState<TodaysPracticeStep[]>([]);
  const [revisitIndex, setRevisitIndex] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const slideIn = useSlideInOnChange(`${phase}-${phase === 'revisit' ? revisitIndex : index}`);
  const hasLoggedRef = useRef(false);

  const load = useCallback(async () => {
    if (!activeProfile || !isResolved) return;
    setPhase('loading');
    try {
      const next = await loadTodaysPractice({ profileId: activeProfile.id, isPremium, track: activeProfile.track });
      setPlan(next);
      setIndex(0);
      setRightCount(0);
      setRevisitSteps([]);
      setRevisitIndex(0);
      if (next.steps.length === 0) {
        setPhase('empty');
        return;
      }
      if (next.usesFreeReview) markFreeReviewStarted(activeProfile.id).catch(() => {});
      startedAtRef.current = Date.now();
      hasLoggedRef.current = false;
      setPhase('active');
    } catch {
      setPhase('error');
    }
  }, [activeProfile, isPremium, isResolved]);

  useEffect(() => {
    load();
  }, [load]);

  const logSessionOnce = () => {
    if (!activeProfile || !plan || startedAtRef.current === null || hasLoggedRef.current) return;
    hasLoggedRef.current = true;
    const seconds = (Date.now() - startedAtRef.current) / 1000;
    recordSessionLog(activeProfile.id, sessionLogTypeFor(plan), seconds).catch(() => {
      // Best-effort, like every other session — never blocks navigation.
    });
  };

  const finishSession = () => {
    logSessionOnce();
    setPhase('done');
  };

  /** Queue a step for the end-of-session revisit (main pass only). */
  const queueRevisit = (step: TodaysPracticeStep) => {
    if (phase !== 'active') return;
    const revisit: TodaysPracticeStep =
      step.kind === 'word'
        ? { ...step, key: `${step.key}-revisit`, exercise: { ...step.exercise, key: `${step.exercise.key}-revisit`, isRevisit: true } }
        : { ...step, key: `${step.key}-revisit` };
    setRevisitSteps((prev) => (prev.some((s) => s.key === revisit.key) ? prev : [...prev, revisit]));
  };

  const goToNextStep = (revisitCount = revisitSteps.length) => {
    if (!plan) return;
    if (phase === 'revisit') {
      if (revisitIndex + 1 >= revisitSteps.length) finishSession();
      else setRevisitIndex((i) => i + 1);
      return;
    }
    if (index + 1 >= plan.steps.length) {
      if (revisitCount > 0) setPhase('revisit-intro');
      else finishSession();
      return;
    }
    setIndex((i) => i + 1);
  };

  const exit = () => {
    logSessionOnce();
    router.replace('/home');
  };

  if (phase === 'error') {
    return (
      <ScreenContainer themed>
        <View style={styles.centered}>
          <Text style={styles.centeredEmoji}>😕</Text>
          <Text style={styles.centeredTitle}>Couldn&apos;t load today&apos;s practice</Text>
          <Button themed label="Try again" variant="secondary" onPress={load} />
        </View>
      </ScreenContainer>
    );
  }

  if (!activeProfile || phase === 'loading' || !plan) return <LoadingScreen themed />;

  if (phase === 'empty') {
    return (
      <ScreenContainer themed>
        <Reveal style={styles.centered}>
          <Text style={styles.centeredEmoji}>🌿</Text>
          <Text style={styles.centeredTitle}>You&apos;re all caught up</Text>
          <Text style={styles.centeredBody}>
            Nothing is due and there&apos;s nothing new to practice right now. You can still pick any activity from
            Practice.
          </Text>
          <Button themed label="Browse Practice" onPress={() => router.replace('/practice')} style={styles.fullWidth} />
          <Button themed label="Back to home" variant="ghost" onPress={() => router.replace('/home')} style={styles.fullWidth} />
        </Reveal>
      </ScreenContainer>
    );
  }

  if (phase === 'done') {
    return (
      <ScreenContainer themed>
        <Reveal style={styles.centered}>
          <Text style={styles.centeredEmoji}>🎉</Text>
          <Text style={styles.centeredTitle}>Today’s practice complete</Text>
          <Text style={styles.centeredBody}>
            {rightCount} of {plan.steps.length} went well. See you tomorrow!
          </Text>
          <Button themed label="Back to home" onPress={() => router.replace('/home')} style={styles.fullWidth} />
        </Reveal>
      </ScreenContainer>
    );
  }

  if (phase === 'revisit-intro') {
    return (
      <ScreenContainer themed>
        <RevisitIntro
          count={revisitSteps.length}
          onStart={() => {
            setRevisitIndex(0);
            setPhase('revisit');
          }}
          onSkip={finishSession}
        />
      </ScreenContainer>
    );
  }

  const isRevisit = phase === 'revisit';
  const steps = isRevisit ? revisitSteps : plan.steps;
  const position = isRevisit ? revisitIndex : index;
  const step = steps[position];

  return (
    <ScreenContainer themed>
      <View style={styles.header}>
        <PressableScale haptic onPress={exit} accessibilityLabel="Exit practice" style={styles.closeButton}>
          <Text style={styles.closeIcon}>✕</Text>
        </PressableScale>
        <View style={{ flex: 1 }}>
          <ProgressBar themed progress={position / steps.length} />
        </View>
        <Text style={styles.counter}>
          {position + 1} of {steps.length}
        </Text>
      </View>
      <Text style={styles.eyebrow}>
        {isRevisit ? 'Revisiting tricky words' : step.kind === 'repeat' ? 'Repeat After Me' : step.source === 'review' ? 'Review' : 'New word'}
      </Text>

      <Animated.View style={[{ flex: 1 }, slideIn]}>
        {step.kind === 'word' ? (
          <ExerciseRenderer
            key={step.key}
            exercise={step.exercise}
            onComplete={(wasCorrect, outcome) => {
              recordWordGroupResult(activeProfile.id, step.group.id, wasCorrect).catch(() => {
                // Best-effort, same as lesson sessions.
              });
              const sounded = wasCorrect && !outcome?.mispronounced;
              if (sounded) setRightCount((c) => c + 1);
              const needsRevisit = !isRevisit && step.exercise.type === 'speaking' && !!outcome?.mispronounced;
              if (needsRevisit) queueRevisit(step);
              goToNextStep(revisitSteps.length + (needsRevisit ? 1 : 0));
            }}
          />
        ) : (
          <RepeatAfterMeExercise
            key={step.key}
            item={step.item}
            maxAttempts={isRevisit ? 1 : RAM_MAX_ATTEMPTS}
            isReview={isRevisit}
            onFinish={({ correct, attempts }) => {
              recordRepeatAfterMeItemResult(activeProfile.id, step.item.id, {
                attempts,
                result: correct ? 'correct' : 'needs_review',
              }).catch(() => {});
              if (correct) setRightCount((c) => c + 1);
              const needsRevisit = !isRevisit && !correct;
              if (needsRevisit) queueRevisit(step);
              goToNextStep(revisitSteps.length + (needsRevisit ? 1 : 0));
            }}
          />
        )}
      </Animated.View>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
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
    counter: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
    eyebrow: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: spacing.md,
    },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    centeredEmoji: { fontSize: 56, marginBottom: spacing.sm },
    centeredTitle: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
    centeredBody: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: spacing.md },
    fullWidth: { alignSelf: 'stretch' },
  });
