import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LessonNode } from '@/components/lesson-map/LessonNode';
import { Reveal } from '@/components/ui/Reveal';
import { colors, spacing } from '@/constants/theme';
import type { UnitWithLessons } from '@/data/content';
import type { Track } from '@/types/models';

interface UnitSectionProps {
  unitWithLessons: UnitWithLessons;
  track: Track;
  onSelectLesson: (lessonId: string) => void;
  onBrowseWords: (lessonId: string) => void;
}

export function UnitSection({ unitWithLessons, track, onSelectLesson, onBrowseWords }: UnitSectionProps) {
  const { unit, lessons } = unitWithLessons;
  const browsableLesson = lessons.find((lesson) => lesson.state !== 'locked');

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.unitTitle}>{unit.name}</Text>
        {browsableLesson ? (
          <Pressable onPress={() => onBrowseWords(browsableLesson.id)} hitSlop={8}>
            <Text style={styles.browseLink}>See words</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.lessonRow}>
        {lessons.map((lesson, index) => (
          <Reveal key={lesson.id} delay={Math.min(index * 40, 400)}>
            <LessonNode lesson={lesson} track={track} onPress={() => onSelectLesson(lesson.id)} />
          </Reveal>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  unitTitle: { fontSize: 15, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  browseLink: { fontSize: 13, fontWeight: '600', color: colors.primary },
  lessonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xl, paddingBottom: spacing.md },
});
