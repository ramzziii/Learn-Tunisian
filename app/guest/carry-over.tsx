import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useAccess } from '@/lib/access/AccessContext';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { useGuest } from '@/lib/guest/GuestContext';
import { clearGuestDevice, importGuestUsage, moveGuestProgress } from '@/lib/guest/guestCarryOver';
import { useTheme } from '@/lib/theme/ThemeContext';

type Phase = 'importing' | 'ask' | 'moving' | 'error';

/**
 * Shown once after sign-up when this device holds guest-preview data. The
 * items the guest used are always recorded on the new account; practice
 * results and saved words move only with the learner's yes. A failure keeps
 * everything on the device and offers a retry; "Not now" / "Skip" clear it.
 */
export default function GuestCarryOverScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { activeProfile } = useActiveProfile();
  const { refresh } = useAccess();
  const { endGuest } = useGuest();
  const [phase, setPhase] = useState<Phase>('importing');
  // What a retry repeats: recording the used items, or moving the progress.
  const [failedStep, setFailedStep] = useState<'import' | 'move'>('import');

  const importUsage = useCallback(async () => {
    setPhase('importing');
    try {
      await importGuestUsage();
      await refresh();
      setPhase('ask');
    } catch {
      setFailedStep('import');
      setPhase('error');
    }
  }, [refresh]);

  useEffect(() => {
    importUsage();
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async () => {
    await clearGuestDevice().catch(() => undefined);
    await endGuest();
    router.replace('/home');
  };

  const moveProgress = async () => {
    if (!activeProfile) return;
    setPhase('moving');
    try {
      await moveGuestProgress(activeProfile.id);
      await finish();
    } catch {
      setFailedStep('move');
      setPhase('error');
    }
  };

  if (phase === 'importing' || phase === 'moving') return <LoadingScreen themed />;

  if (phase === 'error') {
    return (
      <ScreenContainer themed>
        <View style={styles.container}>
          <Text style={styles.emoji}>😕</Text>
          <Text style={styles.title}>Couldn’t bring your progress over</Text>
          <Text style={styles.body}>Your preview progress is still on this device. Check your connection and try again.</Text>
          <Button themed label="Try again" onPress={failedStep === 'import' ? importUsage : moveProgress} />
          <Button themed label="Skip" variant="ghost" onPress={finish} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer themed>
      <View style={styles.container}>
        <Text style={styles.emoji}>🌱</Text>
        <Text style={styles.title} accessibilityRole="header">
          Bring your preview progress?
        </Text>
        <Text style={styles.body}>
          Your practice results and saved words from the preview can be added to your profile. What you opened
          in the preview already counts toward your free account.
        </Text>
        <Button themed label="Add my preview progress" onPress={moveProgress} />
        <Button themed label="Not now" variant="ghost" onPress={finish} />
      </View>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'stretch', padding: spacing.lg, gap: spacing.sm },
    emoji: { fontSize: 48, textAlign: 'center' },
    title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
    body: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: spacing.sm },
  });
