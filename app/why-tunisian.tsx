import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { WHO_ITS_FOR, WHY_TUNISIAN } from '@/constants/appCopy';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';

/**
 * "Why Tunisian, not MSA?" — a short explanation of the app's focus on
 * spoken Tunisian Arabic and who it's for. Reached from Welcome (signed out)
 * and Profile → About. Copy lives in src/constants/appCopy.ts.
 */
export default function WhyTunisianScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <ScreenContainer themed>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <BackButton themed />
        <Text style={styles.title} accessibilityRole="header">
          {WHY_TUNISIAN.title}
        </Text>
        {WHY_TUNISIAN.paragraphs.map((paragraph) => (
          <Text key={paragraph} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}

        <View style={styles.card}>
          <Text style={styles.cardTitle} accessibilityRole="header">
            Who it’s for
          </Text>
          {WHO_ITS_FOR.map((who) => (
            <View key={who} style={styles.row}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.rowText}>{who}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    content: { paddingBottom: spacing.xl },
    title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.md },
    paragraph: { fontSize: 16, lineHeight: 24, color: colors.textPrimary, marginBottom: spacing.md },
    card: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.sm },
    cardTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
    row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
    bullet: { fontSize: 16, lineHeight: 24, color: colors.primary },
    rowText: { flex: 1, fontSize: 16, lineHeight: 24, color: colors.textPrimary },
  });
