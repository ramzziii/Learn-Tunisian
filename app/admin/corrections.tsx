import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { fetchPendingCorrections, submitReview, type PendingCorrection } from '@/data/corrections';

// Deliberately not linked from Settings/Home navigation, and no new
// auth/role system — reachable only via this direct route. This app has one
// trusted household account right now; revisit if that ever changes. See
// the plan's Context section for the reasoning.

interface DraftFields {
  tunisian: string;
  english: string;
  transliteration: string;
  targetTable: 'phrase' | 'sentence';
}

export default function CorrectionsReview() {
  const [reviewerName, setReviewerName] = useState('');
  const [pending, setPending] = useState<PendingCorrection[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftFields>>({});
  const [loadError, setLoadError] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const rows = await fetchPendingCorrections();
      setPending(rows);
      setDrafts(
        Object.fromEntries(
          rows.map((row) => [
            row.id,
            { tunisian: row.tunisian, english: row.english, transliteration: row.transliteration, targetTable: row.targetTable },
          ])
        )
      );
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateDraft = (id: string, patch: Partial<DraftFields>) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  };

  const handleReview = async (correction: PendingCorrection, action: 'approve' | 'reject') => {
    const draft = drafts[correction.id];
    if (!draft || !reviewerName.trim()) {
      setSubmitError('Enter your reviewer name above first.');
      return;
    }
    setSubmitError(null);
    setSubmittingId(correction.id);
    try {
      await submitReview({
        correctionId: correction.id,
        action,
        targetTable: draft.targetTable,
        tunisianText: draft.tunisian.trim(),
        englishText: draft.english.trim(),
        transliteration: draft.transliteration.trim(),
        reviewerName: reviewerName.trim(),
      });
      setPending((current) => (current ?? []).filter((c) => c.id !== correction.id));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Review failed.');
    } finally {
      setSubmittingId(null);
    }
  };

  if (loadError) {
    return (
      <ScreenContainer>
        <BackButton />
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>Couldn&apos;t load corrections</Text>
          <Button label="Try again" variant="secondary" onPress={load} />
        </View>
      </ScreenContainer>
    );
  }

  if (pending === null) return <LoadingScreen />;

  return (
    <ScreenContainer>
      <BackButton />
      <Text style={styles.title}>Correction Review</Text>
      <Text style={styles.subtitle}>
        {pending.length} pending — approve as-is, or edit and save a correction. Either way it's added to the verified
        corpus.
      </Text>

      <TextInput
        value={reviewerName}
        onChangeText={setReviewerName}
        placeholder="Your name (recorded as native_reviewer)"
        placeholderTextColor={colors.textSecondary}
        style={styles.reviewerInput}
      />
      {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {pending.length === 0 ? <Text style={styles.emptyText}>Nothing pending review right now.</Text> : null}

        {pending.map((correction) => {
          const draft = drafts[correction.id];
          if (!draft) return null;
          const isSubmitting = submittingId === correction.id;

          return (
            <View key={correction.id} style={[styles.card, shadows.card]}>
              <Text style={styles.cardMeta}>{new Date(correction.createdAt).toLocaleString()}</Text>

              <Text style={styles.fieldLabel}>Tunisian</Text>
              <TextInput
                value={draft.tunisian}
                onChangeText={(text) => updateDraft(correction.id, { tunisian: text })}
                style={styles.input}
                multiline
              />
              <Text style={styles.fieldLabel}>English</Text>
              <TextInput
                value={draft.english}
                onChangeText={(text) => updateDraft(correction.id, { english: text })}
                style={styles.input}
                multiline
              />
              <Text style={styles.fieldLabel}>Transliteration</Text>
              <TextInput
                value={draft.transliteration}
                onChangeText={(text) => updateDraft(correction.id, { transliteration: text })}
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Promote into</Text>
              <View style={styles.targetRow}>
                {(['sentence', 'phrase'] as const).map((option) => (
                  <PressableScale
                    key={option}
                    onPress={() => updateDraft(correction.id, { targetTable: option })}
                    style={[styles.targetOption, draft.targetTable === option && styles.targetOptionSelected]}
                  >
                    <Text
                      style={[styles.targetOptionText, draft.targetTable === option && styles.targetOptionTextSelected]}
                    >
                      {option}
                    </Text>
                  </PressableScale>
                ))}
              </View>

              <View style={styles.actionsRow}>
                <Button
                  label="❌ Save correction"
                  variant="secondary"
                  onPress={() => handleReview(correction, 'reject')}
                  loading={isSubmitting}
                  style={{ flex: 1 }}
                />
                <Button
                  label="✅ Correct as shown"
                  onPress={() => handleReview(correction, 'approve')}
                  loading={isSubmitting}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          );
        })}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.md },
  reviewerInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  errorText: { fontSize: 13, color: colors.error, marginBottom: spacing.sm },
  list: { gap: spacing.md, paddingBottom: spacing.xl },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, gap: 4 },
  cardMeta: { fontSize: 11, color: colors.textSecondary, marginBottom: spacing.xs },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginTop: spacing.sm, textTransform: 'uppercase' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  targetRow: { flexDirection: 'row', gap: spacing.xs, marginTop: 4 },
  targetOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
  },
  targetOptionSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  targetOptionText: { fontSize: 12, color: colors.textPrimary },
  targetOptionTextSelected: { color: colors.textOnPrimary, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  centeredTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
});
