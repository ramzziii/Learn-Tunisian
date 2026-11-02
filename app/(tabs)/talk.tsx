import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { openUpgradeFlow, PremiumBadge } from '@/components/premium/Premium';
import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { sortScenariosByGoal, TALK_SCENARIOS } from '@/constants/talkScenarios';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { canUseTalk } from '@/lib/access/accessRules';
import { useAccess } from '@/lib/access/AccessContext';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { useTheme } from '@/lib/theme/ThemeContext';

/**
 * Talk to a Tunisian — visible to everyone, usable with Premium only (the
 * server enforces it too). Premium opens all 5 scenarios. A free account sees
 * them with a Premium lock and gets the upgrade flow; a guest gets the
 * create-account explanation. Nothing here calls the AI.
 */
export default function TalkScenarioPicker() {
  const { activeProfile } = useActiveProfile();
  const { tier } = useAccess();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const unlocked = canUseTalk(tier);
  const goal = activeProfile?.learningGoal ?? null;

  const openScenario = (scenarioId: string) => {
    if (unlocked) router.push(`/talk/${scenarioId}`);
    else if (tier === 'guest') router.push({ pathname: '/guest/create-account', params: { reason: 'talk' } });
    else openUpgradeFlow();
  };

  return (
    <ScreenContainer themed>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>Conversation practice</Text>
        <Text style={styles.title}>Talk to a Tunisian 🇹🇳</Text>
        <Text style={styles.subtitle}>Choose a situation to practice a real conversation.</Text>
        {!unlocked ? (
          <Reveal style={styles.lockNote}>
            <Text style={styles.lockNoteText}>
              🔒 Talk is part of Premium — an AI conversation partner.{' '}
              {tier === 'guest' ? 'Create a free account to see the plans.' : 'Your lessons and practice stay free.'}
            </Text>
          </Reveal>
        ) : null}

        <View style={styles.scenarioList}>
          {sortScenariosByGoal(TALK_SCENARIOS, goal).map((scenario, index) => {
            const isRecommended = goal !== null && scenario.relevantGoals.includes(goal);
            return (
              <Reveal key={scenario.id} delay={60 + Math.min(index * 40, 320)}>
                <PressableScale
                  haptic
                  accessibilityRole="button"
                  accessibilityLabel={`${scenario.title}. ${unlocked ? scenario.description : 'Premium'}`}
                  style={[styles.scenarioRow, styles.shadowCard, !unlocked && styles.scenarioRowLocked]}
                  onPress={() => openScenario(scenario.id)}
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
                      {!unlocked ? <PremiumBadge compact /> : null}
                    </View>
                    <Text style={styles.scenarioDescription} numberOfLines={2} maxFontSizeMultiplier={1.3}>
                      {scenario.description}
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
    lockNote: { backgroundColor: `${colors.accent}1F`, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.md },
    lockNoteText: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
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
