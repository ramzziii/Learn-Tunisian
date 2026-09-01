import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

/**
 * Returns an Animated.Value that fades from 0 to 1 each time `key` changes —
 * used to give exercise-to-exercise transitions a soft crossfade instead of
 * an abrupt cut, without pulling in a full animation library.
 */
export function useFadeInOnChange(key: string | undefined): Animated.Value {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [key, opacity]);

  return opacity;
}
