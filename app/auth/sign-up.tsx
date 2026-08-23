import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

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

  const handleSignUp = async () => {
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    setIsSubmitting(true);
    const { error: signUpError } = await signUpWithEmail(email.trim(), password);
    setIsSubmitting(false);
    if (signUpError) {
      setError(signUpError);
      return;
    }
    // New account -> straight into onboarding to create the first profile.
    router.replace('/');
  };

  return (
    <ScreenContainer>
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.xl }}>
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
