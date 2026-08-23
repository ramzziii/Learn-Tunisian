import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, spacing } from '@/constants/theme';
import { useOnboarding } from '@/lib/onboarding/OnboardingContext';

export default function WhoIsThisFor() {
  const { update } = useOnboarding();

  const choose = (forWhom: 'myself' | 'child') => {
    update({ forWhom });
    router.push('/onboarding/consent');
  };

  return (
    <ScreenContainer>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={styles.eyebrow}>Ahla! Welcome to</Text>
        <Text style={styles.title}>Learn Tunisian</Text>
        <Text style={styles.subtitle}>Who is this for?</Text>

        <Pressable style={styles.option} onPress={() => choose('myself')}>
          <Text style={styles.optionEmoji}>🙋</Text>
          <Text style={styles.optionLabel}>Myself</Text>
        </Pressable>

        <Pressable style={styles.option} onPress={() => choose('child')}>
          <Text style={styles.optionEmoji}>🧒</Text>
          <Text style={styles.optionLabel}>My child</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
  title: { fontSize: 34, fontWeight: '800', color: colors.primaryDark, textAlign: 'center', marginBottom: spacing.xl },
  subtitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  optionEmoji: { fontSize: 32 },
  optionLabel: { fontSize: 18, fontWeight: '600', color: colors.textPrimary },
});
