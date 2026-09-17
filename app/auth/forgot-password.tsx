import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

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
  const [sentTo, setSentTo] = useState<string | null>(null);

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
    setSentTo(trimmedEmail);
  };

  if (sentTo) {
    return (
      <ScreenContainer>
        <BackButton />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: spacing.lg }}>📬</Text>
          <Text style={{ fontSize: 26, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' }}>
            Check your email
          </Text>
          <Text
            style={{
              fontSize: 15,
              color: colors.textSecondary,
              textAlign: 'center',
              marginTop: spacing.md,
              lineHeight: 22,
            }}
          >
            If an account exists for{'\n'}
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{sentTo}</Text>, we sent a link to reset
            your password.{'\n\n'}
            Tap the link, then come back here and sign in with your new password.
          </Text>
          <Button
            label="Back to sign in"
            variant="secondary"
            onPress={() => router.replace('/auth/sign-in')}
            style={{ marginTop: spacing.xl }}
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <BackButton />
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md }}>
        Reset your password
      </Text>
      <Text style={{ fontSize: 15, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xl }}>
        Enter your email and we&apos;ll send you a link to set a new password.
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

      <Button label="Send reset link" onPress={handleSend} loading={isSubmitting} disabled={!email} />
    </ScreenContainer>
  );
}
