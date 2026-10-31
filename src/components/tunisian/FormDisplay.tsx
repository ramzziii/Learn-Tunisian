import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { TunisianText } from '@/components/tunisian/TunisianText';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import { formLabel, formsToShow, hasTwoForms } from '@/lib/display/displayRules';
import { useDisplayPreferences } from '@/lib/display/useDisplayPreferences';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { WordGroupWithVariants, WordVariant } from '@/types/models';

interface FormDisplayProps {
  group: WordGroupWithVariants;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Per-form play buttons (each plays its own form's recording). Default true. */
  showAudio?: boolean;
  arabicStyle?: StyleProp<TextStyle>;
  latinStyle?: StyleProp<TextStyle>;
}

/**
 * A word with masculine and feminine forms: the learner's preferred form
 * first (or alone), each labelled "Masculine form" / "Feminine form" — the
 * form, never the learner — and a "Show the other form" toggle that doesn't
 * change the saved preference. Revealing a form plays that form's own
 * recording; a form with no recording says so rather than playing the
 * other form's audio or a device voice. A one-form word shows just that.
 */
export function FormDisplay({ group, size = 'md', showAudio = true, arabicStyle, latinStyle }: FormDisplayProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { preferences } = useDisplayPreferences();
  const [revealed, setRevealed] = useState(false);
  const [justRevealed, setJustRevealed] = useState(false);

  const twoForms = hasTwoForms(group);
  const { shown, hidden } = formsToShow(group, preferences.form);
  const visible = revealed ? [...shown, ...hidden] : shown;

  const toggle = () => {
    setJustRevealed(!revealed);
    setRevealed((r) => !r);
  };

  return (
    <View style={styles.container}>
      {visible.map((variant) => {
        const label = twoForms ? formLabel(variant.variantLabel) : null;
        return (
          <View key={variant.id} style={styles.form}>
            {label ? <Text style={styles.label}>{label}</Text> : null}
            <View style={styles.row}>
              <TunisianText arabic={variant.wordArabic} latin={variant.transliteration} size={size} arabicStyle={arabicStyle} latinStyle={latinStyle} style={styles.text} />
              {showAudio ? (
                <FormAudio
                  variant={variant}
                  name={label ?? 'recording'}
                  autoPlay={justRevealed && hidden.some((h) => h.id === variant.id)}
                  colors={colors}
                />
              ) : null}
            </View>
          </View>
        );
      })}

      {hidden.length > 0 ? (
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={revealed ? 'Hide the other form' : 'Show the other form'}
          accessibilityState={{ expanded: revealed }}
          style={styles.toggle}
          hitSlop={8}
        >
          <Text style={styles.toggleText}>{revealed ? 'Hide the other form' : 'Show the other form'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FormAudio({ variant, name, autoPlay, colors }: { variant: WordVariant; name: string; autoPlay: boolean; colors: ThemeColors }) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!variant.audioPath) return <Text style={styles.noAudio}>No recording for this form yet</Text>;
  return <FormAudioButton variant={variant} name={name} autoPlay={autoPlay} colors={colors} />;
}

function FormAudioButton({ variant, name, autoPlay, colors }: { variant: WordVariant; name: string; autoPlay: boolean; colors: ThemeColors }) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // fallbackVoice: false — a form plays its own recording or nothing.
  const audio = useWordAudioPlayer(variant, { autoPlay, fallbackVoice: false });
  const lower = name.charAt(0).toLowerCase() + name.slice(1);

  if (audio.hasError) {
    return (
      <Pressable onPress={audio.retry} accessibilityRole="button" accessibilityLabel={`Retry ${lower}`} style={styles.play} hitSlop={8}>
        <Text style={styles.playIcon}>↻</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={audio.play}
      disabled={audio.isResolving}
      accessibilityRole="button"
      accessibilityLabel={`Play ${lower}`}
      accessibilityState={{ busy: audio.isResolving }}
      style={styles.play}
      hitSlop={8}
    >
      {audio.isResolving ? <ActivityIndicator color={colors.textOnPrimary} /> : <Text style={styles.playIcon}>🔊</Text>}
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { gap: spacing.sm },
    form: { gap: 2 },
    label: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    text: { flexShrink: 1 },
    play: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    playIcon: { fontSize: 18, color: colors.textOnPrimary },
    noAudio: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic' },
    toggle: {
      alignSelf: 'flex-start',
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    toggleText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  });
