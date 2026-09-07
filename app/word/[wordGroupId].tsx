import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ExerciseRenderer } from '@/components/exercises/shared/ExerciseRenderer';
import { VariantCallout } from '@/components/exercises/shared/VariantCallout';
import { WordPicture } from '@/components/exercises/shared/WordPicture';
import { AudioPlayButton } from '@/components/ui/AudioPlayButton';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { fetchWordGroupWithSiblings } from '@/data/content';
import { addFavorite, fetchFavoriteWordGroupIds, removeFavorite } from '@/data/favorites';
import { fetchProgressForWordGroup, recordWordGroupResult } from '@/data/progress';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { getPromptVariant } from '@/lib/wordVariants';
import type { ExerciseItem, ExerciseOption } from '@/types/exercises';
import type { Progress, WordGroupWithVariants } from '@/types/models';

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const PROGRESS_STATUS_LABEL: Record<Progress['status'], string> = {
  new: 'Not started',
  learning: 'Learning',
  known: 'Mastered',
};

export default function WordDetail() {
  const { wordGroupId } = useLocalSearchParams<{ wordGroupId: string }>();
  const { activeProfile } = useActiveProfile();

  const [group, setGroup] = useState<WordGroupWithVariants | null>(null);
  const [siblings, setSiblings] = useState<WordGroupWithVariants[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [practiceExercise, setPracticeExercise] = useState<ExerciseItem | null>(null);
  const [justPracticed, setJustPracticed] = useState(false);

  useEffect(() => {
    if (!activeProfile || !wordGroupId) return;
    (async () => {
      const [{ group: fetchedGroup, siblings: fetchedSiblings }, fetchedProgress, favoriteIds] = await Promise.all([
        fetchWordGroupWithSiblings(wordGroupId),
        fetchProgressForWordGroup(activeProfile.id, wordGroupId),
        fetchFavoriteWordGroupIds(activeProfile.id),
      ]);
      setGroup(fetchedGroup);
      setSiblings(fetchedSiblings);
      setProgress(fetchedProgress);
      setIsFavorite(favoriteIds.has(wordGroupId));
    })();
  }, [activeProfile, wordGroupId]);

  const displayVariant = group ? getPromptVariant(group, 0) : null;
  const { play, hasAudio, isResolving, hasError, retry } = useWordAudioPlayer(displayVariant);

  if (!activeProfile || !group || !displayVariant) return <LoadingScreen />;

  const toggleFavorite = async () => {
    setIsFavorite((prev) => !prev); // optimistic
    try {
      if (isFavorite) {
        await removeFavorite(activeProfile.id, group.id);
      } else {
        await addFavorite(activeProfile.id, group.id);
      }
    } catch {
      setIsFavorite((prev) => !prev); // revert on failure
    }
  };

  const startPractice = () => {
    setJustPracticed(false);
    const promptVariant = getPromptVariant(group, Date.now());
    const distractors: ExerciseOption[] = shuffled(siblings)
      .slice(0, 3)
      .map((siblingGroup) => ({ group: siblingGroup, variant: getPromptVariant(siblingGroup, Date.now()) }));
    const options = shuffled([{ group, variant: promptVariant }, ...distractors]);

    setPracticeExercise({
      key: `practice-${group.id}-${Date.now()}`,
      type: activeProfile.track === 'kid' ? 'listen_and_tap' : 'reading_match',
      targetGroup: group,
      promptVariant,
      options,
    });
  };

  const handlePracticeComplete = (wasCorrect: boolean) => {
    recordWordGroupResult(activeProfile.id, group.id, wasCorrect)
      .then(() => fetchProgressForWordGroup(activeProfile.id, group.id))
      .then(setProgress)
      .catch(() => {});
    setPracticeExercise(null);
    setJustPracticed(true);
  };

  if (practiceExercise) {
    return (
      <ScreenContainer>
        <ExerciseRenderer exercise={practiceExercise} onComplete={handlePracticeComplete} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <BackButton />
          <PressableScale haptic onPress={toggleFavorite} style={styles.favoriteButton}>
            <Text style={styles.favoriteIcon}>{isFavorite ? '⭐' : '☆'}</Text>
          </PressableScale>
        </View>

        <Reveal style={styles.heroCard}>
          <WordPicture group={group} size={100} />
          <Text style={[styles.arabic, { marginTop: spacing.md }]}>{displayVariant.wordArabic}</Text>
          <Text style={styles.transliteration}>{displayVariant.transliteration}</Text>
          <Text style={styles.meaning}>{group.englishMeaning}</Text>
          <AudioPlayButton
            onPress={play}
            hasAudio={hasAudio}
            isResolving={isResolving}
            hasError={hasError}
            onRetry={retry}
            style={{ marginTop: spacing.lg }}
          />
          <Text style={[styles.verificationBadge, displayVariant.nativeVerified && styles.verificationBadgeVerified]}>
            {displayVariant.nativeVerified ? '✓ Native-speaker verified' : '⚠️ Draft — pending native review'}
          </Text>
        </Reveal>

        <Reveal delay={60}>
          <VariantCallout group={group} />
        </Reveal>

        <Reveal delay={120}>
          <Text style={styles.sectionTitle}>Progress</Text>
          <View style={[styles.progressCard, shadows.card]}>
            <Text style={styles.progressStatus}>{PROGRESS_STATUS_LABEL[progress?.status ?? 'new']}</Text>
            <Text style={styles.progressDetail}>
              {progress ? `${progress.correctCount} correct · ${progress.incorrectCount} missed` : 'Not practiced yet'}
            </Text>
          </View>

          {justPracticed ? <Text style={styles.practicedNote}>Nice — progress updated!</Text> : null}

          <Button
            label="Practice this word"
            onPress={startPractice}
            disabled={siblings.length < 3}
            style={{ marginTop: spacing.lg }}
          />
          {siblings.length < 3 ? (
            <Text style={styles.practiceUnavailable}>Need a few more words in this lesson to practice.</Text>
          ) : null}
        </Reveal>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  favoriteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  favoriteIcon: { fontSize: 24 },
  heroCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginTop: spacing.md,
  },
  arabic: { fontSize: 40, fontWeight: '700', color: colors.textPrimary },
  transliteration: { fontSize: 16, color: colors.textSecondary, fontStyle: 'italic', marginTop: spacing.xs },
  meaning: { fontSize: 18, color: colors.textPrimary, marginTop: spacing.sm, textTransform: 'capitalize' },
  verificationBadge: { fontSize: 12, color: colors.accent, marginTop: spacing.md, fontWeight: '600' },
  verificationBadgeVerified: { color: colors.success },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressCard: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md },
  progressStatus: { fontSize: 17, fontWeight: '700', color: colors.primaryDark },
  progressDetail: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  practicedNote: { fontSize: 13, color: colors.success, marginTop: spacing.md, textAlign: 'center', fontWeight: '600' },
  practiceUnavailable: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
});
