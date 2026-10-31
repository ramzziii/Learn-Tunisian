import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { scriptsToShow } from '@/lib/display/displayRules';
import { useDisplayPreferences } from '@/lib/display/useDisplayPreferences';

type Size = 'sm' | 'md' | 'lg' | 'xl';

interface TunisianTextProps {
  arabic?: string | null;
  latin?: string | null;
  size?: Size;
  /** Stacked (Arabic over Latin) or inline (side by side, wrapping). */
  layout?: 'stacked' | 'inline';
  /** For exercises that test reading Arabic: shown whatever the preference. */
  alwaysShowArabic?: boolean;
  /** For exercises answered in transliteration: shown whatever the preference. */
  alwaysShowLatin?: boolean;
  arabicStyle?: StyleProp<TextStyle>;
  latinStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  /** Truncates each line (e.g. compact cards). */
  numberOfLines?: number;
}

/**
 * The shared way to show Tunisian text: Arabic script, Latin
 * transliteration, or both, per the learner's script preference (0023).
 * Arabic is laid out right-to-left and announced as Arabic; Latin is
 * left-to-right — each in its own Text, so mixed-script lines don't
 * reorder. If the preferred script is missing, the other one is shown.
 * Colours come from the caller's styles, so it fits any screen's theme.
 */
export function TunisianText({
  arabic,
  latin,
  size = 'md',
  layout = 'stacked',
  alwaysShowArabic,
  alwaysShowLatin,
  arabicStyle,
  latinStyle,
  style,
  numberOfLines,
}: TunisianTextProps) {
  const { preferences } = useDisplayPreferences();
  const hasArabic = !!arabic?.trim();
  const hasLatin = !!latin?.trim();
  const show = scriptsToShow(preferences.script, { alwaysShowArabic, alwaysShowLatin, hasArabic, hasLatin });

  return (
    <View style={[layout === 'inline' ? styles.inline : styles.stacked, style]}>
      {show.arabic ? (
        <Text accessibilityLanguage="ar" numberOfLines={numberOfLines} style={[styles.arabic, ARABIC_SIZE[size], arabicStyle]}>
          {arabic}
        </Text>
      ) : null}
      {show.latin ? (
        <Text numberOfLines={numberOfLines} style={[styles.latin, LATIN_SIZE[size], latinStyle]}>
          {latin}
        </Text>
      ) : null}
    </View>
  );
}

const ARABIC_SIZE: Record<Size, TextStyle> = {
  sm: { fontSize: 16 },
  md: { fontSize: 22 },
  lg: { fontSize: 30 },
  xl: { fontSize: 40 },
};

const LATIN_SIZE: Record<Size, TextStyle> = {
  sm: { fontSize: 13 },
  md: { fontSize: 15 },
  lg: { fontSize: 17 },
  xl: { fontSize: 20 },
};

const styles = StyleSheet.create({
  stacked: { gap: 2 },
  inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 },
  arabic: { writingDirection: 'rtl' },
  latin: { writingDirection: 'ltr', fontStyle: 'italic' },
});
