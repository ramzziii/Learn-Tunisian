import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors as lightColors, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';

interface LoadingScreenProps {
  /** Opts into the live light/dark theme — see ScreenContainer's `themed`
   * prop for why this defaults to false (safe for screens not yet
   * converted to the theme system). */
  themed?: boolean;
}

export function LoadingScreen({ themed = false }: LoadingScreenProps = {}) {
  const { colors: liveColors } = useTheme();
  const colors = themed ? liveColors : lightColors;
  const styles = makeStyles(colors);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  });
