import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { freeLimitTitle, useLockedItemAction } from '@/components/access/AccessLimit';
import { PremiumBadge } from '@/components/premium/Premium';
import { RepeatAfterMeExercise } from '@/components/repeatAfterMe/RepeatAfterMeExercise';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { loadRepeatAfterMeSession, type RepeatAfterMeItem } from '@/data/repeatAfterMe';
import { useSlideInOnChange } from '@/hooks/useSlideInOnChange';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { itemAllowance } from '@/lib/access/accessRules';
import { useAccess } from '@/lib/access/AccessContext';
import {
  getRepeatAfterMeProgress,
  markRepeatAfterMeSessionCompleted,
  recordRepeatAfterMeItemResult,
} from '@/lib/repeatAfterMe/progress';
import {
  continueAfterUpgradeGate,
  currentItem,
  finishItem,
  RAM_MAX_ATTEMPTS,
  startSession,
  type RamSessionState,
} from '@/lib/repeatAfterMe/session';
import { useTheme } from '@/lib/theme/ThemeContext';

type Session = RamSessionState<RepeatAfterMeItem>;

/**
 * Repeat After Me: practice saying recordings an admin chose to include.
 * Session rules live in src/lib/repeatAfterMe/session.ts. Each recording
 * counts as one item when first started (src/lib/access); which ones fit the
 * allowance is decided where items load (src/data/repeatAfterMe.ts). Progress is saved per item as each one is finished, so
 * leaving early keeps what was done.
 */
export default function RepeatAfterMeScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { activeProfile } = useActiveProfile();
  const { tier, isResolved, claimed, decide, open } = useAccess();
  const onLimitPress = useLockedItemAction();
  const unlimited = tier === 'premium';
  const [session, setSession] = useState<Session | null>(null);
  const [loadError, setLoadError] = useState(false);
  const slideIn = useSlideInOnChange(`${session?.phase}-${session?.index}`);

  const load = useCallback(async () => {
    if (!activeProfile || !isResolved) return;
    setLoadError(false);
    setSession(null);
    try {
      const progress = await getRepeatAfterMeProgress(activeProfile.id);
      const openIds = unlimited ? new Set<string>() : new Set(claimed('repeat_after_me'));
      const { items, lockedCount } = await loadRepeatAfterMeSession({
        unlimited,
        openIds,
        remaining: unlimited ? 0 : Math.max(0, itemAllowance(tier) - openIds.size),
        progress: progress.items,
      });
      setSession(startSession(items, { unlimited, lockedCount }));
    } catch {
      setLoadError(true);
    }
    // Loaded once per learner/tier — counting items as they start mustn't reload the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile, unlimited, tier, isResolved]);

  useEffect(() => {
    load();
  }, [load]);

  // A new recording counts as it starts (an opened one never again).
  const startingId = session?.phase === 'practice' ? currentItem(session)?.id ?? null : null;
  useEffect(() => {
    if (!startingId || decide('repeat_after_me', startingId) !== 'claim') return;
    open('repeat_after_me', startingId)
      .then((allowed) => {
        if (!allowed) setLoadError(true);
      })
      .catch(() => setLoadError(true));
    // Only when a new item starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startingId]);

  /** Applies a transition and persists whatever it just finished. */
  const commit = (previous: Session, next: Session) => {
    setSession(next);
    if (!activeProfile) return;
    const item = currentItem(previous);
    if (item) {
      const before = previous.results[item.id];
      const after = next.results[item.id];
      if (previous.phase === 'review' && after && after !== before) {
        const attemptsThisPass = after.attempts - (before?.attempts ?? 0);
        recordRepeatAfterMeItemResult(activeProfile.id, item.id, { attempts: attemptsThisPass, result: after.result }).catch(() => {});
      } else if (previous.phase === 'practice' && after && !before) {
        recordRepeatAfterMeItemResult(activeProfile.id, item.id, after).catch(() => {});
      }
    }
    if (next.phase === 'done' && previous.phase !== 'done') {
      markRepeatAfterMeSessionCompleted(activeProfile.id).catch(() => {});
    }
  };

  if (loadError) {
    return (
      <ScreenContainer themed>
        <BackButton themed />
        <View style={styles.centered}>
          <Text style={styles.centeredEmoji}>😕</Text>
          <Text style={styles.centeredTitle}>Couldn&apos;t load Repeat After Me</Text>
          <Button themed label="Try again" variant="secondary" onPress={load} />
        </View>
      </ScreenContainer>
    );
  }

  if (!activeProfile || !session) return <LoadingScreen themed />;

  if (session.items.length === 0) {
    return (
      <ScreenContainer themed>
        <BackButton themed />
        <Reveal style={styles.centered}>
          <Text style={styles.centeredEmoji}>🎧</Text>
          <Text style={styles.centeredTitle}>No recordings yet</Text>
          <Text style={styles.centeredBody}>
            New native recordings will appear here as they&apos;re added. Check back soon!
          </Text>
        </Reveal>
      </ScreenContainer>
    );
  }

  if (session.phase === 'upgrade-gate') {
    const hasReview = session.missedIds.length > 0;
    return (
      <ScreenContainer themed>
        <Reveal style={styles.centered}>
          <PremiumBadge signUp={tier === 'guest'} />
          <Text style={styles.centeredTitle}>
            {tier === 'guest' ? 'Create a free account to keep learning' : freeLimitTitle('repeat_after_me')}
          </Text>
          <Text style={styles.centeredBody}>
            Recordings you&apos;ve practised stay open. {session.lockedCount} more{' '}
            {tier === 'guest' ? 'with a free account and Premium.' : 'with Premium.'}
          </Text>
          <Button
            themed
            label={tier === 'guest' ? 'Create a free account' : 'See Premium plans'}
            onPress={onLimitPress}
            style={styles.fullWidth}
          />
          <Button
            themed
            label={hasReview ? 'Continue to review' : 'Finish'}
            variant="ghost"
            onPress={() => commit(session, continueAfterUpgradeGate(session))}
            style={styles.fullWidth}
          />
        </Reveal>
      </ScreenContainer>
    );
  }

  if (session.phase === 'done') {
    const results = Object.values(session.results);
    const gotRight = results.filter((r) => r.result === 'correct').length;
    return (
      <ScreenContainer themed>
        <Reveal style={styles.centered}>
          <Text style={styles.centeredEmoji}>🎉</Text>
          <Text style={styles.centeredTitle}>Session complete</Text>
          <Text style={styles.centeredBody}>
            You got {gotRight} of {results.length} right.
            {results.length > gotRight ? ' The others will come up first next time.' : ''}
          </Text>
          <Button themed label="Practice again" onPress={load} style={styles.fullWidth} />
          <Button themed label="Done" variant="ghost" onPress={() => router.back()} style={styles.fullWidth} />
        </Reveal>
      </ScreenContainer>
    );
  }

  const item = currentItem(session)!;
  const isReview = session.phase === 'review';
  const position = isReview ? session.index + 1 : session.index + 1;
  const total = isReview ? session.missedIds.length : session.items.length;

  return (
    <ScreenContainer themed>
      <View style={styles.header}>
        <BackButton themed />
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>{isReview ? 'Review' : 'Repeat After Me'}</Text>
          <Text style={styles.counter}>
            {position} of {total}
          </Text>
        </View>
      </View>
      <Animated.View style={[{ flex: 1 }, slideIn]}>
        <RepeatAfterMeExercise
          key={`${session.phase}-${item.id}`}
          item={item}
          maxAttempts={isReview ? 1 : RAM_MAX_ATTEMPTS}
          isReview={isReview}
          onFinish={(result) => commit(session, finishItem(session, result))}
        />
      </Animated.View>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
    headerText: { marginTop: spacing.md },
    eyebrow: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    counter: { fontSize: 14, color: colors.textSecondary },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    centeredEmoji: { fontSize: 56, marginBottom: spacing.sm },
    centeredTitle: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
    centeredBody: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: spacing.md },
    fullWidth: { alignSelf: 'stretch', borderRadius: radii.md },
  });
