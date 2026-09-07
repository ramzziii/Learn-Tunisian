import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { TALK_SCENARIOS } from '@/constants/talkScenarios';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { fetchTalkLevel } from '@/data/talkContext';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { canAccessTalkFeature } from '@/lib/ai/accessControl';
import { meetsTalkLevel, type TalkLevel } from '@/lib/talkLevel';

const LEVEL_LABEL: Record<TalkLevel, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
const LEVEL_EMOJI: Record<TalkLevel, string> = { beginner: '🌱', intermediate: '🌿', advanced: '🌳' };

export default function TalkScenarioPicker() {
  const { activeProfile } = useActiveProfile();
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

  if (!activeProfile) return <LoadingScreen />;

  // Defense in depth: Home only shows the entry point for adult/teen
  // profiles, but if a kid profile somehow reaches this route directly,
  // it must not expose the feature — handled gracefully, not with an error.
  if (!canAccessTalkFeature(activeProfile.track)) {
    return (
      <ScreenContainer>
        <BackButton />
        <View style={styles.unavailableContainer}>
          <Text style={styles.unavailableEmoji}>🌱</Text>
          <Text style={styles.unavailableTitle}>Coming soon!</Text>
          <Text style={styles.unavailableBody}>
            This part of the app is for older learners right now. Keep practicing your lessons — more is on the way!
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  if (loadError || level === null) {
    return (
      <ScreenContainer>
        <BackButton />
        {loadError ? (
          <View style={styles.unavailableContainer}>
            <Text style={styles.unavailableEmoji}>😕</Text>
            <Text style={styles.unavailableTitle}>Couldn&apos;t load this</Text>
            <Text style={styles.unavailableBody}>Check your connection and try again.</Text>
            <Button label="Try again" variant="secondary" onPress={load} style={{ marginTop: spacing.md }} />
          </View>
        ) : (
          <LoadingScreen />
        )}
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <BackButton />
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Talk to a Tunisian 🇹🇳</Text>
        <Text style={styles.subtitle}>Choose a situation to practice a real conversation.</Text>

        <Reveal style={styles.levelBadge}>
          <Text style={styles.levelBadgeText}>
            {LEVEL_EMOJI[level]} Your level: {LEVEL_LABEL[level]}
          </Text>
        </Reveal>

        <View style={styles.scenarioList}>
          {TALK_SCENARIOS.map((scenario, index) => {
            const unlocked = meetsTalkLevel(level, scenario.minLevel);
            return (
              <Reveal key={scenario.id} delay={60 + Math.min(index * 40, 320)}>
                <PressableScale
                  haptic={unlocked}
                  disabled={!unlocked}
                  style={[styles.scenarioRow, shadows.card, !unlocked && styles.scenarioRowLocked]}
                  onPress={() => router.push(`/talk/${scenario.id}`)}
                >
                  <Text style={styles.scenarioEmoji}>{unlocked ? scenario.emoji : '🔒'}</Text>
                  <View style={styles.scenarioTextColumn}>
                    <Text style={styles.scenarioTitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                      {scenario.title}
                    </Text>
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

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs },
  levelBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  levelBadgeText: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
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
  scenarioTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  scenarioDescription: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  unavailableContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  unavailableEmoji: { fontSize: 48, marginBottom: spacing.sm },
  unavailableTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  unavailableBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
});
