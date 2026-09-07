import { useRef } from 'react';
import { Animated } from 'react-native';

/** A quick side-to-side shake for a wrong answer — reused wherever an option
 * needs to say "no" more physically than just a red border. */
export function useShake() {
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const shake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -1, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const shakeStyle = {
    transform: [{ translateX: shakeAnim.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }) }],
  };

  return { shake, shakeStyle };
}
