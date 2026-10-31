import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TunisianText } from '@/components/tunisian/TunisianText';
import { FORM_EXPLANATION, FORM_OPTIONS, PREVIEW_SAMPLE, SCRIPT_OPTIONS } from '@/constants/displayPreferences';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useDisplayPreferences, type SavePreferenceResult } from '@/lib/display/useDisplayPreferences';
import { useTheme } from '@/lib/theme/ThemeContext';

/**
 * Settings → Display: which script to show (Arabic / Latin / Both) and
 * which form of two-form words to show first (Masculine / Feminine / Show
 * both), with a live sample. Each choice applies and saves straight away; a
 * failed save restores the previous choice and says so.
 */
export function DisplaySettings() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { preferences, setScript, setForm } = useDisplayPreferences();
  const [error, setError] = useState<string | null>(null);

  const apply = async (save: () => Promise<SavePreferenceResult>) => {
    setError(null);
    const result = await save();
    if (!result.ok) setError(result.message);
  };

  const previewForms =
    preferences.form === 'masculine'
      ? [{ label: 'Masculine form', ...PREVIEW_SAMPLE.masculine }]
      : preferences.form === 'feminine'
        ? [{ label: 'Feminine form', ...PREVIEW_SAMPLE.feminine }]
        : [
            { label: 'Masculine form', ...PREVIEW_SAMPLE.masculine },
            { label: 'Feminine form', ...PREVIEW_SAMPLE.feminine },
          ];

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Script</Text>
      <View style={styles.choices} accessibilityRole="radiogroup">
        {SCRIPT_OPTIONS.map((option) => (
          <Choice
            key={option.value}
            label={option.label}
            accessibilityLabel={`Script: ${option.label}`}
            selected={preferences.script === option.value}
            onPress={() => apply(() => setScript(option.value))}
            styles={styles}
          />
        ))}
      </View>

      <Text style={styles.heading}>Default form</Text>
      <Text style={styles.explanation}>{FORM_EXPLANATION}</Text>
      <View style={styles.choices} accessibilityRole="radiogroup">
        {FORM_OPTIONS.map((option) => (
          <Choice
            key={option.value}
            label={option.label}
            accessibilityLabel={`Default form: ${option.label}`}
            selected={preferences.form === option.value}
            onPress={() => apply(() => setForm(option.value))}
            styles={styles}
          />
        ))}
      </View>

      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <View style={styles.preview} accessibilityLabel="Preview">
        <Text style={styles.previewTitle}>Preview: “{PREVIEW_SAMPLE.meaning}”</Text>
        {previewForms.map((form) => (
          <View key={form.label} style={styles.previewForm}>
            <Text style={styles.formLabel}>{form.label}</Text>
            <TunisianText arabic={form.arabic} latin={form.latin} size="lg" arabicStyle={styles.arabic} latinStyle={styles.latin} />
          </View>
        ))}
        <Text style={styles.footnote}>Exercises that test reading Arabic, or typing the transliteration, always show that script.</Text>
      </View>
    </View>
  );
}

function Choice({
  label,
  accessibilityLabel,
  selected,
  onPress,
  styles,
}: {
  label: string;
  accessibilityLabel: string;
  selected: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
        {selected ? '✓ ' : ''}
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { gap: spacing.sm },
    heading: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.xs },
    explanation: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
    choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    choice: {
      minHeight: 44,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      justifyContent: 'center',
    },
    choiceSelected: { borderColor: colors.primary, backgroundColor: `${colors.primary}1A` },
    choiceText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    choiceTextSelected: { color: colors.primaryDark },
    error: { fontSize: 14, color: colors.error },
    preview: {
      marginTop: spacing.xs,
      padding: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: spacing.sm,
    },
    previewTitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
    previewForm: { gap: 2 },
    formLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
    arabic: { color: colors.textPrimary },
    latin: { color: colors.textSecondary },
    footnote: { fontSize: 12, color: colors.textSecondary },
  });
