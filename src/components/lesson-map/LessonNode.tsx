import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { adultTrackSizing, colors, gradients, kidTrackSizing, shadows, spacing } from '@/constants/theme';
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
  const size = sizing.touchTarget;

  return (
    <PressableScale
      disabled={isLocked}
      onPress={onPress}
      scaleTo={0.92}
      style={[
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center' },
        !isLocked && shadows.card,
      ]}
    >
      {isLocked ? (
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
  );
}

const styles = StyleSheet.create({
  node: { alignItems: 'center', justifyContent: 'center' },
  locked: { backgroundColor: colors.background, borderWidth: 3, borderColor: colors.locked },
  emoji: { fontSize: 28 },
  labelWrap: { position: 'absolute', bottom: -spacing.lg, width: 120, alignItems: 'center', alignSelf: 'center' },
  label: { fontWeight: '600', color: colors.textPrimary, textAlign: 'center' },
});
