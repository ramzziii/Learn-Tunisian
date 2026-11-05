import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GrowingBar } from '@/components/lesson-map/GrowingBar';
import { PulseRing } from '@/components/lesson-map/PulseRing';
import { PressableScale } from '@/components/ui/PressableScale';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { hasOwnLessonTitle, lessonDisplayTitle } from '@/lib/lessonTitle';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { LessonWithState } from '@/types/models';

const NODE = 44;
const PREMIUM_GOLD = '#D9A441';

interface LessonNodeProps {
  lesson: LessonWithState;
  onPress: () => void;
  /** Beyond the free plan — stays tappable (onPress opens the upgrade flow),
   * marked Premium instead of progress-locked. */
  premiumLocked?: boolean;
  /** 1-based position within the unit — what "Lesson N" means on screen. */
  position: number;
  /** Position on the unit's path, for the connecting line. */
  isFirst?: boolean;
  isLast?: boolean;
}

type Kind = 'completed' | 'current' | 'locked' | 'premium';

/**
 * One lesson on a unit's path: a status node on a vertical line, the title,
 * and its state in words (plus words practised for open lessons). The lesson
 * that's up next gets a gradient node with a soft ripple. The whole row is
 * the button; a progress-locked lesson is disabled.
 */
export function LessonNode({ lesson, position, onPress, premiumLocked = false, isFirst = false, isLast = false }: LessonNodeProps) {
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const kind: Kind = premiumLocked ? 'premium' : lesson.state === 'completed' ? 'completed' : lesson.state === 'unlocked' ? 'current' : 'locked';
  // "Lesson N" when the lesson's title would just repeat the unit name above it.
  const title = lessonDisplayTitle(lesson, position);
  const spokenName = hasOwnLessonTitle(lesson) ? `Lesson ${position}, ${title}` : title;
  const words = `${lesson.masteredCount} of ${lesson.wordCount} words`;
  const stateText = {
    completed: `Completed, ${words}`,
    current: `Up next, ${words}`,
    locked: 'Locked — finish the lesson before it',
    premium: 'Premium',
  }[kind];
  const subtitle = {
    completed: `Completed · ${lesson.masteredCount}/${lesson.wordCount} words`,
    current: `Up next · ${lesson.masteredCount}/${lesson.wordCount} words`,
    locked: 'Finish the lesson before it',
    premium: '⭐ Included with Premium',
  }[kind];
  const lineDone = colors.success;

  return (
    <PressableScale
      haptic={kind !== 'locked'}
      scaleTo={0.98}
      disabled={kind === 'locked'}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${spokenName}. ${stateText}`}
      accessibilityState={{ disabled: kind === 'locked' }}
      style={[styles.row, kind === 'current' && styles.rowCurrent]}
    >
      <View style={styles.rail}>
        <View style={[styles.line, { backgroundColor: kind === 'completed' || kind === 'current' ? lineDone : colors.border }, isFirst && styles.lineHidden]} />
        <View style={styles.nodeWrap}>
          {kind === 'current' ? <PulseRing size={NODE} color={colors.primary} /> : null}
          {kind === 'completed' ? (
            <LinearGradient colors={gradients.success} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.node}>
              <Text style={styles.nodeIconOnColor}>✓</Text>
            </LinearGradient>
          ) : kind === 'current' ? (
            <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.node}>
              <Text style={styles.nodeIconOnColor}>▶</Text>
            </LinearGradient>
          ) : (
            <View style={[styles.node, styles.nodeMuted, kind === 'premium' && { borderColor: PREMIUM_GOLD }]}>
              <Text style={styles.nodeIconMuted}>🔒</Text>
            </View>
          )}
        </View>
        <View style={[styles.line, { backgroundColor: kind === 'completed' ? lineDone : colors.border }, isLast && styles.lineHidden]} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, kind === 'locked' && styles.titleMuted]} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.subtitleRow}>
          <Text style={[styles.subtitle, kind === 'current' && { color: colors.primary, fontWeight: '700' }]}>{subtitle}</Text>
        </View>
        {kind === 'current' && lesson.wordCount > 0 ? (
          <GrowingBar
            progress={lesson.masteredCount / lesson.wordCount}
            colors={gradients.primary}
            trackColor={colors.border}
            height={5}
            delay={250}
            style={{ marginTop: spacing.xs }}
          />
        ) : null}
      </View>

      {kind !== 'locked' ? <Text style={styles.chevron}>›</Text> : null}
    </PressableScale>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: spacing.md,
      paddingRight: spacing.sm,
      borderRadius: radii.md,
    },
    rowCurrent: { backgroundColor: `${colors.primary}12` },
    rail: { width: NODE, alignItems: 'center' },
    line: { width: 3, flex: 1, minHeight: spacing.sm, borderRadius: 2 },
    lineHidden: { backgroundColor: 'transparent' },
    nodeWrap: { width: NODE, height: NODE },
    node: { width: NODE, height: NODE, borderRadius: NODE / 2, alignItems: 'center', justifyContent: 'center' },
    nodeMuted: { backgroundColor: colors.background, borderWidth: 2, borderColor: colors.locked },
    nodeIconOnColor: { fontSize: 18, fontWeight: '800', color: colors.textOnPrimary },
    nodeIconMuted: { fontSize: 16 },
    body: { flex: 1, justifyContent: 'center', paddingVertical: spacing.md },
    title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    titleMuted: { color: colors.textSecondary },
    subtitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
    subtitle: { fontSize: 13, color: colors.textSecondary },
    chevron: { alignSelf: 'center', fontSize: 22, color: colors.textSecondary },
  });
