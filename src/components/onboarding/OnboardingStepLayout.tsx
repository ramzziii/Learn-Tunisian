import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, spacing } from '@/constants/theme';

interface OnboardingStepLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function OnboardingStepLayout({ title, subtitle, children, footer }: OnboardingStepLayoutProps) {
  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
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
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  subtitle: { fontSize: 15, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 21 },
  content: { marginTop: spacing.xl, flex: 1 },
  footer: { paddingTop: spacing.md, gap: spacing.sm },
});
