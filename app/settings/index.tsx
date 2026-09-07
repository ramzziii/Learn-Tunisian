import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { TimeWheelPicker } from '@/components/onboarding/TimeWheelPicker';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { countCompletedLessons } from '@/data/content';
import { fetchDailyGoalSettings, updateDailyGoalSettings } from '@/data/profiles';
import { fetchProgressSummary, type ProfileProgressSummary } from '@/data/progress';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { useAuth } from '@/lib/auth/AuthContext';
import { cancelDailyReminder, requestNotificationPermission, scheduleDailyReminder } from '@/lib/notifications/reminders';
import type { DailyGoalMinutes, DailyGoalSettings } from '@/types/models';

const GOAL_OPTIONS: DailyGoalMinutes[] = [5, 10, 15];

interface ProgressStats extends ProfileProgressSummary {
  lessonsCompleted: number;
}

export default function ProfileSettings() {
  const { activeProfile, profiles } = useActiveProfile();
  const { signOut } = useAuth();
  const [goalSettings, setGoalSettings] = useState<DailyGoalSettings | null>(null);
  const [progressStats, setProgressStats] = useState<ProgressStats | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState<DailyGoalMinutes>(5);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderHour, setReminderHour] = useState(18);
  const [reminderMinute, setReminderMinute] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

  if (!activeProfile) return <LoadingScreen />;

  if (loadError) {
    return (
      <ScreenContainer>
        <BackButton />
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>😕</Text>
          <Text style={styles.errorTitle}>Couldn&apos;t load settings</Text>
          <Text style={styles.errorBody}>Check your connection and try again.</Text>
          <Button label="Try again" variant="secondary" onPress={load} />
        </View>
      </ScreenContainer>
    );
  }

  if (!goalSettings || !progressStats) return <LoadingScreen />;

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        <BackButton />
        <Text style={styles.title}>{activeProfile.name}&apos;s settings</Text>

        <Text style={styles.sectionTitle}>What they&apos;ve learned</Text>
        <Reveal style={styles.progressGrid}>
          <ProgressStat label="Learning" value={progressStats.wordsLearning} emoji="🌱" />
          <ProgressStat label="Mastered" value={progressStats.wordsMastered} emoji="⭐" />
          <ProgressStat label="Reviewed" value={progressStats.wordsReviewed} emoji="🔄" />
          <ProgressStat label="Words seen" value={progressStats.totalWordsSeen} emoji="👀" />
          <ProgressStat label="Lessons done" value={progressStats.lessonsCompleted} emoji="🏁" />
        </Reveal>

        <Text style={styles.sectionTitle}>Vocabulary</Text>
        <Button label="View favorites" variant="secondary" onPress={() => router.push('/favorites')} />

        <Text style={styles.sectionTitle}>Daily goal</Text>
        {GOAL_OPTIONS.map((minutes) => (
          <SelectableCard
            key={minutes}
            title={`${minutes} minutes a day`}
            selected={dailyGoalMinutes === minutes}
            onPress={() => setDailyGoalMinutes(minutes)}
          />
        ))}

        <View style={styles.reminderHeader}>
          <Text style={styles.sectionTitle}>Daily reminder</Text>
          <Switch value={reminderEnabled} onValueChange={setReminderEnabled} trackColor={{ true: colors.primary }} />
        </View>
        {reminderEnabled ? (
          <TimeWheelPicker
            hour24={reminderHour}
            minute={reminderMinute}
            onChange={(h, m) => {
              setReminderHour(h);
              setReminderMinute(m);
            }}
          />
        ) : null}

        <Button
          label={saved ? 'Saved' : 'Save changes'}
          onPress={handleSave}
          loading={isSaving}
          style={{ marginTop: spacing.xl }}
        />

        {profiles.length > 1 ? (
          <Button
            label="Switch profile"
            variant="secondary"
            onPress={() => router.push('/profiles')}
            style={{ marginTop: spacing.md }}
          />
        ) : null}
        <Button
          label="Add another profile"
          variant="ghost"
          onPress={() => router.push('/onboarding/who')}
          style={{ marginTop: spacing.sm }}
        />

        <Text style={styles.sectionTitle}>Account</Text>
        <Button label="Sign out" variant="secondary" onPress={handleSignOut} />
      </ScrollView>
    </ScreenContainer>
  );
}

function ProgressStat({ label, value, emoji }: { label: string; value: number; emoji: string }) {
  return (
    <View style={[styles.statCard, shadows.card]}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
