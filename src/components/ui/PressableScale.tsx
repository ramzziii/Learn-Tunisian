import * as Haptics from 'expo-haptics';
import { useRef } from 'react';
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  /** Fires a light selection haptic on press-in. Opt-in (not the default) so
   * it doesn't double up with buttons that already fire their own semantic
   * haptic (e.g. correct/incorrect answer feedback). */
  haptic?: boolean;
  children: React.ReactNode;
}

/** A Pressable that gives tactile feedback — scales down slightly on press instead of just an opacity flicker. */
export function PressableScale({
  style,
  scaleTo = 0.95,
  haptic = false,
  children,
  onPressIn,
  onPressOut,
  ...props
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  // A touch more spring personality than a plain scale — a slight opacity
  // dip alongside the scale reads more premium than scale alone, and this
  // one shared tweak cascades to nearly every tappable surface in the app.
  const animateTo = (scaleValue: number, opacityValue: number) => {
    Animated.parallel([
      Animated.spring(scale, { toValue: scaleValue, useNativeDriver: true, speed: 32, bounciness: 8 }),
      Animated.timing(opacity, { toValue: opacityValue, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  return (
    <Pressable
      onPressIn={(e) => {
        animateTo(scaleTo, 0.85);
        if (haptic) Haptics.selectionAsync();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animateTo(1, 1);
        onPressOut?.(e);
      }}
      {...props}
    >
      <Animated.View style={[style, { transform: [{ scale }], opacity }]}>{children}</Animated.View>
    </Pressable>
  );
}
