import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import AdminMissingExplanations from '../recordings-explanations';
import AdminRecordings from '../recordings';
import AdminRecheckRecordings from '../recordings-recheck';
import AdminSkippedRecordings from '../recordings-skipped';
import { AdminTabProvider } from '@/components/admin/AdminScreenTop';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';

const PARTS = [
  { key: 'record', label: 'To record' },
  { key: 'skipped', label: 'Skipped' },
  { key: 'explanations', label: 'Explain' },
  { key: 'recheck', label: 'Re-check' },
] as const;
type Part = (typeof PARTS)[number]['key'];

/**
 * Admin → Audio, the recording studio: every form that still needs a native
 * recording (none yet, a missing file, or a computer voice to replace), the
 * ones you skipped, optional explanation recordings, and recordings to
 * re-check after a spelling change — one place, in course order.
 */
export default function AdminAudioTab() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [part, setPart] = useState<Part>('record');

  const switcher = (
    <View style={styles.switcher} accessibilityRole="tablist">
      {PARTS.map((p) => {
        const selected = p.key === part;
        return (
          <Pressable
            key={p.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => setPart(p.key)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{p.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <AdminTabProvider header={switcher}>
      {part === 'record' ? (
        <AdminRecordings />
      ) : part === 'skipped' ? (
        <AdminSkippedRecordings />
      ) : part === 'explanations' ? (
        <AdminMissingExplanations />
      ) : (
        <AdminRecheckRecordings />
      )}
    </AdminTabProvider>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    switcher: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radii.pill, padding: 4, marginTop: spacing.sm },
    segment: { flex: 1, minHeight: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
    segmentSelected: { backgroundColor: colors.primary },
    segmentText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
    segmentTextSelected: { color: colors.textOnPrimary },
  });
