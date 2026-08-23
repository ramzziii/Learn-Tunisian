import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/AuthContext';

export default function SignIn() {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async () => {
    setError(null);
    setIsSubmitting(true);
    const { error: signInError } = await signInWithEmail(email.trim(), password);
    setIsSubmitting(false);
    if (signInError) {
      setError(signInError);
      return;
    }
    router.replace('/');
  };

  return (
    <ScreenContainer>
      <BackButton />
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md }}>
        Welcome back
      </Text>
      <Text style={{ fontSize: 15, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xl }}>
        Sign in to continue learning Tunisian Arabic.
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
        autoComplete="password"
        placeholder="••••••••"
        error={error}
      />

      <Button label="Sign in" onPress={handleSignIn} loading={isSubmitting} disabled={!email || !password} />

      <Link href="/auth/sign-up" style={{ marginTop: spacing.lg, textAlign: 'center', color: colors.primary }}>
        Don&apos;t have an account? Sign up
      </Link>
    </ScreenContainer>
  );
}
