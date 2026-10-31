import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { SessionRunner } from '@/components/session/SessionRunner';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { spacing, type ThemeColors } from '@/constants/theme';
import { fetchLessonMap, fetchWordGroupsForLesson } from '@/data/content';
import { fetchFavoriteWordGroups } from '@/data/favorites';
import { fetchDailyGoalSettings } from '@/data/profiles';
import { fetchWeakestWordGroups } from '@/data/progress';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { hasEnoughListeningContent, listeningVariant } from '@/lib/listening';
import { prefetchLessonAudio } from '@/lib/offline/audioCache';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { DailyGoalMinutes, WordGroupWithVariants } from '@/types/models';

const POOL_SIZE = 20;
const DEFAULT_GOAL_MINUTES: DailyGoalMinutes = 5;

/**
 * Practice → Listening practice: listening-quiz questions only
 * (src/lib/listening.ts), on the shared session engine — same daily-goal
 * timer, same completion screen, results into the same spaced repetition.
 *
 * Words come from the learner's own practice: weakest first, then
 * favorites, topped up from the lesson they're on — the same sources as
 * Speaking practice. Only words with an approved native recording can be
 * asked; with fewer than 3 of those there's an honest empty state instead
 * of a lopsided or silent quiz.
 */
export default function ListeningPractice() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { activeProfile } = useActiveProfile();
  const [groups, setGroups] = useState<WordGroupWithVariants[] | null>(null);
  const [goalMinutes, setGoalMinutes] = useState<DailyGoalMinutes>(DEFAULT_GOAL_MINUTES);

  useEffect(() => {
    if (!activeProfile) return;
    let cancelled = false;
    (async () => {
      const pool = new Map<string, WordGroupWithVariants>();
      const add = (list: WordGroupWithVariants[]) => list.forEach((g) => pool.has(g.id) || pool.set(g.id, g));

      add(await fetchWeakestWordGroups(activeProfile.id, POOL_SIZE).catch(() => [] as WordGroupWithVariants[]));
      add(await fetchFavoriteWordGroups(activeProfile.id).catch(() => [] as WordGroupWithVariants[]));
      if (!hasEnoughListeningContent([...pool.values()])) {
        const units = await fetchLessonMap(activeProfile.id).catch(() => []);
        const lessons = units.flatMap((u) => u.lessons);
        const current = lessons.find((l) => l.state === 'unlocked') ?? lessons[0] ?? null;
        if (current) add(await fetchWordGroupsForLesson(current.id).catch(() => [] as WordGroupWithVariants[]));
      }
      const settings = await fetchDailyGoalSettings(activeProfile.id).catch(() => null);
      if (cancelled) return;

      const all = [...pool.values()];
      setGoalMinutes(settings?.dailyGoalMinutes ?? DEFAULT_GOAL_MINUTES);
      setGroups(all);
      // Download the recordings now, so the session keeps working if the
      // connection drops part-way.
      prefetchLessonAudio(all.map(listeningVariant).filter((v): v is NonNullable<typeof v> => v !== null));
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProfile]);

  if (!activeProfile || groups === null) return <LoadingScreen themed />;

  if (!hasEnoughListeningContent(groups)) {
    return (
      <ScreenContainer themed>
        <BackButton themed />
        <Reveal style={styles.empty}>
          <Text style={styles.emptyEmoji}>👂</Text>
          <Text style={styles.emptyTitle}>Not enough native recordings yet</Text>
          <Text style={styles.emptyBody}>
            Listening practice uses only words recorded by native speakers. Once a few more of your words have
            recordings, they’ll show up here.
          </Text>
          <Button themed label="Back to Practice" variant="secondary" onPress={() => router.replace('/practice')} />
        </Reveal>
      </ScreenContainer>
    );
  }

  return (
    <SessionRunner
      groups={groups}
      goalMinutes={goalMinutes}
      profileId={activeProfile.id}
      // session_logs only knows lessons and reviews; this is review-style
      // practice of words the learner has met.
      sessionType="review"
      exerciseMode="listening"
      exitHref="/practice"
      emptyMessage="Not enough native recordings to practise listening yet."
    />
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    emptyEmoji: { fontSize: 56, marginBottom: spacing.sm },
    emptyTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    emptyBody: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
  });
