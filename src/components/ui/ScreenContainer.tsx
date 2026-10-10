import { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors as lightColors, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';

interface ScreenContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Opts into the live light/dark theme background instead of the fixed
   * light background every other screen still uses. Only screens explicitly
   * converted to the theme system should pass this — for everything else,
   * flipping the background here while that screen's own text/card colors
   * stay unconverted would make it illegible in dark mode, not just
   * "not yet themed." Defaults to false so this stays 100% backward
   * compatible with the ~60 screens not converted in this pass. */
  themed?: boolean;
}

export function ScreenContainer({ children, style, themed = false }: ScreenContainerProps) {
  const { colors: liveColors } = useTheme();
  const colors = themed ? liveColors : lightColors;
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={[styles.container, style]}>{children}</View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, padding: spacing.lg },
  });
