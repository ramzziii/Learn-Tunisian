import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { PremiumBadge } from '@/components/premium/Premium';
import { PressableScale } from '@/components/ui/PressableScale';
import { exerciseSizing, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { LessonWithState } from '@/types/models';

interface LessonNodeProps {
  lesson: LessonWithState;
  onPress: () => void;
  /** Beyond the free plan — stays visible and tappable (onPress should open
   * the upgrade flow), marked Premium instead of as progress-locked. */
  premiumLocked?: boolean;
}

// This component's only consumer is app/(tabs)/learn.tsx (also converted to
// the theme system), so unlike most shared UI components it can react to
// the live theme unconditionally — no risk of an unconverted screen
// suddenly rendering it in the wrong palette.
export function LessonNode({ lesson, onPress, premiumLocked = false }: LessonNodeProps) {
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const sizing = exerciseSizing;
  const isLocked = lesson.state === 'locked' && !premiumLocked;
  const isCompleted = lesson.state === 'completed';
  const isUnlocked = lesson.state === 'unlocked' && !premiumLocked;
  const size = sizing.touchTarget;

  // A slow breathing pulse on the next lesson to tap — an inviting nudge
  // rather than a badge/counter, so it doesn't read as streak-style pressure.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isUnlocked) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isUnlocked, pulse]);

  return (
    // The pulse lives on this wrapping Animated.View rather than being passed
    // into PressableScale's own `style` — PressableScale merges its own
    // press-scale transform in after the given style, which would silently
    // clobber a transform passed in that way instead of composing with it.
    <Animated.View
      style={
        isUnlocked
          ? { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }
          : undefined
      }
    >
      <PressableScale
        disabled={isLocked}
        onPress={onPress}
        haptic
        scaleTo={0.92}
        style={[
          { width: size, height: size, borderRadius: size / 2, alignItems: 'center' },
          !isLocked && shadows.card,
        ]}
      >
        {premiumLocked ? (
          <View style={[styles.node, { width: size, height: size, borderRadius: size / 2 }, styles.premium]}>
            <Text style={styles.emoji}>🔒</Text>
            <PremiumBadge compact style={styles.premiumBadge} />
          </View>
        ) : isLocked ? (
          <View style={[styles.node, { width: size, height: size, borderRadius: size / 2 }, styles.locked]}>
            <Text style={styles.emoji}>🔒</Text>
          </View>
        ) : (
          <LinearGradient
            colors={isCompleted ? gradients.celebration : gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.node, { width: size, height: size, borderRadius: size / 2 }]}
          >
            <Text style={styles.emoji}>{isCompleted ? '⭐' : '▶️'}</Text>
          </LinearGradient>
        )}
        <View style={styles.labelWrap}>
          <Text style={[styles.label, { fontSize: sizing.bodyFontSize * 0.55 }]} numberOfLines={1}>
            {lesson.title ?? `Lesson ${lesson.lessonNumber}`}
          </Text>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    node: { alignItems: 'center', justifyContent: 'center' },
    locked: { backgroundColor: colors.background, borderWidth: 3, borderColor: colors.locked },
    premium: { backgroundColor: colors.surface, borderWidth: 3, borderColor: '#D9A441' },
    premiumBadge: { position: 'absolute', top: -6, right: -6, backgroundColor: colors.surface },
    emoji: { fontSize: 28 },
    labelWrap: { position: 'absolute', bottom: -spacing.lg, width: 120, alignItems: 'center', alignSelf: 'center' },
    label: { fontWeight: '600', color: colors.textPrimary, textAlign: 'center' },
  });
