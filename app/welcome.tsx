import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { SUPPORTING_LINE, VALUE_STATEMENT, WELCOME_BENEFITS, WHY_TUNISIAN_LINK } from '@/constants/appCopy';
import { colors, gradients, radii, spacing } from '@/constants/theme';

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
        <Text style={styles.valueStatement}>{VALUE_STATEMENT}</Text>
        <Text style={styles.supportingLine}>{SUPPORTING_LINE}</Text>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.benefits}>
          {WELCOME_BENEFITS.map((benefit) => (
            <View key={benefit.text} style={styles.benefitRow}>
              <Text style={styles.benefitEmoji}>{benefit.emoji}</Text>
              <Text style={styles.benefitText}>{benefit.text}</Text>
            </View>
          ))}
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/why-tunisian')}
            hitSlop={8}
            style={({ pressed }) => [styles.whyLink, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.whyLinkText}>{WHY_TUNISIAN_LINK}</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Button label="Start learning free" onPress={() => router.push('/onboarding/age')} />
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
  valueStatement: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textOnPrimary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  supportingLine: {
    fontSize: 15,
    color: colors.textOnPrimary,
    opacity: 0.9,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 21,
  },
  whyLink: { alignSelf: 'flex-start' },
  whyLinkText: { fontSize: 15, fontWeight: '600', color: colors.primary, textDecorationLine: 'underline' },
  body: { flex: 1, justifyContent: 'space-between', padding: spacing.lg },
  benefits: { marginTop: spacing.xl, gap: spacing.lg },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  benefitEmoji: { fontSize: 28 },
  benefitText: { flex: 1, fontSize: 16, color: colors.textPrimary, lineHeight: 22 },
  footer: { paddingBottom: spacing.md },
});
