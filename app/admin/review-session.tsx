import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { FieldHelp } from '@/components/admin/FieldHelp';
import { Button } from '@/components/ui/Button';
import { ComputerVoiceNote } from '@/components/ui/ComputerVoiceNote';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import {
  fetchFormsToReview,
  reviewErrorMessage,
  reviewWordVariant,
  type FormToReview,
  type ReviewVerdict,
} from '@/data/admin/reviewSession';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import { useTheme } from '@/lib/theme/ThemeContext';

const FORM_LABEL: Record<string, string> = {
  primary: 'Main form',
  masculine: 'Masculine form',
  feminine: 'Feminine form',
  also_heard: 'Also heard',
};

type Mode = 'choose' | 'fix' | 'reject';

/**
 * Admin → Review → one at a time (language reviewers): each form waiting for
 * review, with three choices — Correct (approve), Fix (correct the spelling,
 * then approve) or Reject (optional note). Saved through review_word_variant,
 * which only reviewers may call and which logs every review; then the next
 * form comes up. A corrected spelling flags an existing recording for
 * re-check (Audio → Re-check) — it is never unmarked or deleted.
 */
export default function AdminReviewSession() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [items, setItems] = useState<FormToReview[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<Mode>('choose');
  const [arabic, setArabic] = useState('');
  const [latin, setLatin] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    setItems(null);
    try {
      setItems(await fetchFormsToReview());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const current = items?.[0] ?? null;

  // Reset the form for each new item.
  useEffect(() => {
    setMode('choose');
    setArabic(current?.variant.wordArabic ?? '');
    setLatin(current?.variant.transliteration ?? '');
    setNote('');
    setError(null);
  }, [current?.variant.id, current?.variant.wordArabic, current?.variant.transliteration]);

  const next = () => setItems((list) => (list ? list.slice(1) : list));

  const save = async (verdict: ReviewVerdict) => {
    if (!current || saving) return;
    setSaving(true);
    setError(null);
    try {
      const changedArabic = arabic.trim() !== current.variant.wordArabic ? arabic.trim() : null;
      const changedLatin = latin.trim() !== current.variant.transliteration ? latin.trim() : null;
      const status = await reviewWordVariant({
        variantId: current.variant.id,
        verdict,
        correctedArabic: verdict === 'fix' ? changedArabic : null,
        correctedTransliteration: verdict === 'fix' ? changedLatin : null,
        note: note.trim() || null,
      });
      const what = verdict === 'reject' ? 'Rejected' : verdict === 'fix' ? 'Fixed and approved' : 'Approved';
      setLastResult(`${what}: ${current.englishMeaning}${status === 'approved' ? ' — the word is live' : ''}`);
      next();
    } catch (err) {
      const message = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? '');
      // Someone else got there first (or it's gone): move on.
      if (message.includes('already_reviewed') || message.includes('unknown_variant')) {
        setLastResult(reviewErrorMessage(err));
        next();
      } else {
        setError(reviewErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <ScreenContainer themed>
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>Couldn&apos;t load the forms to review</Text>
          <Button themed label="Try again" variant="secondary" onPress={load} />
        </View>
      </ScreenContainer>
    );
  }

  if (!items) {
    return (
      <ScreenContainer themed>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer themed>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
          <Text style={styles.link}>‹ Review</Text>
        </Pressable>
        <Text style={styles.leftCount}>{items.length} left</Text>
      </View>

      {lastResult ? <Text style={styles.result}>{lastResult}</Text> : null}

      {!current ? (
        <View style={styles.centered}>
          <Text style={styles.centeredEmoji}>🎉</Text>
          <Text style={styles.centeredTitle}>All reviewed</Text>
          <Text style={styles.centeredBody}>Nothing is waiting for review.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, shadows.card]}>
            <Text style={styles.badge}>{FORM_LABEL[current.variant.variantLabel] ?? current.variant.variantLabel}</Text>
            <Text style={styles.meaning}>{current.englishMeaning}</Text>
            <Text style={styles.arabic}>{current.variant.wordArabic}</Text>
            <Text style={styles.latin}>{current.variant.transliteration}</Text>
            <Text style={styles.context}>
              {current.unitName} · Lesson {current.lessonNumber}
            </Text>
            {current.variant.audioPath ? <Listen item={current} colors={colors} /> : null}
          </View>

          {mode === 'fix' ? (
            <View style={styles.form}>
              <FieldHelp label="Arabic" help="arabic" labelStyle={styles.label} />
              <TextInput
                value={arabic}
                onChangeText={setArabic}
                accessibilityLabel="Corrected Arabic"
                style={[styles.input, styles.inputArabic]}
                placeholderTextColor={colors.textSecondary}
              />
              <FieldHelp label="Transliteration" help="transliteration" labelStyle={styles.label} />
              <TextInput
                value={latin}
                onChangeText={setLatin}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Corrected transliteration"
                style={styles.input}
              />
              <NoteInput value={note} onChange={setNote} styles={styles} />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button themed label="Save fix and approve" onPress={() => save('fix')} loading={saving} />
              <Button themed label="Cancel" variant="ghost" onPress={() => setMode('choose')} />
            </View>
          ) : mode === 'reject' ? (
            <View style={styles.form}>
              <NoteInput value={note} onChange={setNote} styles={styles} />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button themed label="Reject this form" onPress={() => save('reject')} loading={saving} />
              <Button themed label="Cancel" variant="ghost" onPress={() => setMode('choose')} />
            </View>
          ) : (
            <View style={styles.form}>
              <FieldHelp label="How to review" help="reviewChoices" labelStyle={styles.label} />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button themed label="✓ Correct" onPress={() => save('ok')} loading={saving} />
              <Button themed label="✎ Fix the spelling" variant="secondary" onPress={() => setMode('fix')} />
              <Button themed label="✗ Reject" variant="ghost" onPress={() => setMode('reject')} />
            </View>
          )}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

function NoteInput({ value, onChange, styles }: { value: string; onChange: (v: string) => void; styles: ReturnType<typeof makeStyles> }) {
  return (
    <>
      <FieldHelp label="Note (optional)" help="reviewNote" labelStyle={styles.label} />
      <TextInput value={value} onChangeText={onChange} multiline accessibilityLabel="Review note" style={[styles.input, styles.note]} />
    </>
  );
}

function Listen({ item, colors }: { item: FormToReview; colors: ThemeColors }) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const audio = useWordAudioPlayer(item.variant);
  return (
    <View style={styles.listenRow}>
      <Pressable
        onPress={audio.play}
        disabled={!audio.hasAudio || audio.isResolving}
        accessibilityRole="button"
        accessibilityLabel={`Listen to ${item.englishMeaning}`}
        style={styles.listen}
      >
        <Text style={styles.listenText}>{audio.isPlaying ? '🔊 Playing…' : '▶ Listen'}</Text>
      </Pressable>
      {audio.source === 'computer' ? <ComputerVoiceNote /> : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
    link: { fontSize: 14, fontWeight: '700', color: colors.primary },
    leftCount: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
    result: { fontSize: 13, color: colors.success, marginTop: spacing.sm },
    scroll: { gap: spacing.md, paddingVertical: spacing.md, paddingBottom: spacing.xxl },
    card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg, gap: 6, alignItems: 'center' },
    badge: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
      backgroundColor: `${colors.primary}14`,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radii.pill,
      overflow: 'hidden',
    },
    meaning: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
    arabic: { fontSize: 34, color: colors.textPrimary, writingDirection: 'rtl' },
    latin: { fontSize: 18, fontStyle: 'italic', color: colors.textSecondary },
    context: { fontSize: 13, color: colors.textSecondary },
    listenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
    listen: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radii.pill, backgroundColor: `${colors.primary}14`, justifyContent: 'center' },
    listenText: { fontSize: 14, fontWeight: '700', color: colors.primary },
    form: { gap: spacing.sm },
    label: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
    input: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radii.md,
      padding: spacing.sm,
      fontSize: 16,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
    },
    inputArabic: { fontSize: 22, textAlign: 'right', writingDirection: 'rtl' },
    note: { minHeight: 70, textAlignVertical: 'top' },
    error: { fontSize: 13, color: colors.error },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    centeredEmoji: { fontSize: 44 },
    centeredTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
    centeredBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  });
