import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { fetchMyTranslationRequests } from '@/data/translationRequests';
import { useAuth } from '@/lib/auth/AuthContext';
import { useTheme } from '@/lib/theme/ThemeContext';

/**
 * How many of the learner's translation requests have a new answer — checked
 * on focus. Drives the in-app "your translation is ready" notice, which is
 * deliberately generic (never the request or answer text). A failed check
 * just counts as none. Guests have no requests and never call the server.
 */
export function useNewTranslationAnswers(): number {
  const [newAnswers, setNewAnswers] = useState(0);
  const signedIn = !!useAuth().session;

  useFocusEffect(
    useCallback(() => {
      if (!signedIn) return;
      let isCurrent = true;
      fetchMyTranslationRequests()
        .then((requests) => {
          if (isCurrent) setNewAnswers(requests.filter((r) => r.isNewAnswer).length);
        })
        .catch(() => undefined);
      return () => {
        isCurrent = false;
      };
    }, [signedIn])
  );
  return signedIn ? newAnswers : 0;
}

/** The notice line itself, e.g. "🔔 Your translation is ready". */
export function translationReadyText(newAnswers: number): string | null {
  if (newAnswers <= 0) return null;
  return newAnswers === 1 ? '🔔 Your translation is ready' : `🔔 ${newAnswers} translations are ready`;
}

/**
 * A card into Request a Translation with the "answer ready" notice. (Learn →
 * Explore Tunisian is now the entry point; it uses the hook above.)
 */
export function TranslationRequestsEntry() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const newAnswers = useNewTranslationAnswers();

  return (
    <PressableScale haptic accessibilityRole="button" onPress={() => router.push('/translation-requests')} style={styles.entry}>
      <Text style={styles.icon}>💬</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Request a Translation</Text>
        <Text style={styles.body}>Ask for any English phrase — get it in Tunisian with a native recording.</Text>
        {newAnswers > 0 ? <Text style={styles.ready}>{translationReadyText(newAnswers)}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </PressableScale>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    entry: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: c.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.md,
    },
    icon: { fontSize: 24 },
    title: { fontSize: 16, fontWeight: '700', color: c.textPrimary },
    body: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
    ready: { fontSize: 13, fontWeight: '700', color: c.primary, marginTop: spacing.xs },
    chevron: { fontSize: 24, color: c.textSecondary },
  });
