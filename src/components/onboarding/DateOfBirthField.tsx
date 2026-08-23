import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';
import { dateToIsoDate, formatDateOfBirth } from '@/lib/age';

const TODAY = new Date();
const EARLIEST_BIRTH_DATE = new Date(TODAY.getFullYear() - 100, 0, 1);
const DEFAULT_PICKER_DATE = new Date(TODAY.getFullYear() - 8, TODAY.getMonth(), TODAY.getDate());

interface DateOfBirthFieldProps {
  label: string;
  value: string | null; // ISO date string
  onChange: (isoDate: string) => void;
}

export function DateOfBirthField({ label, value, onChange }: DateOfBirthFieldProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const handleChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setIsPickerOpen(false);
    if (event.type === 'set' && selectedDate) {
      onChange(dateToIsoDate(selectedDate));
    }
  };

  const pickerValue = value ? new Date(value) : DEFAULT_PICKER_DATE;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.button} onPress={() => setIsPickerOpen((open) => !open)}>
        <Text style={value ? styles.valueText : styles.placeholderText}>
          {value ? formatDateOfBirth(value) : 'Select date of birth'}
        </Text>
      </Pressable>

      {isPickerOpen ? (
        <View style={Platform.OS === 'ios' ? styles.iosWrapper : undefined}>
          <DateTimePicker
            value={pickerValue}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={TODAY}
            minimumDate={EARLIEST_BIRTH_DATE}
            onChange={handleChange}
            style={Platform.OS === 'ios' ? styles.iosPicker : undefined}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.xs },
  button: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    backgroundColor: colors.surface,
  },
  valueText: { fontSize: 16, color: colors.textPrimary },
  placeholderText: { fontSize: 16, color: colors.textSecondary },
  iosWrapper: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  iosPicker: { height: 170, width: '100%' },
});
