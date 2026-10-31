import { useRef, useState, type ComponentRef, type RefObject } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputKeyPressEvent } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';
import { checkDateOfBirth, digitsOnly, isCompleteDay, isCompleteMonth, type DateOfBirthParts } from '@/lib/dateOfBirthInput';

interface DateOfBirthFieldProps {
  label: string;
  /** ISO date ("YYYY-MM-DD") of the last complete, valid date; null otherwise. */
  value: string | null;
  /** Called on every edit: the ISO date once the fields make a real, past date, otherwise null. */
  onChange: (isoDate: string | null) => void;
}

type Part = keyof DateOfBirthParts;
type InputRef = ComponentRef<typeof TextInput>;

/**
 * Typed date of birth as MM / DD / YYYY. Focus moves to the next field after
 * a valid two-digit month or day, and Backspace in an empty field goes back
 * to the previous one. Only a complete, real, non-future date is reported.
 */
export function DateOfBirthField({ label, onChange }: DateOfBirthFieldProps) {
  const [parts, setParts] = useState<DateOfBirthParts>({ month: '', day: '', year: '' });
  const dayRef = useRef<InputRef>(null);
  const yearRef = useRef<InputRef>(null);
  const monthRef = useRef<InputRef>(null);

  const result = checkDateOfBirth(parts);
  const error = result.status === 'invalid' || result.status === 'future' ? result.message : null;

  const setPart = (part: Part, text: string) => {
    const next = { ...parts, [part]: digitsOnly(text, part === 'year' ? 4 : 2) };
    setParts(next);
    const checked = checkDateOfBirth(next);
    onChange(checked.status === 'valid' ? checked.iso : null);
    if (part === 'month' && isCompleteMonth(next.month)) dayRef.current?.focus();
    if (part === 'day' && isCompleteDay(next.day)) yearRef.current?.focus();
  };

  const backTo = (part: Part, previous: RefObject<InputRef | null>) => (e: TextInputKeyPressEvent) => {
    if (e.nativeEvent.key === 'Backspace' && parts[part] === '') previous.current?.focus();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <TextInput
          ref={monthRef}
          style={[styles.input, styles.short, error && styles.inputError]}
          value={parts.month}
          onChangeText={(t) => setPart('month', t)}
          placeholder="MM"
          placeholderTextColor={colors.textSecondary}
          keyboardType="number-pad"
          maxLength={2}
          accessibilityLabel="Birth month, two digits"
          textContentType="none"
        />
        <Text style={styles.separator}>/</Text>
        <TextInput
          ref={dayRef}
          style={[styles.input, styles.short, error && styles.inputError]}
          value={parts.day}
          onChangeText={(t) => setPart('day', t)}
          onKeyPress={backTo('day', monthRef)}
          placeholder="DD"
          placeholderTextColor={colors.textSecondary}
          keyboardType="number-pad"
          maxLength={2}
          accessibilityLabel="Birth day, two digits"
        />
        <Text style={styles.separator}>/</Text>
        <TextInput
          ref={yearRef}
          style={[styles.input, styles.long, error && styles.inputError]}
          value={parts.year}
          onChangeText={(t) => setPart('year', t)}
          onKeyPress={backTo('year', dayRef)}
          placeholder="YYYY"
          placeholderTextColor={colors.textSecondary}
          keyboardType="number-pad"
          maxLength={4}
          accessibilityLabel="Birth year, four digits"
        />
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center' },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    backgroundColor: colors.surface,
    fontSize: 18,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  inputError: { borderColor: colors.error },
  short: { width: 64 },
  long: { width: 92 },
  separator: { fontSize: 18, color: colors.textSecondary, marginHorizontal: spacing.sm },
  error: { color: colors.error, fontSize: 14, marginTop: spacing.sm },
});
