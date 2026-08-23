import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';

const MAX_VISIBLE_OPTIONS = 6;
// Long enough for a tap on a suggestion to register before the blur hides the list.
const BLUR_CLOSE_DELAY_MS = 150;

interface AutocompleteProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  options: string[];
  placeholder?: string;
}

/** A text field with a filtered dropdown of suggestions — pick one, or just type a value that isn't listed. */
export function Autocomplete({ label, value, onChangeText, options, placeholder }: AutocompleteProps) {
  const [isFocused, setIsFocused] = useState(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = value.trim().toLowerCase();
  const filteredOptions = (
    query.length === 0 ? options : options.filter((option) => option.toLowerCase().includes(query))
  ).slice(0, MAX_VISIBLE_OPTIONS);

  const handleSelect = (option: string) => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    onChangeText(option);
    setIsFocused(false);
  };

  return (
    <View style={[styles.container, isFocused && styles.containerFocused]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => {
          if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
          setIsFocused(true);
        }}
        onBlur={() => {
          blurTimeoutRef.current = setTimeout(() => setIsFocused(false), BLUR_CLOSE_DELAY_MS);
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        autoCapitalize="words"
        autoCorrect={false}
      />

      {isFocused && filteredOptions.length > 0 ? (
        <View style={styles.dropdown}>
          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={styles.scrollArea}>
            {filteredOptions.map((option) => (
              <Pressable key={option} onPress={() => handleSelect(option)} style={styles.option}>
                <Text style={styles.optionText}>{option}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md, position: 'relative', zIndex: 0 },
  containerFocused: { zIndex: 20 },
  label: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.xs },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    overflow: 'hidden',
  },
  scrollArea: { maxHeight: 220 },
  option: { paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md },
  optionText: { fontSize: 15, color: colors.textPrimary },
});
