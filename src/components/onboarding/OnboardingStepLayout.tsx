import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, spacing } from '@/constants/theme';

interface OnboardingStepLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** 1-indexed current step and total step count — renders a small dot
   * progress indicator so onboarding reads as "almost done," not open-ended. */
  step?: number;
  totalSteps?: number;
}

export function OnboardingStepLayout({ title, subtitle, children, footer, step, totalSteps }: OnboardingStepLayoutProps) {
  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <BackButton />
        {step && totalSteps ? (
          <View style={styles.dots}>
            {Array.from({ length: totalSteps }, (_, i) => (
              <View key={i} style={[styles.dot, i < step && styles.dotFilled]} />
            ))}
          </View>
        ) : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View style={styles.content}>{children}</View>
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, paddingBottom: spacing.lg },
  dots: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotFilled: { backgroundColor: colors.primary },
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  subtitle: { fontSize: 15, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 21 },
  content: { marginTop: spacing.xl, flex: 1 },
  footer: { paddingTop: spacing.md, gap: spacing.sm },
});
