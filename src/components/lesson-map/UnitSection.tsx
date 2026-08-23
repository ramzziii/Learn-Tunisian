import { StyleSheet, Text, View } from 'react-native';

import { LessonNode } from '@/components/lesson-map/LessonNode';
import { colors, spacing } from '@/constants/theme';
import type { UnitWithLessons } from '@/data/content';
import type { Track } from '@/types/models';

interface UnitSectionProps {
  unitWithLessons: UnitWithLessons;
  track: Track;
  onSelectLesson: (lessonId: string) => void;
}

export function UnitSection({ unitWithLessons, track, onSelectLesson }: UnitSectionProps) {
  const { unit, lessons } = unitWithLessons;
  return (
    <View style={styles.section}>
      <Text style={styles.unitTitle}>{unit.name}</Text>
      <View style={styles.lessonRow}>
        {lessons.map((lesson) => (
          <LessonNode key={lesson.id} lesson={lesson} track={track} onPress={() => onSelectLesson(lesson.id)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.xxl },
  unitTitle: { fontSize: 15, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.lg, textTransform: 'uppercase', letterSpacing: 0.5 },
  lessonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xl, paddingBottom: spacing.md },
});
