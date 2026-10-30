import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { OnboardingStepLayout } from '@/components/onboarding/OnboardingStepLayout';
import { colors, radii, spacing } from '@/constants/theme';
import { useOnboarding } from '@/lib/onboarding/OnboardingContext';

export default function Consent() {
  const { update } = useOnboarding();
  const [agreed, setAgreed] = useState(false);

  const handleContinue = () => {
    update({ consentGiven: true });
    router.push('/onboarding/profile');
  };

  return (
    <OnboardingStepLayout
      title="Before we start"
      step={2}
      totalSteps={5}
      subtitle="Please review our Terms & Conditions and Privacy Policy before creating your profile."
      footer={
        <Button label="Agree and continue" onPress={handleContinue} disabled={!agreed} />
      }
    >
      <ScrollView style={styles.box} nestedScrollEnabled>
        <Text style={styles.boxTitle}>Terms & Conditions</Text>
        <Text style={styles.boxText}>
          Learn Tunisian is provided as-is to help you learn Tunisian Arabic. We don&apos;t sell your data, we
          don&apos;t show ads, and we don&apos;t use manipulative notifications. Full legal text goes here.
        </Text>
        <Text style={styles.boxTitle}>Privacy Policy</Text>
        <Text style={styles.boxText}>
          We store the profile information you enter (name, age, language, and learning progress) to run the app.
          Full legal text goes here.
        </Text>
      </ScrollView>

      <Pressable style={styles.checkboxRow} onPress={() => setAgreed((v) => !v)}>
        <View style={[styles.checkbox, agreed && styles.checkboxChecked]} />
        <Text style={styles.checkboxLabel}>I have read and agree to the Terms & Conditions and Privacy Policy.</Text>
      </Pressable>
    </OnboardingStepLayout>
  );
}

const styles = StyleSheet.create({
  box: {
    maxHeight: 220,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  boxTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  boxText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: spacing.md },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.lg },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginTop: 2,
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxLabel: { flex: 1, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
});
