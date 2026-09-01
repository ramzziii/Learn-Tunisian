import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { TALK_SCENARIOS } from '@/constants/talkScenarios';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { canAccessTalkFeature } from '@/lib/ai/accessControl';
import type { ConversationDifficulty } from '@/lib/ai/types';

const DIFFICULTIES: { value: ConversationDifficulty; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
];

export default function TalkScenarioPicker() {
  const { activeProfile } = useActiveProfile();
  const [difficulty, setDifficulty] = useState<ConversationDifficulty>('beginner');

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

  return (
    <ScreenContainer>
      <BackButton />
      <Text style={styles.title}>Talk to a Tunisian 🇹🇳</Text>
      <Text style={styles.subtitle}>Choose a situation to practice a real conversation.</Text>

      <Text style={styles.sectionLabel}>Difficulty</Text>
      <View style={styles.difficultyRow}>
        {DIFFICULTIES.map((option) => (
          <SelectableCard
            key={option.value}
            title={option.label}
            selected={difficulty === option.value}
            onPress={() => setDifficulty(option.value)}
          />
        ))}
      </View>

      <Text style={styles.sectionLabel}>Choose a situation</Text>
      <View style={styles.scenarioGrid}>
        {TALK_SCENARIOS.map((scenario) => (
          <PressableScale
            key={scenario.id}
            style={[styles.scenarioCard, shadows.card]}
            onPress={() => router.push(`/talk/${scenario.id}?difficulty=${difficulty}`)}
          >
            <Text style={styles.scenarioEmoji}>{scenario.emoji}</Text>
            <Text style={styles.scenarioTitle}>{scenario.title}</Text>
            <Text style={styles.scenarioDescription}>{scenario.description}</Text>
          </PressableScale>
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  difficultyRow: { flexDirection: 'row', gap: spacing.sm },
  scenarioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingBottom: spacing.xl },
  scenarioCard: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  scenarioEmoji: { fontSize: 36, marginBottom: spacing.xs },
  scenarioTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  scenarioDescription: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: 2 },
  unavailableContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  unavailableEmoji: { fontSize: 48, marginBottom: spacing.sm },
  unavailableTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  unavailableBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
});
