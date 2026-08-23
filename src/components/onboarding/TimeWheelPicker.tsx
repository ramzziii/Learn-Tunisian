import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';

interface TimeWheelPickerProps {
  hour24: number;
  minute: number;
  onChange: (hour24: number, minute: number) => void;
}

function toDate(hour24: number, minute: number): Date {
  const date = new Date();
  date.setHours(hour24, minute, 0, 0);
  return date;
}

function formatTime(hour24: number, minute: number): string {
  return toDate(hour24, minute).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * The daily reminder time picker. On iOS this renders the native scrolling
 * wheel (the same spinner style as the Clock/Reminders apps) inline and
 * always visible; Android doesn't have an inline wheel mode, so there it's a
 * button that opens the platform's native time dialog.
 */
export function TimeWheelPicker({ hour24, minute, onChange }: TimeWheelPickerProps) {
  const [isAndroidPickerOpen, setIsAndroidPickerOpen] = useState(false);

  const handleChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setIsAndroidPickerOpen(false);
    if (event.type === 'set' && selectedDate) {
      onChange(selectedDate.getHours(), selectedDate.getMinutes());
    }
  };

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.iosWrapper}>
        <DateTimePicker
          value={toDate(hour24, minute)}
          mode="time"
          display="spinner"
          onChange={handleChange}
          style={styles.iosPicker}
        />
      </View>
    );
  }

  return (
    <View>
      <Pressable style={styles.androidButton} onPress={() => setIsAndroidPickerOpen(true)}>
        <Text style={styles.androidButtonText}>{formatTime(hour24, minute)}</Text>
      </Pressable>
      {isAndroidPickerOpen ? (
        <DateTimePicker value={toDate(hour24, minute)} mode="time" display="default" onChange={handleChange} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  iosWrapper: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  iosPicker: { height: 170, width: '100%' },
  androidButton: {
    alignSelf: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  androidButtonText: { fontSize: 20, fontWeight: '700', color: colors.primary },
});
