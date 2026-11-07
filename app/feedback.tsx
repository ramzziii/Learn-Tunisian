import Constants from 'expo-constants';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { RequireAccount } from '@/components/guest/RequireAccount';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { FEEDBACK_MAX_LENGTH, feedbackErrorMessage, sendFeedback } from '@/data/feedback';
import { useAuth } from '@/lib/auth/AuthContext';
import { useTheme } from '@/lib/theme/ThemeContext';

/**
 * Profile → Send feedback: a short note to the team (0029 app_feedback).
 * Signed-in accounts only — guests are asked to create a free account, since
 * they never write to the server. Sends the note, the screen it came from and
 * the app version; nothing else about the device.
 */
export default function FeedbackScreen() {
  return (
    <RequireAccount>
      <FeedbackForm />
    </RequireAccount>
  );
}

function FeedbackForm() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { session } = useAuth();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!session || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendFeedback({
        accountId: session.user.id,
        message,
        screen: typeof from === 'string' ? from : null,
        appVersion: Constants.expoConfig?.version ?? null,
      });
      setSent(true);
    } catch (err) {
      setError(feedbackErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <ScreenContainer themed>
        <View style={styles.centered}>
          <Text style={styles.emoji}>💌</Text>
          <Text style={styles.title} accessibilityRole="header">
            Thank you!
          </Text>
          <Text style={styles.body}>We read every note. It helps make Learn Tunisian better.</Text>
          <Button themed label="Done" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer themed>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <BackButton themed />
          <Text style={styles.title} accessibilityRole="header">
            Send feedback
          </Text>
          <Text style={styles.body}>What’s working, what’s confusing, what’s missing — anything helps.</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={FEEDBACK_MAX_LENGTH}
            placeholder="Type your note…"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Your feedback"
            style={styles.input}
          />
          <Text style={styles.counter}>
            {message.length} / {FEEDBACK_MAX_LENGTH}
          </Text>
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button themed label="Send" onPress={send} loading={sending} disabled={message.trim().length === 0} />
          <Text style={styles.privacy}>Only the team sees it. We don’t include anything about your device besides the app version.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scroll: { gap: spacing.sm, paddingBottom: spacing.xl },
    title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.sm },
    body: { fontSize: 15, color: colors.textSecondary, lineHeight: 21 },
    input: {
      minHeight: 160,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radii.md,
      padding: spacing.md,
      fontSize: 16,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      textAlignVertical: 'top',
      marginTop: spacing.sm,
    },
    counter: { fontSize: 12, color: colors.textSecondary, alignSelf: 'flex-end' },
    error: { fontSize: 14, color: colors.error },
    privacy: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    emoji: { fontSize: 48 },
  });
