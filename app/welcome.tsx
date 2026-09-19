import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, gradients, radii, spacing } from '@/constants/theme';

const BENEFITS = [
  { emoji: '🗣️', text: 'Real spoken Tunisian Arabic — not just Modern Standard' },
  { emoji: '👨‍👩‍👧', text: 'One app, the whole family — everyone gets their own track' },
  { emoji: '🎯', text: '5 minutes a day. No ads, no streak guilt, ever.' },
];

/**
 * The first thing a signed-out user sees (via app/index.tsx's redirect) —
 * sells the app before asking for an email, rather than dropping straight
 * into a sign-in form.
 */
export default function Welcome() {
  return (
    <ScreenContainer style={{ padding: 0 }}>
      <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <Text style={styles.eyebrow}>Ahla! Welcome to</Text>
        <Text style={styles.title}>Learn Tunisian</Text>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.benefits}>
          {BENEFITS.map((benefit) => (
            <View key={benefit.text} style={styles.benefitRow}>
              <Text style={styles.benefitEmoji}>{benefit.emoji}</Text>
              <Text style={styles.benefitText}>{benefit.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Button label="Start learning free" onPress={() => router.push('/auth/sign-up')} />
          <Button
            label="I already have an account"
            variant="ghost"
            onPress={() => router.push('/auth/sign-in')}
            style={{ marginTop: spacing.xs }}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
  },
  eyebrow: { fontSize: 16, color: colors.textOnPrimary, opacity: 0.85, textAlign: 'center' },
  title: { fontSize: 34, fontWeight: '800', color: colors.textOnPrimary, textAlign: 'center', marginTop: spacing.xs },
  body: { flex: 1, justifyContent: 'space-between', padding: spacing.lg },
  benefits: { marginTop: spacing.xl, gap: spacing.lg },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  benefitEmoji: { fontSize: 28 },
  benefitText: { flex: 1, fontSize: 16, color: colors.textPrimary, lineHeight: 22 },
  footer: { paddingBottom: spacing.md },
});
