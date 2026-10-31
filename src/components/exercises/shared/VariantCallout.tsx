import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FormDisplay } from '@/components/tunisian/FormDisplay';
import { TunisianText } from '@/components/tunisian/TunisianText';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { hasTwoForms } from '@/lib/display/displayRules';
import { useTheme } from '@/lib/theme/ThemeContext';
import { getAlsoHeardVariants } from '@/lib/wordVariants';
import type { WordGroupWithVariants } from '@/types/models';

interface VariantCalloutProps {
  group: WordGroupWithVariants;
}

/**
 * Shows a word_group's supplementary variants alongside the main exercise:
 * "you might also hear" synonyms, and — for words with masculine and
 * feminine forms — the forms, labelled as forms (never as the learner),
 * in the order of the learner's display preference with the other form one
 * tap away. Renders nothing if the group has neither.
 */
export function VariantCallout({ group }: VariantCalloutProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const alsoHeard = getAlsoHeardVariants(group);
  const twoForms = hasTwoForms(group);

  if (alsoHeard.length === 0 && !twoForms) return null;

  return (
    <View style={styles.container}>
      {twoForms ? (
        <>
          <Text style={styles.line}>This changes with the form used:</Text>
          <FormDisplay group={group} size="sm" arabicStyle={styles.arabic} latinStyle={styles.latin} />
        </>
      ) : null}
      {alsoHeard.map((variant) => (
        <View key={variant.id} style={styles.alsoHeard}>
          <Text style={styles.line}>💡 You might also hear:</Text>
          <TunisianText
            arabic={variant.wordArabic}
            latin={variant.transliteration}
            size="sm"
            layout="inline"
            arabicStyle={styles.arabic}
            latinStyle={styles.latin}
          />
        </View>
      ))}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: `${colors.accent}26`,
      borderRadius: radii.md,
      padding: spacing.sm + 2,
      gap: 4,
      marginBottom: spacing.lg,
      width: '100%',
    },
    line: { fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
    alsoHeard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6 },
    arabic: { fontWeight: '700', color: colors.textPrimary },
    latin: { color: colors.textSecondary },
  });
