import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { colors as lightColors, gradients as lightGradients, radii, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';

interface ProgressBarProps {
  progress: number; // 0-1
  gradientColors?: readonly [string, string, ...string[]];
  /** Opts into the live light/dark theme's track color — see
   * ScreenContainer's `themed` prop for why this defaults to false. */
  themed?: boolean;
}

export function ProgressBar({ progress, gradientColors, themed = false }: ProgressBarProps) {
  const live = useTheme();
  const colors = themed ? live.colors : lightColors;
  const gradients = themed ? live.gradients : lightGradients;
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
        <LinearGradient
          colors={gradientColors ?? gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.fill}
        />
      </Animated.View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    track: {
      height: 10,
      borderRadius: radii.pill,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    fillWrapper: { height: '100%' },
    fill: { flex: 1, borderRadius: radii.pill },
  });
