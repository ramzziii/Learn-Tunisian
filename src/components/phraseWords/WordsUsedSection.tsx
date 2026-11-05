import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TunisianText } from '@/components/tunisian/TunisianText';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { fetchWordsUsed, type WordUsed } from '@/data/phraseWords';
import { useAccess } from '@/lib/access/AccessContext';
import { inPracticeScope } from '@/lib/access/practiceScope';
import { usePracticeScope } from '@/lib/access/usePracticeScope';
import { useTheme } from '@/lib/theme/ThemeContext';

/**
 * "Words used" under a phrase: one card per linked word, in the admin's saved
 * order, showing the word as it appears in this phrase. A card opens the
 * word's page (explanation, recording). A word the learner can't open yet
 * (outside their practice scope — the same rule Word detail uses) shows only
 * the form already visible in the phrase, locked, without its meaning. If
 * access can't be checked, an error — never open cards.
 */
export function WordsUsedSection({ phraseId }: { phraseId: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { tier } = useAccess();
  const { scope, error: scopeError, reload: reloadScope } = usePracticeScope();
  const [used, setUsed] = useState<WordUsed[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    fetchWordsUsed(phraseId)
      .then((rows) => !cancelled && setUsed(rows))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [phraseId, attempt]);
  const retryLoad = useCallback(() => setAttempt((n) => n + 1), []);

  if (loadError) return <Problem text="Couldn’t load the words used." onRetry={retryLoad} styles={styles} />;
  if (!used || used.length === 0) return null;
  if (scopeError) return <Problem text="Couldn’t check which words you can open." onRetry={reloadScope} styles={styles} />;
  if (!scope) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.heading} accessibilityRole="header">
        Words used
      </Text>
      <View style={styles.cards}>
        {used.map((u) => {
          const open = !!u.word && inPracticeScope(scope, u.word);
          const onPress = () => {
            if (open || tier !== 'guest') router.push(`/word/${u.wordId}`);
            else router.push({ pathname: '/guest/create-account', params: { reason: 'keep-learning' } });
          };
          return (
            <PressableScale
              key={u.wordId}
              haptic
              accessibilityRole="button"
              accessibilityLabel={`${u.shownLatin} — ${open ? u.word!.englishMeaning : 'locked'}`}
              onPress={onPress}
              style={[styles.card, shadows.card, !open && styles.cardLocked]}
            >
              <TunisianText arabic={u.shownArabic} latin={u.shownLatin} />
              {open ? <Text style={styles.meaning}>{u.word!.englishMeaning}</Text> : <Text style={styles.locked}>🔒 Locked</Text>}
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

function Problem({ text, onRetry, styles }: { text: string; onRetry: () => void; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.section}>
      <Text style={styles.problem}>{text}</Text>
      <Button themed label="Try again" variant="secondary" onPress={onRetry} />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: { marginTop: spacing.lg, gap: spacing.sm },
    heading: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
    cards: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, minWidth: 96, gap: 2 },
    cardLocked: { opacity: 0.7 },
    meaning: { fontSize: 14, color: colors.textSecondary },
    locked: { fontSize: 13, color: colors.textSecondary },
    problem: { fontSize: 14, color: colors.textSecondary },
  });
