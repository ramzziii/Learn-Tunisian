import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { TimeWheelPicker } from '@/components/onboarding/TimeWheelPicker';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ParentGateModal } from '@/components/ui/ParentGateModal';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { KIDS_SECTION_ENABLED } from '@/constants/features';
import { countCompletedLessons } from '@/data/content';
import { fetchDailyGoalSettings, updateDailyGoalSettings } from '@/data/profiles';
import { fetchProgressSummary, type ProfileProgressSummary } from '@/data/progress';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { useIsAdmin } from '@/lib/admin/AdminContext';
import { useAuth } from '@/lib/auth/AuthContext';
import { cancelDailyReminder, requestNotificationPermission, scheduleDailyReminder } from '@/lib/notifications/reminders';
import { useTheme, type ThemePreference } from '@/lib/theme/ThemeContext';
import type { DailyGoalMinutes, DailyGoalSettings } from '@/types/models';

const GOAL_OPTIONS: DailyGoalMinutes[] = [5, 10, 15];
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
 *
 * Previously, Home intercepted a kid-track profile with ParentGateModal
 * *before* pushing here. A tab-bar tap can't be intercepted the same way, so
 * the gate moved to live here instead — same "gate at the point of entry"
 * idea, just relocated to where the entry now actually happens, mirroring
 * how app/(tabs)/talk.tsx already gates itself for kids via
 * canAccessTalkFeature. Dormant today since kids are flag-hidden.
 */
export default function ProfileScreen() {
  const { activeProfile, profiles } = useActiveProfile();
  const { signOut } = useAuth();
  const { isAdmin } = useIsAdmin();
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
  const [gatePassed, setGatePassed] = useState(false);

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
      }
    } else {
      await cancelDailyReminder(activeProfile.id);
    }

    setIsSaving(false);
    setSaved(true);
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

  const isKid = KIDS_SECTION_ENABLED && activeProfile.track === 'kid';
  if (isKid && !gatePassed) {
    return <ParentGateModal onSuccess={() => setGatePassed(true)} onCancel={() => router.replace('/home')} />;
  }

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
        <Text style={styles.title}>{activeProfile.name}&apos;s settings</Text>

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

        <Text style={styles.sectionTitle}>What they&apos;ve learned</Text>
        <Reveal style={styles.progressGrid}>
          <ProgressStat label="Learning" value={progressStats.wordsLearning} emoji="🌱" />
          <ProgressStat label="Mastered" value={progressStats.wordsMastered} emoji="⭐" />
          <ProgressStat label="Reviewed" value={progressStats.wordsReviewed} emoji="🔄" />
          <ProgressStat label="Words seen" value={progressStats.totalWordsSeen} emoji="👀" />
          <ProgressStat label="Lessons done" value={progressStats.lessonsCompleted} emoji="🏁" />
        </Reveal>

        <Text style={styles.sectionTitle}>Vocabulary</Text>
        <Button themed label="View favorites" variant="secondary" onPress={() => router.push('/favorites')} />

        <Text style={styles.sectionTitle}>Daily goal</Text>
        {GOAL_OPTIONS.map((minutes) => (
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

        <Button
          themed
          label={saved ? 'Saved' : 'Save changes'}
          onPress={handleSave}
          loading={isSaving}
          style={{ marginTop: spacing.xl }}
        />

        {profiles.length > 1 ? (
          <Button
            themed
            label="Switch profile"
            variant="secondary"
            onPress={() => router.push('/profiles')}
            style={{ marginTop: spacing.md }}
          />
        ) : null}
        <Button
          themed
          label="Add another profile"
          variant="ghost"
          onPress={() => router.push('/onboarding/goal-select')}
          style={{ marginTop: spacing.sm }}
        />

        <Text style={styles.sectionTitle}>Premium</Text>
        <Button themed label="See plans & pricing" variant="secondary" onPress={() => router.push('/onboarding/plans')} />

        <Text style={styles.sectionTitle}>Account</Text>
        <Button themed label="Sign out" variant="secondary" onPress={handleSignOut} />

        {isAdmin ? (
          <>
            <Text style={styles.sectionTitle}>Admin</Text>
            <Button themed label="Content Admin" variant="secondary" onPress={() => router.push('/admin')} />
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
    title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.lg },
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
    statValue: { fontSize: 22, fontWeight: '800', color: colors.primaryDark },
    statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
    reminderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginRight: spacing.xs },
    errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    errorEmoji: { fontSize: 48, marginBottom: spacing.sm },
    errorTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
    errorBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
  });
};
