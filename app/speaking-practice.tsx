import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ExerciseRenderer } from '@/components/exercises/shared/ExerciseRenderer';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { fetchLessonMap, fetchWordGroupsForLesson } from '@/data/content';
import { fetchFavoriteWordGroups } from '@/data/favorites';
import { fetchWeakestWordGroups } from '@/data/progress';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { markSpeakingCompletedToday } from '@/lib/dailyChallengeProgress';
import { getPromptVariant } from '@/lib/wordVariants';
import type { ExerciseItem } from '@/types/exercises';
import type { WordGroupWithVariants } from '@/types/models';

// A fixed, short count — not time-based like the main lesson/review
// SessionRunner — so this reads as "pronounce a handful of phrases," a
// finishable-in-one-sitting micro-session, not another open-ended session.
const POOL_SIZE = 5;

function buildSpeakingQueue(groups: WordGroupWithVariants[]): ExerciseItem[] {
  return groups.slice(0, POOL_SIZE).map((group, i) => ({
    key: `${group.id}-speaking-${i}`,
    type: 'speaking',
    targetGroup: group,
    promptVariant: getPromptVariant(group, i),
    options: [], // unused by the 'speaking' exercise type
  }));
}

/**
 * A short, standalone speaking-only drill — deliberately separate from
 * SessionRunner (the time-based lesson/review engine) rather than shoehorned
 * into it, the same way the Alphabet feature has its own parallel practice
 * runner. Reuses the existing SpeakingPractice exercise component (and all
 * its recording/scoring infrastructure) via ExerciseRenderer, just fed a
 * curated pool: this profile's weakest word_groups first, falling back to
 * favorites, falling back to the current lesson — so there's always
 * something to practice regardless of how much progress exists yet.
 */
export default function SpeakingPracticeScreen() {
  const { activeProfile } = useActiveProfile();
  const [queue, setQueue] = useState<ExerciseItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    if (!activeProfile) return;
    let cancelled = false;
    (async () => {
      let groups = await fetchWeakestWordGroups(activeProfile.id, POOL_SIZE).catch(() => [] as WordGroupWithVariants[]);

      if (groups.length === 0) {
        groups = await fetchFavoriteWordGroups(activeProfile.id).catch(() => [] as WordGroupWithVariants[]);
      }

      if (groups.length === 0) {
        // Brand-new profile with no progress or favorites yet — fall back
        // to whichever lesson is currently unlocked, so there's always
        // something here rather than a dead end.
        const unitsWithLessons = await fetchLessonMap(activeProfile.id).catch(() => []);
        const allLessons = unitsWithLessons.flatMap((u) => u.lessons);
        const continueLesson = allLessons.find((l) => l.state === 'unlocked') ?? allLessons[0] ?? null;
        if (continueLesson) {
          groups = await fetchWordGroupsForLesson(continueLesson.id).catch(() => [] as WordGroupWithVariants[]);
        }
      }

      if (cancelled) return;
      setQueue(buildSpeakingQueue(groups));
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProfile]);

  const handleComplete = (wasCorrect: boolean) => {
    if (wasCorrect) setCorrectCount((c) => c + 1);
    setIndex((i) => {
      const next = i + 1;
      if (!queue || next >= queue.length) {
        setIsDone(true);
        if (activeProfile) markSpeakingCompletedToday(activeProfile.id);
        return i;
      }
      return next;
    });
  };

  if (!activeProfile || queue === null) return <LoadingScreen />;

  if (queue.length === 0) {
    return (
      <ScreenContainer>
        <Reveal style={styles.centered}>
          <Text style={styles.centeredEmoji}>🎙️</Text>
          <Text style={styles.centeredTitle}>Nothing to practice yet</Text>
          <Text style={styles.centeredBody}>
            Finish a lesson first, then come back here to practice saying it out loud.
          </Text>
          <Button label="Back to home" variant="secondary" onPress={() => router.replace('/home')} />
        </Reveal>
      </ScreenContainer>
    );
  }

  if (isDone) {
    return (
      <ScreenContainer>
        <Reveal style={styles.centered}>
          <Text style={styles.centeredEmoji}>🎉</Text>
          <Text style={styles.centeredTitle}>Nice speaking!</Text>
          <Text style={styles.centeredBody}>
            {correctCount} of {queue.length} sounded right.
          </Text>
          <Button label="Done" onPress={() => router.replace('/home')} />
        </Reveal>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <PressableScale haptic onPress={() => router.back()} accessibilityLabel="Exit" style={styles.closeButton}>
          <Text style={styles.closeIcon}>✕</Text>
        </PressableScale>
        <View style={{ flex: 1 }}>
          <ProgressBar progress={index / queue.length} />
        </View>
        <Text style={styles.counter}>
          {index + 1}/{queue.length}
        </Text>
      </View>

      <ExerciseRenderer exercise={queue[index]} onComplete={handleComplete} />
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
    ...shadows.card,
  },
  closeIcon: { fontSize: 16, color: colors.textSecondary },
  counter: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, minWidth: 32, textAlign: 'right' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  centeredEmoji: { fontSize: 56, marginBottom: spacing.sm },
  centeredTitle: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  centeredBody: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
});
