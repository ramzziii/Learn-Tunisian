import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';
import { getAlsoHeardVariants, getFeminineVariant, getMasculineVariant } from '@/lib/wordVariants';
import type { WordGroupWithVariants } from '@/types/models';

interface VariantCalloutProps {
  group: WordGroupWithVariants;
}

/**
 * Shows a word_group's supplementary variants alongside the main exercise:
 * a "you might also hear" note for also_heard synonyms, and both forms
 * together for masculine/feminine pairs (never one preferred over the
 * other — the app never asks the learner's gender). Renders nothing if the
 * group has neither.
 */
export function VariantCallout({ group }: VariantCalloutProps) {
  const alsoHeard = getAlsoHeardVariants(group);
  const masculine = getMasculineVariant(group);
  const feminine = getFeminineVariant(group);
  const showGenderPair = masculine !== null && feminine !== null;

  if (alsoHeard.length === 0 && !showGenderPair) return null;

  return (
    <View style={styles.container}>
      {showGenderPair ? (
        <>
          <Text style={styles.line}>
            👦 If you&apos;re a boy: <Text style={styles.arabic}>{masculine.wordArabic}</Text> (
            {masculine.transliteration})
          </Text>
          <Text style={styles.line}>
            👧 If you&apos;re a girl: <Text style={styles.arabic}>{feminine.wordArabic}</Text> (
            {feminine.transliteration})
          </Text>
        </>
      ) : null}
      {alsoHeard.map((variant) => (
        <Text key={variant.id} style={styles.line}>
          💡 You might also hear: <Text style={styles.arabic}>{variant.wordArabic}</Text> (
          {variant.transliteration})
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF8E7',
    borderRadius: radii.md,
    padding: spacing.sm + 2,
    gap: 4,
    marginBottom: spacing.lg,
    width: '100%',
  },
  line: { fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
  arabic: { fontWeight: '700' },
});
