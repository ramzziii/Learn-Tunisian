import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
}

export function TextField({ label, error, style, secureTextEntry, ...inputProps }: TextFieldProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  // Only password fields (secureTextEntry) get the show/hide toggle — a
  // plain TextField with no secureTextEntry renders exactly as before.
  const isPasswordField = secureTextEntry === true;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, isPasswordField && styles.inputWithIcon, error && styles.inputError, style]}
          placeholderTextColor={colors.textSecondary}
          secureTextEntry={isPasswordField && !isPasswordVisible}
          {...inputProps}
        />
        {isPasswordField ? (
          <Pressable
            onPress={() => setIsPasswordVisible((visible) => !visible)}
            hitSlop={8}
            style={styles.eyeButton}
            accessibilityRole="button"
            accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
          >
            <Ionicons name={isPasswordVisible ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.xs },
  inputRow: { justifyContent: 'center' },
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
  inputWithIcon: { paddingRight: spacing.xl + spacing.md },
  inputError: { borderColor: colors.error },
  eyeButton: {
    position: 'absolute',
    right: spacing.md,
    height: '100%',
    justifyContent: 'center',
  },
  error: { color: colors.error, fontSize: 13, marginTop: spacing.xs },
});
