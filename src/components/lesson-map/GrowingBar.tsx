import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from '@/hooks/useReducedMotion';

interface GrowingBarProps {
  /** 0–1. */
  progress: number;
  colors: readonly [string, string, ...string[]];
  trackColor: string;
  height?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

/** A rounded progress bar that fills from empty when it appears (instantly with reduce motion on). */
export function GrowingBar({ progress, colors, trackColor, height = 6, delay = 0, style }: GrowingBarProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const reduceMotion = useReducedMotion();
  const fill = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      fill.setValue(clamped);
      return;
    }
    const animation = Animated.timing(fill, { toValue: clamped, duration: 700, delay, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [clamped, delay, fill, reduceMotion]);

  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={{ height, borderRadius: height / 2, overflow: 'hidden', width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }}
      >
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden', width: '100%' },
});
