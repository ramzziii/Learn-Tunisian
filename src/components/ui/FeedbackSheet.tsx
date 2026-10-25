import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/ui/PressableScale';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';

type Tone = 'success' | 'error';

interface FeedbackSheetProps {
  visible: boolean;
  tone: Tone;
  icon: string;
  title: string;
  message?: string;
  /** Extra content (the correct answer, compare-recordings buttons, …). */
  children?: ReactNode;
  primaryLabel?: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** When set, the primary button counts down and fires by itself at 0. */
  autoAdvanceSeconds?: number;
  /** Holds the countdown (e.g. while the learner replays a recording). */
  paused?: boolean;
}

/**
 * The result pop-up shown after every answer: springs up from the bottom over
 * a soft backdrop, with a bouncing icon and a haptic. With
 * `autoAdvanceSeconds`, the primary "Next" button shows a countdown (and a
 * bar draining beneath it) and moves on by itself when it hits zero; tapping
 * it moves on straight away. The primary action only ever fires once.
 */
export function FeedbackSheet({
  visible,
  tone,
  icon,
  title,
  message,
  children,
  primaryLabel = 'Next',
  onPrimary,
  secondaryLabel,
  onSecondary,
  autoAdvanceSeconds,
  paused = false,
}: FeedbackSheetProps) {
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useContext(SafeAreaInsetsContext);
  const bottomInset = insets?.bottom ?? 0;

  const enter = useRef(new Animated.Value(0)).current;
  const iconPop = useRef(new Animated.Value(0)).current;
  const drain = useRef(new Animated.Value(1)).current;
  const hasFiredRef = useRef(false);
  const [remaining, setRemaining] = useState(autoAdvanceSeconds ?? 0);
  const hasCountdown = autoAdvanceSeconds !== undefined && autoAdvanceSeconds > 0;

  const fire = (action: () => void) => {
    if (hasFiredRef.current) return;
    hasFiredRef.current = true;
    action();
  };

  // Entrance: sheet springs up, then the icon pops.
  useEffect(() => {
    if (!visible) return;
    hasFiredRef.current = false;
    enter.setValue(0);
    iconPop.setValue(0);
    Animated.parallel([
      Animated.spring(enter, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 7 }),
      Animated.sequence([
        Animated.delay(120),
        Animated.spring(iconPop, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 18 }),
      ]),
    ]).start();
    Haptics.notificationAsync(
      tone === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
    ).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Countdown: ticks once a second and drains the bar; holds while paused.
  useEffect(() => {
    if (!visible || !hasCountdown) return;
    setRemaining(autoAdvanceSeconds!);
    drain.setValue(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, autoAdvanceSeconds]);

  useEffect(() => {
    if (!visible || !hasCountdown || paused || hasFiredRef.current) return;
    const total = autoAdvanceSeconds! * 1000;
    let drainAnim: Animated.CompositeAnimation | null = null;
    drain.stopAnimation((value) => {
      drainAnim = Animated.timing(drain, {
        toValue: 0,
        duration: Math.max(0, value * total),
        easing: Easing.linear,
        useNativeDriver: false,
      });
      drainAnim.start();
    });
    const interval = setInterval(() => {
      setRemaining((r) => {
        const next = r - 1;
        if (next <= 0) {
          clearInterval(interval);
          // Deferred so the state update finishes before moving on.
          setTimeout(() => fire(onPrimary), 0);
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => {
      clearInterval(interval);
      drainAnim?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, hasCountdown, paused]);

  if (!visible) return null;

  const isSuccess = tone === 'success';
  const accent = isSuccess ? colors.success : colors.error;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => fire(onPrimary)}>
      <Animated.View style={[styles.backdrop, { opacity: enter }]} />
      <View style={styles.anchor} pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          accessibilityLiveRegion="polite"
          style={[
            styles.sheet,
            { paddingBottom: spacing.lg + bottomInset },
            {
              transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [360, 0] }) }],
            },
          ]}
        >
          <View style={[styles.accentBar, { backgroundColor: accent }]} />
          <View style={styles.headerRow}>
            <Animated.View
              style={[
                styles.iconBadge,
                { backgroundColor: `${accent}22` },
                {
                  transform: [
                    { scale: iconPop },
                    { rotate: iconPop.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '0deg'] }) },
                  ],
                },
              ]}
            >
              <Text style={styles.icon}>{icon}</Text>
            </Animated.View>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: isSuccess ? colors.success : colors.textPrimary }]}>{title}</Text>
              {message ? <Text style={styles.message}>{message}</Text> : null}
            </View>
          </View>

          {children ? <View style={styles.content}>{children}</View> : null}

          <View style={styles.actions}>
            {secondaryLabel && onSecondary ? (
              <View style={styles.cell}>
                <PressableScale haptic onPress={() => fire(onSecondary)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryLabel}>{secondaryLabel}</Text>
                </PressableScale>
              </View>
            ) : null}
            <View style={styles.cell}>
              <PressableScale haptic onPress={() => fire(onPrimary)} accessibilityRole="button">
                <LinearGradient
                  colors={isSuccess ? gradients.success : gradients.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryLabel}>{primaryLabel}</Text>
                  {hasCountdown ? (
                    <View style={styles.countBadge}>
                      <Text testID="feedback-countdown" style={styles.countText}>
                        {remaining}
                      </Text>
                    </View>
                  ) : null}
                </LinearGradient>
              </PressableScale>
              {hasCountdown ? (
                <View style={styles.drainTrack}>
                  <Animated.View
                    style={[
                      styles.drainFill,
                      { backgroundColor: accent },
                      { width: drain.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
                    ]}
                  />
                </View>
              ) : null}
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15, 20, 25, 0.28)' },
    anchor: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      gap: spacing.md,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: -6 },
      elevation: 16,
    },
    accentBar: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, opacity: 0.7 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    iconBadge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
    icon: { fontSize: 30 },
    headerText: { flex: 1 },
    title: { fontSize: 22, fontWeight: '800' },
    message: { fontSize: 15, color: colors.textSecondary, marginTop: 2, lineHeight: 21 },
    content: { gap: spacing.sm },
    actions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    cell: { flex: 1, minWidth: 0 },
    primaryButton: {
      minHeight: 56,
      borderRadius: radii.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    primaryLabel: { fontSize: 17, fontWeight: '800', color: colors.textOnPrimary },
    countBadge: {
      minWidth: 26,
      height: 26,
      borderRadius: 13,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.28)',
    },
    countText: { fontSize: 14, fontWeight: '800', color: colors.textOnPrimary, fontVariant: ['tabular-nums'] },
    drainTrack: { height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: spacing.xs, overflow: 'hidden' },
    drainFill: { height: '100%', borderRadius: 2 },
    secondaryButton: {
      minHeight: 56,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: colors.primary,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    secondaryLabel: { fontSize: 16, fontWeight: '700', color: colors.primary },
  });
