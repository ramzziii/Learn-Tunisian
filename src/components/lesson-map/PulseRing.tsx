import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * A soft ring that ripples out from behind a circle — an inviting "this one"
 * cue for the lesson that's up next (not a counter or a warning). Place it
 * inside a container the same size as the circle. Off with reduce motion.
 */
export function PulseRing({ size, color }: { size: number; color: string }) {
  const reduceMotion = useReducedMotion();
  const ripple = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ripple, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.delay(400),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      ripple.setValue(0);
    };
  }, [reduceMotion, ripple]);

  if (reduceMotion) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
          transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
        },
      ]}
    />
  );
}
