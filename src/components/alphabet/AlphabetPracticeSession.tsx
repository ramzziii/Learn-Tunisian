import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { AlphabetChooseSoundExercise } from '@/components/alphabet/AlphabetChooseSoundExercise';
import { AlphabetListenChooseExercise } from '@/components/alphabet/AlphabetListenChooseExercise';
import { AlphabetSoundMatchExercise } from '@/components/alphabet/AlphabetSoundMatchExercise';
import { AlphabetTrueFalseExercise } from '@/components/alphabet/AlphabetTrueFalseExercise';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { buildAlphabetExerciseQueue, type AlphabetExerciseItem } from '@/lib/alphabet';
import { markLettersPracticed } from '@/lib/alphabetProgress';
import { useFadeInOnChange } from '@/hooks/useFadeInOnChange';

const QUEUE_SIZE = 8;

interface AlphabetPracticeSessionProps {
  onExit: () => void;
}

export function AlphabetPracticeSession({ onExit }: AlphabetPracticeSessionProps) {
  const { activeProfile } = useActiveProfile();
  const [queue, setQueue] = useState<AlphabetExerciseItem[]>(() => buildAlphabetExerciseQueue(QUEUE_SIZE));
  const [index, setIndex] = useState(0);
  const [missedLetterIds, setMissedLetterIds] = useState<string[]>([]);
  const [correctLetterIds, setCorrectLetterIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<'active' | 'summary'>('active');

  const current = queue[index] ?? null;
  const progress = queue.length > 0 ? index / queue.length : 0;
  const fadeAnim = useFadeInOnChange(current?.key);

  const handleComplete = useCallback(
    (correct: boolean) => {
      if (!current) return;
      if (correct) setCorrectLetterIds((prev) => [...prev, current.letterId]);
      else setMissedLetterIds((prev) => [...prev, current.letterId]);

      if (index + 1 >= queue.length) {
        setPhase('summary');
      } else {
        setIndex((prev) => prev + 1);
      }
    },
    [current, index, queue.length]
  );

  // Persist practiced letters once a round finishes, not per-question, so a
  // profile switch mid-round can't leave partial writes.
  const persistedRef = useRef(false);
  useEffect(() => {
    if (phase !== 'summary' || persistedRef.current || !activeProfile || correctLetterIds.length === 0) return;
    persistedRef.current = true;
    markLettersPracticed(activeProfile.id, correctLetterIds);
  }, [phase, activeProfile, correctLetterIds]);

  const handleReviewMistakes = () => {
    const reviewQueue: AlphabetExerciseItem[] = buildAlphabetExerciseQueue(missedLetterIds.length).map(
      (item, i) => ({
        ...item,
        letterId: missedLetterIds[i],
        key: `${missedLetterIds[i]}-review-${i}`,
      })
    );
    setQueue(reviewQueue);
    setIndex(0);
    setMissedLetterIds([]);
    setCorrectLetterIds([]);
    persistedRef.current = false;
    setPhase('active');
  };

  return (
    <ScreenContainer style={styles.screen}>
      <View style={styles.topbar}>
        <Pressable onPress={onExit} style={styles.closeButton}>
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>
        <View style={styles.progressTrack}>
          <ProgressBar progress={progress} />
        </View>
      </View>

      {phase === 'active' && current ? (
        <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
          <ExerciseBody item={current} onComplete={handleComplete} />
        </Animated.View>
      ) : (
        <SummaryCard
          hasMistakes={missedLetterIds.length > 0}
          missedCount={missedLetterIds.length}
          onReviewMistakes={handleReviewMistakes}
          onSkip={onExit}
        />
      )}
    </ScreenContainer>
  );
}

function ExerciseBody({
  item,
  onComplete,
}: {
  item: AlphabetExerciseItem;
  onComplete: (correct: boolean) => void;
}) {
  switch (item.kind) {
    case 'true_false':
      return <AlphabetTrueFalseExercise key={item.key} letterId={item.letterId} onComplete={onComplete} />;
    case 'choose_sound':
      return <AlphabetChooseSoundExercise key={item.key} letterId={item.letterId} onComplete={onComplete} />;
    case 'sound_match':
      return <AlphabetSoundMatchExercise key={item.key} letterId={item.letterId} onComplete={onComplete} />;
    case 'listen_choose':
    default:
      return <AlphabetListenChooseExercise key={item.key} letterId={item.letterId} onComplete={onComplete} />;
  }
}

function SummaryCard({
  hasMistakes,
  missedCount,
  onReviewMistakes,
  onSkip,
}: {
  hasMistakes: boolean;
  missedCount: number;
  onReviewMistakes: () => void;
  onSkip: () => void;
}) {
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 10 }).start();
  }, [pop]);

  const animatedStyle = {
    opacity: pop,
    transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
  };

  if (!hasMistakes) {
    return (
      <View style={styles.summary}>
        <Animated.View style={[styles.summaryCard, shadows.raised, animatedStyle]}>
          <Text style={styles.summaryEmoji}>🎉</Text>
          <Text style={styles.summaryTitle}>Nice work!</Text>
          <Text style={styles.summaryBody}>You got every letter right this round.</Text>
          <Button label="Close" onPress={onSkip} style={styles.summaryCta} />
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.summary}>
      <Animated.View style={[styles.summaryCard, shadows.raised, animatedStyle]}>
        <Text style={styles.summaryEmoji}>📖</Text>
        <Text style={styles.summaryTitle}>You have some mistakes!</Text>
        <Text style={styles.summaryBody}>
          Would you like to review the {missedCount} {missedCount === 1 ? 'letter' : 'letters'} you missed before
          moving on?
        </Text>
        <Button label="Review Mistakes" onPress={onReviewMistakes} style={styles.summaryCta} />
        <Pressable onPress={onSkip} style={styles.skipButton}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#F7F5F2', paddingHorizontal: spacing.lg },
  topbar: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 26, color: colors.textPrimary },
  progressTrack: { flex: 1, marginLeft: spacing.md },
  summary: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  summaryCard: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
  },
  summaryEmoji: { fontSize: 64, marginBottom: spacing.md },
  summaryTitle: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  summaryBody: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  summaryCta: { width: '100%' },
  skipButton: { marginTop: spacing.lg, padding: spacing.sm },
  skipText: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
});
