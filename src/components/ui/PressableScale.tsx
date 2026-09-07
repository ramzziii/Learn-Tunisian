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
  scaleTo = 0.96,
  haptic = false,
  children,
  onPressIn,
  onPressOut,
  ...props
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value: number) =>
    Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 6 }).start();

  return (
    <Pressable
      onPressIn={(e) => {
        animateTo(scaleTo);
        if (haptic) Haptics.selectionAsync();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animateTo(1);
        onPressOut?.(e);
      }}
      {...props}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
