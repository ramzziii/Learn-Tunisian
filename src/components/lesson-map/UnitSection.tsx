import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';

import { GrowingBar } from '@/components/lesson-map/GrowingBar';
import { LessonNode } from '@/components/lesson-map/LessonNode';
import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { UnitWithLessons } from '@/data/content';

/** A fixed accent per unit position, so units are easy to tell apart. */
const UNIT_ACCENTS = ['#3E7CB1', '#4CA771', '#D9A441', '#8B6BAE', '#C0567D', '#3E9CA6'];

interface UnitSectionProps {
  unitWithLessons: UnitWithLessons;
  /** 1-based position in the curriculum, shown on the unit's badge. */
  unitNumber?: number;
  onSelectLesson: (lessonId: string) => void;
  onBrowseWords: (lessonId: string) => void;
  /** True for lessons beyond the free plan — see src/lib/premium/access.ts. */
  isPremiumLocked?: (lessonId: string) => boolean;
  onPremiumLockedPress?: () => void;
}

/**
 * One unit on Learn: a card with a numbered badge, lesson progress, a "See
 * words" chip, and its lessons as a vertical path (LessonNode). A unit that
 * is still entirely ahead (every lesson locked) starts collapsed to keep the
 * page short; tapping its header shows the lessons. Order, lock state and
 * Premium gating come straight from the lesson map.
 */
export function UnitSection({
  unitWithLessons,
  unitNumber = 1,
  onSelectLesson,
  onBrowseWords,
  isPremiumLocked = () => false,
  onPremiumLockedPress,
}: UnitSectionProps) {
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const reduceMotion = useReducedMotion();
  const { unit, lessons } = unitWithLessons;
  const accent = UNIT_ACCENTS[(unitNumber - 1) % UNIT_ACCENTS.length];
  const done = lessons.filter((l) => l.state === 'completed').length;
  const browsableLesson = lessons.find((lesson) => lesson.state !== 'locked' && !isPremiumLocked(lesson.id));
  const allDone = lessons.length > 0 && done === lessons.length;
  const allAhead = lessons.length > 0 && lessons.every((l) => l.state === 'locked' && !isPremiumLocked(l.id));
  const [expanded, setExpanded] = useState(!allAhead);

  const toggle = () => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((e) => !e);
  };

  const meta = `${allDone ? '🎉 ' : ''}${done} of ${lessons.length} ${lessons.length === 1 ? 'lesson' : 'lessons'} done`;

  const header = (
    <View style={styles.header}>
      {allDone ? (
        <LinearGradient colors={gradients.success} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
          <Text style={styles.badgeText}>✓</Text>
        </LinearGradient>
      ) : (
        <View style={[styles.badge, { backgroundColor: allAhead ? colors.locked : accent }]}>
          <Text style={styles.badgeText}>{unitNumber}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.unitLabel, { color: allAhead ? colors.textSecondary : accent }]}>Unit {unitNumber}</Text>
        <Text style={[styles.unitTitle, allAhead && { color: colors.textSecondary }]} accessibilityRole="header">
          {unit.name}
        </Text>
        <Text style={styles.unitMeta}>{meta}</Text>
      </View>
      {allAhead ? (
        <Text style={styles.toggleIcon}>{expanded ? '▲' : '▼'}</Text>
      ) : browsableLesson ? (
        <PressableScale
          haptic
          accessibilityRole="button"
          accessibilityLabel={`See words in ${unit.name}`}
          onPress={() => onBrowseWords(browsableLesson.id)}
          style={styles.wordsChip}
        >
          <Text style={styles.wordsChipText}>See words</Text>
        </PressableScale>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.card, !allAhead && shadows.card, allAhead && styles.cardAhead]}>
      {allAhead ? (
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={`${unit.name}, ${lessons.length} ${lessons.length === 1 ? 'lesson' : 'lessons'} ahead. ${expanded ? 'Hide' : 'Show'} lessons`}
          accessibilityState={{ expanded }}
        >
          {header}
        </Pressable>
      ) : (
        header
      )}

      {!allAhead ? (
        <View style={styles.bar}>
          <GrowingBar
            progress={lessons.length > 0 ? done / lessons.length : 0}
            colors={allDone ? gradients.success : [accent, accent]}
            trackColor={colors.border}
            height={6}
            delay={150}
          />
        </View>
      ) : null}

      {expanded ? (
        <View style={styles.path}>
          {lessons.map((lesson, index) => (
            <Reveal key={lesson.id} delay={Math.min(100 + index * 60, 600)}>
              <LessonNode
                lesson={lesson}
                position={index + 1}
                isFirst={index === 0}
                isLast={index === lessons.length - 1}
                premiumLocked={isPremiumLocked(lesson.id)}
                onPress={() => (isPremiumLocked(lesson.id) ? onPremiumLockedPress?.() : onSelectLesson(lesson.id))}
              />
            </Reveal>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const BADGE = 46;

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg + 4,
      marginBottom: spacing.md,
      paddingVertical: spacing.md,
    },
    cardAhead: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed' },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md },
    badge: { width: BADGE, height: BADGE, borderRadius: radii.md + 2, alignItems: 'center', justifyContent: 'center' },
    badgeText: { fontSize: 20, fontWeight: '900', color: '#FFFFFF' },
    unitLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
    unitTitle: { fontSize: 19, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.2 },
    unitMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
    toggleIcon: { fontSize: 12, color: colors.textSecondary, paddingHorizontal: spacing.xs },
    wordsChip: {
      borderRadius: radii.pill,
      backgroundColor: `${colors.primary}14`,
      paddingVertical: 6,
      paddingHorizontal: spacing.sm,
    },
    wordsChipText: { fontSize: 13, fontWeight: '700', color: colors.primary },
    bar: { marginTop: spacing.md, paddingHorizontal: spacing.md },
    // Room on the left so the next lesson's ripple isn't clipped.
    path: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  });
