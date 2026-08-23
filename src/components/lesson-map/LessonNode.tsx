import { Pressable, StyleSheet, Text, View } from 'react-native';

import { adultTrackSizing, colors, kidTrackSizing, radii, spacing } from '@/constants/theme';
import type { LessonWithState, Track } from '@/types/models';

interface LessonNodeProps {
  lesson: LessonWithState;
  track: Track;
  onPress: () => void;
}

export function LessonNode({ lesson, track, onPress }: LessonNodeProps) {
  const sizing = track === 'kid' ? kidTrackSizing : adultTrackSizing;
  const isLocked = lesson.state === 'locked';
  const isCompleted = lesson.state === 'completed';

  return (
    <Pressable
      disabled={isLocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.node,
        { width: sizing.touchTarget, height: sizing.touchTarget, borderRadius: sizing.touchTarget / 2 },
        isCompleted && styles.completed,
        isLocked && styles.locked,
        pressed && !isLocked && styles.pressed,
      ]}
    >
      <Text style={styles.emoji}>{isLocked ? '🔒' : isCompleted ? '⭐' : '▶️'}</Text>
      <View style={styles.labelWrap}>
        <Text style={[styles.label, { fontSize: sizing.bodyFontSize * 0.55 }]} numberOfLines={1}>
          {lesson.title ?? `Lesson ${lesson.lessonNumber}`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  node: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  completed: { backgroundColor: '#FFF4E2', borderColor: colors.accent },
  locked: { backgroundColor: colors.background, borderColor: colors.locked },
  pressed: { opacity: 0.8 },
  emoji: { fontSize: 28 },
  labelWrap: { position: 'absolute', bottom: -spacing.lg, width: 120, alignItems: 'center' },
  label: { fontWeight: '600', color: colors.textPrimary, textAlign: 'center' },
});
