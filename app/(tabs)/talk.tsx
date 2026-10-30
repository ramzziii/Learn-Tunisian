import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { sortScenariosByGoal, TALK_SCENARIOS } from '@/constants/talkScenarios';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { fetchTalkLevel } from '@/data/talkContext';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { meetsTalkLevel, type TalkLevel } from '@/lib/talkLevel';
import { useTheme } from '@/lib/theme/ThemeContext';

const LEVEL_LABEL: Record<TalkLevel, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
const LEVEL_EMOJI: Record<TalkLevel, string> = { beginner: '🌱', intermediate: '🌿', advanced: '🌳' };

export default function TalkScenarioPicker() {
  const { activeProfile } = useActiveProfile();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [level, setLevel] = useState<TalkLevel | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    setLoadError(false);
    try {
      setLevel(await fetchTalkLevel(activeProfile.id));
    } catch {
      setLoadError(true);
    }
  }, [activeProfile]);

  useEffect(() => {
    load();
  }, [load]);

  if (!activeProfile) return <LoadingScreen themed />;


  if (loadError || level === null) {
    return (
      <ScreenContainer themed>
        {loadError ? (
          <View style={styles.unavailableContainer}>
            <Text style={styles.unavailableEmoji}>😕</Text>
            <Text style={styles.unavailableTitle}>Couldn&apos;t load this</Text>
            <Text style={styles.unavailableBody}>Check your connection and try again.</Text>
            <Button themed label="Try again" variant="secondary" onPress={load} style={{ marginTop: spacing.md }} />
          </View>
        ) : (
          <LoadingScreen themed />
        )}
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer themed>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>Conversation practice</Text>
        <Text style={styles.title}>Talk to a Tunisian 🇹🇳</Text>
        <Text style={styles.subtitle}>Choose a situation to practice a real conversation.</Text>

        <Reveal style={styles.levelBadge}>
          <Text style={styles.levelBadgeText}>
            {LEVEL_EMOJI[level]} Your level: {LEVEL_LABEL[level]}
          </Text>
        </Reveal>

        <View style={styles.scenarioList}>
          {sortScenariosByGoal(TALK_SCENARIOS, activeProfile.learningGoal).map((scenario, index) => {
            const unlocked = meetsTalkLevel(level, scenario.minLevel);
            const isRecommended =
              activeProfile.learningGoal !== null && scenario.relevantGoals.includes(activeProfile.learningGoal);
            return (
              <Reveal key={scenario.id} delay={60 + Math.min(index * 40, 320)}>
                <PressableScale
                  haptic={unlocked}
                  disabled={!unlocked}
                  style={[styles.scenarioRow, styles.shadowCard, !unlocked && styles.scenarioRowLocked]}
                  onPress={() => router.push(`/talk/${scenario.id}`)}
                >
                  <Text style={styles.scenarioEmoji}>{unlocked ? scenario.emoji : '🔒'}</Text>
                  <View style={styles.scenarioTextColumn}>
                    <View style={styles.scenarioTitleRow}>
                      <Text style={styles.scenarioTitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                        {scenario.title}
                      </Text>
                      {unlocked && isRecommended ? (
                        <View style={styles.recommendedBadge}>
                          <Text style={styles.recommendedBadgeText}>For you</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.scenarioDescription} numberOfLines={2} maxFontSizeMultiplier={1.3}>
                      {unlocked ? scenario.description : `Unlocks at ${LEVEL_LABEL[scenario.minLevel]} level`}
                    </Text>
                  </View>
                </PressableScale>
              </Reveal>
            );
          })}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) => {
  const shadowCard = { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 };

  return StyleSheet.create({
    shadowCard,
    eyebrow: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginTop: spacing.md,
    },
    title: { fontSize: 30, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xs },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 20 },
    levelBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surface,
      borderRadius: radii.pill,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      marginTop: spacing.md,
      marginBottom: spacing.lg,
    },
    levelBadgeText: { fontSize: 13, fontWeight: '700', color: colors.primary },
    scenarioList: { gap: spacing.sm, paddingBottom: spacing.xl },
    scenarioRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
    },
    scenarioRowLocked: { opacity: 0.55 },
    scenarioEmoji: { fontSize: 32 },
    scenarioTextColumn: { flex: 1 },
    scenarioTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    scenarioTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    recommendedBadge: {
      backgroundColor: `${colors.success}1F`,
      borderRadius: radii.pill,
      paddingVertical: 2,
      paddingHorizontal: spacing.xs,
    },
    recommendedBadgeText: { fontSize: 10, fontWeight: '700', color: colors.success },
    scenarioDescription: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    unavailableContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    unavailableEmoji: { fontSize: 48, marginBottom: spacing.sm },
    unavailableTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
    unavailableBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  });
};
