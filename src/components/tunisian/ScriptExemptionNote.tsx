import { Text } from 'react-native';

import { useDisplayPreferences } from '@/lib/display/useDisplayPreferences';
import { useTheme } from '@/lib/theme/ThemeContext';

const NOTES = {
  arabic: 'This exercise practises reading Arabic script, so Arabic is always shown.',
  latin: 'You’ll type Latin letters here, so the transliteration is always shown.',
} as const;

/**
 * A one-line note on an exercise that tests a particular script (reading
 * match → Arabic, typing → Latin), shown only when the learner's script
 * preference would otherwise have hidden that script.
 */
export function ScriptExemptionNote({ exempt }: { exempt: 'arabic' | 'latin' }) {
  const { colors } = useTheme();
  const { preferences } = useDisplayPreferences();
  const wouldBeHidden = exempt === 'arabic' ? preferences.script === 'latin' : preferences.script === 'arabic';
  if (!wouldBeHidden) return null;
  return (
    <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 8, paddingHorizontal: 8 }}>
      {NOTES[exempt]}
    </Text>
  );
}
