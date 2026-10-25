import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * A slide-and-fade entrance replayed each time `key` changes — the
 * transition between one question and the next in a session. Starts from
 * 30% opacity rather than 0, so content is never fully invisible (screen
 * readers and tests treat opacity 0 as hidden) even mid-transition.
 */
export function useSlideInOnChange(key: string | undefined) {
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [key, progress]);

  return {
    opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
  };
}
