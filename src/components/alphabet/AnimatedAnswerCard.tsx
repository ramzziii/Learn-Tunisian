import { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';

export type AnswerCardState = 'idle' | 'selected' | 'correct' | 'wrong';

interface AnimatedAnswerCardProps {
  state: AnswerCardState;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * A pressable answer option that bounces when it turns out to be correct and
 * gives a brief, gentle shake when it turns out to be the wrong pick — the
 * shake is deliberately small (a few px) rather than a punishing wobble,
 * consistent with this app's no-guilt feedback stance. Own transform lives
 * on a wrapper Animated.View rather than passed into PressableScale's style,
 * since PressableScale applies its own press-scale transform last and would
 * otherwise clobber this one (RN style flattening replaces whole transform
 * arrays, it doesn't merge them element-wise).
 */
export function AnimatedAnswerCard({ state, onPress, disabled, style, children }: AnimatedAnswerCardProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (state === 'correct') {
      scale.setValue(1);
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.08, useNativeDriver: true, speed: 50, bounciness: 14 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 26, bounciness: 8 }),
      ]).start();
    } else if (state === 'wrong') {
      translateX.setValue(0);
      Animated.sequence([
        Animated.timing(translateX, { toValue: -7, duration: 40, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: 7, duration: 80, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: -5, duration: 80, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]).start();
    }
  }, [state, scale, translateX]);

  return (
    <Animated.View style={{ transform: [{ scale }, { translateX }] }}>
      <PressableScale onPress={onPress} disabled={disabled} style={style}>
        {children}
      </PressableScale>
    </Animated.View>
  );
}
