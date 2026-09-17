import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/AuthContext';
import { parseRecoveryUrl } from '@/lib/auth/parseRecoveryUrl';

const MIN_PASSWORD_LENGTH = 6;

type Stage = 'parsing' | 'ready' | 'invalid' | 'success';

/** Reached only via the deep link in a password-recovery email (see
 * AuthContext.sendPasswordReset's redirectTo) — exchanges whatever the link
 * carried for a real session, then lets the user set a new password. */
export default function ResetPassword() {
  const { establishRecoverySession, updatePassword } = useAuth();
  const url = Linking.useURL();
  const [stage, setStage] = useState<Stage>('parsing');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!url || stage !== 'parsing') return;
    const params = parseRecoveryUrl(url);
    if (!params) {
      setStage('invalid');
      return;
    }
    establishRecoverySession(params).then(({ error: sessionError }) => {
      setStage(sessionError ? 'invalid' : 'ready');
    });
  }, [url, stage, establishRecoverySession]);

  const handleSubmit = async () => {
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setIsSubmitting(true);
    const { error: updateError } = await updatePassword(password);
    setIsSubmitting(false);
    if (updateError) {
      setError(updateError);
      return;
    }
    setStage('success');
  };

  if (stage === 'parsing') {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 15, color: colors.textSecondary }}>Verifying your link…</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (stage === 'invalid') {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: spacing.lg }}>⏳</Text>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' }}>
            This link isn&apos;t valid
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
            It may have expired or already been used. Request a new one to reset your password.
          </Text>
          <Button
            label="Request a new link"
            onPress={() => router.replace('/auth/forgot-password')}
            style={{ marginTop: spacing.xl }}
          />
        </View>
      </ScreenContainer>
    );
  }

  if (stage === 'success') {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: spacing.lg }}>✅</Text>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' }}>
            Password updated
          </Text>
          <Text
            style={{
              fontSize: 15,
              color: colors.textSecondary,
              textAlign: 'center',
              marginTop: spacing.md,
            }}
          >
            You&apos;re all set — continue into the app below.
          </Text>
          <Button label="Continue" onPress={() => router.replace('/')} style={{ marginTop: spacing.xl }} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md }}>
        Set a new password
      </Text>
      <Text style={{ fontSize: 15, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xl }}>
        Choose a new password for your account.
      </Text>

      <TextField
        label="New password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password-new"
        placeholder="At least 6 characters"
      />
      <TextField
        label="Confirm new password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        autoComplete="password-new"
        placeholder="Re-enter your new password"
        error={error}
      />

      <Button
        label="Update password"
        onPress={handleSubmit}
        loading={isSubmitting}
        disabled={!password || !confirmPassword}
      />
    </ScreenContainer>
  );
}
