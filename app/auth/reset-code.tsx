import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/AuthContext';

const MIN_PASSWORD_LENGTH = 6;
// Supabase's email codes are 6 digits by default; the project setting allows
// longer ones, so don't reject those.
const CODE_PATTERN = /^\d{6,10}$/;

/** Reached from Forgot password and from Profile → Change password once the
 * reset email has been sent. The learner types the code from that email — no
 * deep link involved, so this works in Expo Go and whatever email app they use. */
export default function ResetCode() {
  const { verifyPasswordResetCode, updatePassword, sendPasswordReset } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const sentTo = typeof params.email === 'string' ? params.email : '';
  const [email, setEmail] = useState(sentTo);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Codes are single-use: once one is accepted (the user is now signed in),
  // a failed password save is retried without verifying it again.
  const [verified, setVerified] = useState<{ email: string; code: string } | null>(null);
  const [resend, setResend] = useState<{ kind: 'idle' | 'sending' } | { kind: 'sent' | 'error'; message: string }>({
    kind: 'idle',
  });
  const [isDone, setIsDone] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    const trimmedEmail = email.trim();
    const trimmedCode = code.trim();
    if (!trimmedEmail) {
      setError('Enter the email the code was sent to');
      return;
    }
    if (!CODE_PATTERN.test(trimmedCode)) {
      setError('Enter the 6-digit code from the email');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setIsSubmitting(true);
    const alreadyVerified = verified?.email === trimmedEmail && verified.code === trimmedCode;
    if (!alreadyVerified) {
      const { error: verifyError } = await verifyPasswordResetCode(trimmedEmail, trimmedCode);
      if (verifyError) {
        setIsSubmitting(false);
        setError(verifyError);
        return;
      }
      setVerified({ email: trimmedEmail, code: trimmedCode });
    }
    const { error: updateError } = await updatePassword(password);
    setIsSubmitting(false);
    if (updateError) {
      setError(updateError);
      return;
    }
    setIsDone(true);
  };

  const handleResend = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || resend.kind === 'sending') return;
    setResend({ kind: 'sending' });
    try {
      const { error: sendError } = await sendPasswordReset(trimmedEmail);
      setResend(
        sendError
          ? { kind: 'error', message: sendError }
          : { kind: 'sent', message: `A new code is on its way to ${trimmedEmail}.` }
      );
    } catch {
      setResend({ kind: 'error', message: 'Couldn’t send a new code — check your connection and try again.' });
    }
  };

  if (isDone) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: spacing.lg }}>✅</Text>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' }}>
            Password updated
          </Text>
          <Text style={{ fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md }}>
            You&apos;re all set — continue into the app below.
          </Text>
          <Button label="Continue" onPress={() => router.replace('/')} style={{ marginTop: spacing.xl }} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <BackButton />
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md }}>
        Enter your code
      </Text>
      <Text
        style={{ fontSize: 15, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xl, lineHeight: 22 }}
      >
        {sentTo
          ? `We emailed a 6-digit code to ${sentTo}. Enter it below with your new password.`
          : 'Enter your email, the code from the reset email, and your new password.'}
      </Text>

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="you@example.com"
      />
      <TextField
        label="Code"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={10}
        placeholder="6-digit code"
      />
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
        label="Set new password"
        onPress={handleSubmit}
        loading={isSubmitting}
        disabled={!code || !password || !confirmPassword}
      />
      <Button
        label="Send a new code"
        variant="secondary"
        onPress={handleResend}
        loading={resend.kind === 'sending'}
        disabled={!email.trim()}
        style={{ marginTop: spacing.sm }}
      />
      {resend.kind === 'sent' || resend.kind === 'error' ? (
        <Text
          style={{
            fontSize: 14,
            color: resend.kind === 'error' ? colors.error : colors.textSecondary,
            textAlign: 'center',
            marginTop: spacing.sm,
          }}
        >
          {resend.message}
        </Text>
      ) : null}
    </ScreenContainer>
  );
}
