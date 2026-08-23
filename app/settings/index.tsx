import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { TimePicker } from '@/components/onboarding/TimePicker';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { colors, spacing } from '@/constants/theme';
import { fetchDailyGoalSettings, updateDailyGoalSettings } from '@/data/profiles';
import { fetchProgressSummary, type ProfileProgressSummary } from '@/data/progress';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { cancelDailyReminder, requestNotificationPermission, scheduleDailyReminder } from '@/lib/notifications/reminders';
import type { DailyGoalMinutes, DailyGoalSettings } from '@/types/models';

const GOAL_OPTIONS: DailyGoalMinutes[] = [5, 10, 15];

export default function ProfileSettings() {
  const { activeProfile, profiles } = useActiveProfile();
  const [goalSettings, setGoalSettings] = useState<DailyGoalSettings | null>(null);
  const [progressSummary, setProgressSummary] = useState<ProfileProgressSummary | null>(null);
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState<DailyGoalMinutes>(5);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderHour, setReminderHour] = useState(18);
  const [reminderMinute, setReminderMinute] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!activeProfile) return;
    (async () => {
      const [settings, summary] = await Promise.all([
        fetchDailyGoalSettings(activeProfile.id),
        fetchProgressSummary(activeProfile.id),
      ]);
      setGoalSettings(settings);
      setProgressSummary(summary);
      if (settings) {
        setDailyGoalMinutes(settings.dailyGoalMinutes);
        setReminderEnabled(settings.reminderEnabled);
        const [h, m] = settings.reminderTime.split(':').map(Number);
        setReminderHour(h);
        setReminderMinute(m);
      }
    })();
  }, [activeProfile]);

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

  if (!activeProfile || !goalSettings || !progressSummary) return <LoadingScreen />;

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{activeProfile.name}&apos;s settings</Text>

        <Text style={styles.sectionTitle}>What they&apos;ve learned</Text>
        <View style={styles.progressRow}>
          <ProgressStat label="Known" value={progressSummary.wordsKnown} />
          <ProgressStat label="Learning" value={progressSummary.wordsLearning} />
          <ProgressStat label="Words seen" value={progressSummary.totalWordsSeen} />
        </View>

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
          <TimePicker
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
      </ScrollView>
    </ScreenContainer>
  );
}

function ProgressStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.lg },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginTop: spacing.xl, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  progressRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, padding: spacing.md, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.primaryDark },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  reminderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginRight: spacing.xs },
});
