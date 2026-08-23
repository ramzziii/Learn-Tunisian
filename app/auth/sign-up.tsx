import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/AuthContext';

const MIN_PASSWORD_LENGTH = 6;

export default function SignUp() {
  const { signUpWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);

  const handleSignUp = async () => {
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    setIsSubmitting(true);
    const trimmedEmail = email.trim();
    const { error: signUpError, needsEmailConfirmation } = await signUpWithEmail(trimmedEmail, password);
    setIsSubmitting(false);
    if (signUpError) {
      setError(signUpError);
      return;
    }
    if (needsEmailConfirmation) {
      setConfirmationSentTo(trimmedEmail);
      return;
    }
    // Project has email confirmation disabled -> a session already exists.
    router.replace('/');
  };

  if (confirmationSentTo) {
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
            We sent a confirmation link to{'\n'}
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{confirmationSentTo}</Text>.{'\n\n'}
            Tap the link to activate your account, then come back here and sign in.
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
        Create your account
      </Text>
      <Text style={{ fontSize: 15, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xl }}>
        One account can hold profiles for you and your kids.
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
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password-new"
        placeholder="At least 6 characters"
        error={error}
      />

      <Button label="Create account" onPress={handleSignUp} loading={isSubmitting} disabled={!email || !password} />

      <Link href="/auth/sign-in" style={{ marginTop: spacing.lg, textAlign: 'center', color: colors.primary }}>
        Already have an account? Sign in
      </Link>
    </ScreenContainer>
  );
}
