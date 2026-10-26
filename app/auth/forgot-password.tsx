import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/AuthContext';

export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSend = async () => {
    setError(null);
    setIsSubmitting(true);
    const trimmedEmail = email.trim();
    const { error: resetError } = await sendPasswordReset(trimmedEmail);
    setIsSubmitting(false);
    if (resetError) {
      setError(resetError);
      return;
    }
    router.replace({ pathname: '/auth/reset-code', params: { email: trimmedEmail } });
  };

  return (
    <ScreenContainer>
      <BackButton />
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md }}>
        Reset your password
      </Text>
      <Text style={{ fontSize: 15, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xl }}>
        Enter your email and we&apos;ll send you a 6-digit code to set a new password.
      </Text>

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="you@example.com"
        error={error}
      />

      <Button label="Send code" onPress={handleSend} loading={isSubmitting} disabled={!email} />
    </ScreenContainer>
  );
}
