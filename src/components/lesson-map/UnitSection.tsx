import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LessonNode } from '@/components/lesson-map/LessonNode';
import { Reveal } from '@/components/ui/Reveal';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { UnitWithLessons } from '@/data/content';

interface UnitSectionProps {
  unitWithLessons: UnitWithLessons;
  onSelectLesson: (lessonId: string) => void;
  onBrowseWords: (lessonId: string) => void;
  /** True for lessons beyond the free plan — see src/lib/premium/access.ts. */
  isPremiumLocked?: (lessonId: string) => boolean;
  onPremiumLockedPress?: () => void;
  /** True for the very first unit in the map — tagged so a brand-new
   * learner can see at a glance where to begin, instead of the map reading
   * as an undifferentiated list. */
  isFirstUnit?: boolean;
}

// Like LessonNode, this component's only consumer is app/(tabs)/learn.tsx,
// so it reacts to the live theme unconditionally.
export function UnitSection({
  unitWithLessons,
  onSelectLesson,
  onBrowseWords,
  isFirstUnit,
  isPremiumLocked = () => false,
  onPremiumLockedPress,
}: UnitSectionProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { unit, lessons } = unitWithLessons;
  const browsableLesson = lessons.find((lesson) => lesson.state !== 'locked' && !isPremiumLocked(lesson.id));

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.unitTitle}>{unit.name}</Text>
          {isFirstUnit ? (
            <View style={styles.startHereBadge}>
              <Text style={styles.startHereText}>Start here</Text>
            </View>
          ) : null}
        </View>
        {browsableLesson ? (
          <Pressable onPress={() => onBrowseWords(browsableLesson.id)} hitSlop={8}>
            <Text style={styles.browseLink}>See words</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.lessonRow}>
        {lessons.map((lesson, index) => (
          <Reveal key={lesson.id} delay={Math.min(index * 40, 400)}>
            {isPremiumLocked(lesson.id) ? (
              <LessonNode lesson={lesson} premiumLocked onPress={() => onPremiumLockedPress?.()} />
            ) : (
              <LessonNode lesson={lesson} onPress={() => onSelectLesson(lesson.id)} />
            )}
          </Reveal>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: { marginBottom: spacing.xxl },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    unitTitle: { fontSize: 15, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
    startHereBadge: { backgroundColor: colors.accentLight, borderRadius: radii.pill, paddingVertical: 2, paddingHorizontal: spacing.sm },
    startHereText: { fontSize: 11, fontWeight: '700', color: colors.primary, textTransform: 'none', letterSpacing: 0 },
    browseLink: { fontSize: 13, fontWeight: '600', color: colors.primary },
    lessonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xl, paddingBottom: spacing.md },
  });
