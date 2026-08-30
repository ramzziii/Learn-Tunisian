import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { colors, gradients, radii } from '@/constants/theme';

interface ProgressBarProps {
  progress: number; // 0-1
  gradientColors?: readonly [string, string, ...string[]];
}

export function ProgressBar({ progress, gradientColors = gradients.primary }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const widthAnim = useRef(new Animated.Value(clamped)).current;

  useEffect(() => {
    Animated.timing(widthAnim, { toValue: clamped, duration: 350, useNativeDriver: false }).start();
  }, [clamped, widthAnim]);

  return (
    <View style={styles.track}>
      <Animated.View
        style={[
          styles.fillWrapper,
          { width: widthAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
        ]}
      >
        <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.fill} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fillWrapper: { height: '100%' },
  fill: { flex: 1, borderRadius: radii.pill },
});
