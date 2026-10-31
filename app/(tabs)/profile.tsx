import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { TimeWheelPicker } from '@/components/onboarding/TimeWheelPicker';
import { DisplaySettings } from '@/components/settings/DisplaySettings';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { TranslationRequestsEntry } from '@/components/translation/TranslationRequestsEntry';
import { DAILY_GOAL_OPTIONS } from '@/constants/dailyGoal';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { countCompletedLessons } from '@/data/content';
import { fetchDailyGoalSettings, updateDailyGoalSettings } from '@/data/profiles';
import { fetchProgressSummary, type ProfileProgressSummary } from '@/data/progress';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { useIsAdmin } from '@/lib/admin/AdminContext';
import { useAuth } from '@/lib/auth/AuthContext';
import { requestPasswordReset } from '@/lib/auth/passwordResetRequest';
import { resetFreeAllowances } from '@/lib/premium/freeAllowance';
import { usePremium } from '@/lib/premium/PremiumContext';
import { cancelDailyReminder, requestNotificationPermission, scheduleDailyReminder } from '@/lib/notifications/reminders';
import { useTheme, type ThemePreference } from '@/lib/theme/ThemeContext';
import type { DailyGoalMinutes, DailyGoalSettings } from '@/types/models';

const THEME_OPTIONS: { value: ThemePreference; label: string; emoji: string }[] = [
  { value: 'light', label: 'Light', emoji: '☀️' },
  { value: 'dark', label: 'Dark', emoji: '🌙' },
  { value: 'system', label: 'Match device', emoji: '⚙️' },
];

interface ProgressStats extends ProfileProgressSummary {
  lessonsCompleted: number;
}

/**
 * The Profile tab — moved here from app/settings/index.tsx (was reached via
 * Home's gear icon; that icon is gone now that this is a real tab). Content
 * is unchanged: progress stats, daily goal + reminder, favorites, switch/add
 * profile, plans, sign out — plus the new Appearance section (Light/Dark/
 * Match device), the one place in the app that actually changes the theme.
 *
 * Fully converted to the live theme system.
 */
export default function ProfileScreen() {
  const { activeProfile } = useActiveProfile();
  const { signOut, session, sendPasswordReset } = useAuth();
  // Change password reuses the existing reset flow: email the signed-in
  // account a reset link (app/auth/reset-password.tsx sets the new one).
  const [passwordReset, setPasswordReset] = useState<
    { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; email: string } | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const resetInFlightRef = useRef(false);
  const { isAdmin } = useIsAdmin();
  const { isPremium, adminPreview, setAdminPreview } = usePremium();
  const { colors, preference, setPreference } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [goalSettings, setGoalSettings] = useState<DailyGoalSettings | null>(null);
  const [progressStats, setProgressStats] = useState<ProgressStats | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState<DailyGoalMinutes>(5);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderHour, setReminderHour] = useState(18);
  const [reminderMinute, setReminderMinute] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notificationsDenied, setNotificationsDenied] = useState(false);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    setLoadError(false);

    // The daily goal settings are what this screen actually edits, so that
    // failure is the only one that shows the full-screen error state.
    let settings: DailyGoalSettings | null;
    try {
      settings = await fetchDailyGoalSettings(activeProfile.id);
    } catch {
      setLoadError(true);
      return;
    }

    // The stats below are supplementary — a failure fetching them (e.g. a
    // migration that hasn't been run yet) shouldn't block editing the goal.
    const [summary, lessonsCompleted] = await Promise.all([
      fetchProgressSummary(activeProfile.id).catch(
        () => ({ wordsLearning: 0, wordsMastered: 0, wordsReviewed: 0, totalWordsSeen: 0 }) satisfies ProfileProgressSummary
      ),
      countCompletedLessons(activeProfile.id).catch(() => 0),
    ]);

    setGoalSettings(settings);
    setProgressStats({ ...summary, lessonsCompleted });
    if (settings) {
      setDailyGoalMinutes(settings.dailyGoalMinutes);
      setReminderEnabled(settings.reminderEnabled);
      const [h, m] = settings.reminderTime.split(':').map(Number);
      setReminderHour(h);
      setReminderMinute(m);
    }
  }, [activeProfile]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!activeProfile) return;
    setIsSaving(true);
    setSaved(false);
    setNotificationsDenied(false);
    const reminderTime = `${String(reminderHour).padStart(2, '0')}:${String(reminderMinute).padStart(2, '0')}:00`;
    await updateDailyGoalSettings(activeProfile.id, {
      dailyGoalMinutes,
      reminderTime,
      reminderEnabled,
    });

    if (reminderEnabled) {
      const granted = await requestNotificationPermission();
      if (granted) {
        await scheduleDailyReminder(activeProfile.id, `${reminderHour}:${reminderMinute}`);
      } else {
        setNotificationsDenied(true);
      }
    } else {
      await cancelDailyReminder(activeProfile.id);
    }

    setIsSaving(false);
    setSaved(true);
  };

  const handleChangePassword = async () => {
    const outcome = await requestPasswordReset({
      email: session?.user.email,
      send: sendPasswordReset,
      guard: resetInFlightRef,
      onStart: () => setPasswordReset({ kind: 'sending' }),
    });
    if (outcome.kind === 'busy') return;
    setPasswordReset(outcome);
    if (outcome.kind === 'sent') router.push({ pathname: '/auth/reset-code', params: { email: outcome.email } });
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', "You'll need to sign back in with your email and password.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/');
        },
      },
    ]);
  };

  if (!activeProfile) return <LoadingScreen themed />;

  if (loadError) {
    return (
      <ScreenContainer themed>
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>😕</Text>
          <Text style={styles.errorTitle}>Couldn&apos;t load settings</Text>
          <Text style={styles.errorBody}>Check your connection and try again.</Text>
          <Button themed label="Try again" variant="secondary" onPress={load} />
        </View>
      </ScreenContainer>
    );
  }

  if (!goalSettings || !progressStats) return <LoadingScreen themed />;

  return (
    <ScreenContainer themed>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>Profile</Text>
        <Text style={styles.title}>{activeProfile.name}&apos;s settings</Text>

        {/* Admins only (accounts.is_admin — the /admin routes are gated the
            same way). Up top so it's reachable without scrolling. */}
        {isAdmin ? (
          <PressableScale
            haptic
            accessibilityRole="button"
            onPress={() => router.push('/admin')}
            style={styles.adminEntry}
          >
            <Text style={styles.adminEntryIcon}>🛠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.adminEntryTitle}>Admin dashboard</Text>
              <Text style={styles.adminEntryBody}>Analytics, content, recordings and reviews</Text>
            </View>
            <Text style={styles.adminEntryChevron}>›</Text>
          </PressableScale>
        ) : null}

        <Text style={styles.sectionTitle}>Appearance</Text>
        {THEME_OPTIONS.map((option) => (
          <SelectableCard
            themed
            key={option.value}
            title={`${option.emoji} ${option.label}`}
            selected={preference === option.value}
            onPress={() => setPreference(option.value)}
          />
        ))}

        <Text style={styles.sectionTitle}>Display</Text>
        <DisplaySettings />

        <Text style={styles.sectionTitle}>What they&apos;ve learned</Text>
        <Reveal style={styles.progressGrid}>
          <ProgressStat label="Learning" value={progressStats.wordsLearning} emoji="🌱" />
          <ProgressStat label="Mastered" value={progressStats.wordsMastered} emoji="⭐" />
          <ProgressStat label="Reviewed" value={progressStats.wordsReviewed} emoji="🔄" />
          <ProgressStat label="Words seen" value={progressStats.totalWordsSeen} emoji="👀" />
          <ProgressStat label="Lessons done" value={progressStats.lessonsCompleted} emoji="🏁" />
        </Reveal>

        <Text style={styles.sectionTitle}>Translations</Text>
        <TranslationRequestsEntry />

        <Text style={styles.sectionTitle}>Vocabulary</Text>
        <Button themed label="View favorites" variant="secondary" onPress={() => router.push('/favorites')} />

        <Text style={styles.sectionTitle}>Daily goal</Text>
        {DAILY_GOAL_OPTIONS.map((minutes) => (
          <SelectableCard
            themed
            key={minutes}
            title={`${minutes} minutes a day`}
            selected={dailyGoalMinutes === minutes}
            onPress={() => setDailyGoalMinutes(minutes)}
          />
        ))}

        <View style={styles.reminderHeader}>
          <Text style={styles.sectionTitle}>Daily reminder</Text>
          <Switch
            accessibilityLabel="Daily reminder"
            value={reminderEnabled}
            onValueChange={setReminderEnabled}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>
        {reminderEnabled ? (
          <TimeWheelPicker
            themed
            hour24={reminderHour}
            minute={reminderMinute}
            onChange={(h, m) => {
              setReminderHour(h);
              setReminderMinute(m);
            }}
          />
        ) : null}
        {notificationsDenied ? (
          <Text style={styles.premiumStatus}>
            Notifications are turned off for Learn Tunisian, so the reminder can’t be sent. You can allow them in your
            device settings, then save again.
          </Text>
        ) : null}

        <Button
          themed
          label={saved ? 'Saved' : 'Save changes'}
          onPress={handleSave}
          loading={isSaving}
          style={{ marginTop: spacing.xl }}
        />

        <Text style={styles.sectionTitle}>Premium</Text>
        <Text style={styles.premiumStatus}>
          {isPremium ? '⭐ Premium — everything is unlocked.' : 'Free plan — some content is marked 🔒 Premium.'}
        </Text>
        <Button themed label="See plans & pricing" variant="secondary" onPress={() => router.push('/onboarding/plans')} />

        <Text style={styles.sectionTitle}>Account</Text>
        <Button
          themed
          label="Change password"
          variant="secondary"
          onPress={handleChangePassword}
          loading={passwordReset.kind === 'sending'}
        />
        {passwordReset.kind === 'sent' ? (
          <Text style={styles.resetSent}>
            📬 Check your email — we sent a 6-digit code to {passwordReset.email}. Enter it to set a new password.
          </Text>
        ) : passwordReset.kind === 'error' ? (
          <Text style={styles.resetError}>{passwordReset.message}</Text>
        ) : null}
        <Button themed label="Sign out" variant="secondary" onPress={handleSignOut} style={{ marginTop: spacing.sm }} />
        {/* Opens the confirmation screen; nothing is deleted from here. */}
        <Button
          themed
          label="Delete account"
          variant="ghost"
          onPress={() => router.push('/account/delete')}
          style={{ marginTop: spacing.sm }}
        />

        {isAdmin ? (
          <>
            <Text style={styles.sectionTitle}>Admin</Text>

            {/* Admins always have Premium; this only changes what *they* see,
                to check the free experience. Nothing is written to Supabase. */}
            <View style={[styles.previewCard, adminPreview === 'premium' && styles.previewCardPremium]}>
              <View style={styles.reminderHeader}>
                <Text style={styles.previewTitle}>View app as Premium</Text>
                <Switch
                  accessibilityLabel="View app as Premium"
                  value={adminPreview === 'premium'}
                  onValueChange={(on) => setAdminPreview(on ? 'premium' : 'free')}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>
              <Text style={styles.previewBody}>
                {adminPreview === 'premium'
                  ? 'Showing the full Premium app. Switch off to see exactly what free learners see.'
                  : 'Previewing the free plan — locked items, gates, and daily limits apply to you now.'}
              </Text>
              {adminPreview === 'free' ? (
                <Button
                  themed
                  label="Reset free-plan limits"
                  variant="ghost"
                  onPress={async () => {
                    await resetFreeAllowances(activeProfile.id);
                    Alert.alert('Free-plan limits reset', 'The Speed Match sample round and today’s free review are available again.');
                  }}
                />
              ) : null}
            </View>
          </>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

function ProgressStat({ label, value, emoji }: { label: string; value: number; emoji: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.statCard, styles.shadowCard]}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => {
  const shadowCard = { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 };

  return StyleSheet.create({
    shadowCard,
    eyebrow: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginTop: spacing.md,
    },
    title: { fontSize: 30, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xs, marginBottom: spacing.lg },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textSecondary,
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    progressGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    statCard: {
      width: '30%',
      flexGrow: 1,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: spacing.md,
      alignItems: 'center',
    },
    statEmoji: { fontSize: 20, marginBottom: 2 },
    statValue: { fontSize: 22, fontWeight: '800', color: colors.primary },
    statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
    adminEntry: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1.5,
      borderColor: colors.primary,
      backgroundColor: `${colors.primary}14`,
    },
    adminEntryIcon: { fontSize: 26 },
    adminEntryTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
    adminEntryBody: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    adminEntryChevron: { fontSize: 24, fontWeight: '700', color: colors.primary },
    resetSent: { fontSize: 14, color: colors.success, lineHeight: 20, marginTop: spacing.sm },
    resetError: { fontSize: 14, color: colors.error, lineHeight: 20, marginTop: spacing.sm },
    premiumStatus: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.sm },
    previewCard: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: spacing.xs,
    },
    previewCardPremium: { borderColor: '#D9A441' },
    previewTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    previewBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
    reminderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginRight: spacing.xs },
    errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    errorEmoji: { fontSize: 48, marginBottom: spacing.sm },
    errorTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
    errorBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
  });
};
