import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { fetchIsReviewer } from '@/data/reviewers';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { completeAccountDeletion } from '@/lib/account/deleteAccount';
import { DELETE_CONFIRMATION_WORD, isDeleteConfirmation } from '@/lib/account/deleteConfirmation';
import { useIsAdmin } from '@/lib/admin/AdminContext';
import { useOnboarding } from '@/lib/onboarding/OnboardingContext';
import { useTheme } from '@/lib/theme/ThemeContext';

const DELETED = [
  'Your profile and settings',
  'Your learning progress, favorites and practice history',
  'Your consent record',
  'Your translation requests, their answers and recordings',
  'Your daily reminders and what this device saved for you',
  'Your sign-in — you won’t be able to sign in with this account again',
];

/**
 * Profile → Account → Delete account. Deletion is done by the
 * delete-account Edge Function for the signed-in account only; this screen
 * explains it, requires typing DELETE, and only reports success when the
 * server says the account is gone. See docs/account-deletion.md.
 */
export default function DeleteAccount() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { profiles } = useActiveProfile();
  const { isAdmin } = useIsAdmin();
  const { reset: resetOnboarding } = useOnboarding();

  const [confirmation, setConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReviewer, setIsReviewer] = useState(false);
  // Guards against a second submit before the first press's state lands.
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchIsReviewer()
      .then((value) => {
        if (!cancelled) setIsReviewer(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const canDelete = isDeleteConfirmation(confirmation) && !isDeleting;

  const handleDelete = async () => {
    if (!isDeleteConfirmation(confirmation) || inFlight.current) return;
    inFlight.current = true;
    setIsDeleting(true);
    setError(null);
    try {
      const result = await completeAccountDeletion({ profileIds: profiles.map((p) => p.id), wasAdmin: isAdmin });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      resetOnboarding();
      router.replace('/welcome');
    } catch {
      setError('Your account couldn’t be deleted right now. Check your connection and try again.');
    } finally {
      inFlight.current = false;
      setIsDeleting(false);
    }
  };

  return (
    <ScreenContainer themed>
      <BackButton themed />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title} accessibilityRole="header">
          Delete account
        </Text>
        <Text style={styles.lead}>
          This permanently deletes your Learn Tunisian account. It can’t be undone, and we can’t restore it later.
        </Text>

        <Text style={styles.sectionTitle}>What’s deleted</Text>
        {DELETED.map((item) => (
          <Text key={item} style={styles.bullet}>
            • {item}
          </Text>
        ))}

        <Text style={styles.sectionTitle}>What’s kept</Text>
        <Text style={styles.bullet}>
          • AI usage and cost records, kept without anything that identifies you, so the app’s monthly costs still add up
        </Text>
        <Text style={styles.bullet}>
          • Shared lessons and phrases you helped create or review stay in the app for other learners, without your
          account linked to them
        </Text>

        {isAdmin ? (
          <Text style={styles.note}>
            You’re an admin. Deleting your account ends your admin access. If no other admin is left, someone with
            access to the Supabase project will need to make another account an admin.
          </Text>
        ) : null}
        {isReviewer ? (
          <Text style={styles.note}>
            You’re a language reviewer. That role ends with your account; reviewing stops until someone else is added
            as a reviewer.
          </Text>
        ) : null}

        <Text style={styles.sectionTitle}>Confirm</Text>
        <Text style={styles.body}>Type {DELETE_CONFIRMATION_WORD} below to confirm.</Text>
        <TextInput
          value={confirmation}
          onChangeText={setConfirmation}
          accessibilityLabel={`Type ${DELETE_CONFIRMATION_WORD} to confirm`}
          placeholder={DELETE_CONFIRMATION_WORD}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!isDeleting}
          style={styles.input}
        />

        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}

        {isDeleting ? (
          <View style={styles.progress} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.error} />
            <Text style={styles.body}>Deleting your account…</Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isDeleting ? 'Deleting your account' : 'Delete my account'}
          accessibilityState={{ disabled: !canDelete, busy: isDeleting }}
          disabled={!canDelete}
          onPress={handleDelete}
          style={[styles.deleteButton, !canDelete && styles.deleteButtonDisabled]}
        >
          <Text style={styles.deleteLabel}>{isDeleting ? 'Deleting…' : 'Delete my account'}</Text>
        </Pressable>
        <Button themed label="Cancel" variant="ghost" disabled={isDeleting} onPress={() => router.back()} />
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    content: { paddingBottom: spacing.xl, gap: spacing.xs },
    title: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.md },
    lead: { fontSize: 16, lineHeight: 23, color: colors.textPrimary, marginTop: spacing.sm },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.lg },
    bullet: { fontSize: 14, lineHeight: 21, color: colors.textSecondary },
    body: { fontSize: 14, lineHeight: 21, color: colors.textSecondary },
    note: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.textPrimary,
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    input: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radii.md,
      padding: spacing.md,
      fontSize: 16,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      marginTop: spacing.xs,
    },
    error: { fontSize: 14, color: colors.error, marginTop: spacing.sm },
    progress: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
    deleteButton: {
      marginTop: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radii.lg,
      alignItems: 'center',
      backgroundColor: colors.error,
    },
    deleteButtonDisabled: { opacity: 0.45 },
    deleteLabel: { fontSize: 16, fontWeight: '700', color: colors.textOnPrimary },
  });
