import { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Fades and slides content up on mount — the same spring entrance already
 * used on the Alphabet screens, generalized into one wrapper so every screen
 * can opt in with `<Reveal delay={i * 60}>` instead of re-deriving the
 * Animated.Value + useEffect boilerplate per screen.
 */
export function Reveal({ children, delay = 0, style }: RevealProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8, delay });
    animation.start();
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
