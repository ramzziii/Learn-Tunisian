import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PillSelect } from '@/components/admin/PillSelect';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import {
  fetchPendingCorrections,
  fetchReviewedCorrections,
  submitReview,
  type CorrectionReason,
  type PendingCorrection,
  type ReviewedCorrection,
} from '@/data/corrections';
import { fetchIsReviewer } from '@/data/reviewers';

// Reached through app/admin/_layout.tsx (admin-only), but reviewing language
// content needs more than admin: the account must be an allowlisted
// language reviewer (public.reviewers). That's resolved before the queue is
// fetched or rendered; talk-review and RLS enforce the same rule on the
// server.

const TARGET_TABLE_OPTIONS = [
  { value: 'sentence', label: 'Sentence' },
  { value: 'phrase', label: 'Phrase' },
];

const REASON_OPTIONS: { value: CorrectionReason; label: string }[] = [
  { value: 'too_formal', label: 'Too formal' },
  { value: 'too_casual', label: 'Too casual' },
  { value: 'dialected', label: 'Dialected' },
  { value: 'incorrect', label: 'Incorrect' },
  { value: 'other', label: 'Other' },
];

const REASON_LABEL: Record<CorrectionReason, string> = Object.fromEntries(
  REASON_OPTIONS.map((o) => [o.value, o.label])
) as Record<CorrectionReason, string>;

interface DraftFields {
  tunisian: string;
  english: string;
  transliteration: string;
  targetTable: 'phrase' | 'sentence';
  correctionReason: CorrectionReason | null;
}

export default function CorrectionsReview() {
  const [access, setAccess] = useState<'checking' | 'reviewer' | 'denied' | 'error'>('checking');
  const [view, setView] = useState<'pending' | 'history'>('pending');

  const [reviewerName, setReviewerName] = useState('');
  const [pending, setPending] = useState<PendingCorrection[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftFields>>({});
  const [loadError, setLoadError] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [history, setHistory] = useState<ReviewedCorrection[] | null>(null);
  const [historyError, setHistoryError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const rows = await fetchPendingCorrections();
      setPending(rows);
      setDrafts(
        Object.fromEntries(
          rows.map((row) => [
            row.id,
            {
              tunisian: row.tunisian,
              english: row.english,
              transliteration: row.transliteration,
              targetTable: row.targetTable,
              correctionReason: null,
            },
          ])
        )
      );
    } catch {
      setLoadError(true);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryError(false);
    try {
      setHistory(await fetchReviewedCorrections());
    } catch {
      setHistoryError(true);
    }
  }, []);

  const checkAccess = useCallback(async () => {
    setAccess('checking');
    try {
      setAccess((await fetchIsReviewer()) ? 'reviewer' : 'denied');
    } catch {
      setAccess('error'); // fail closed — never show the queue on a failed check
    }
  }, []);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  useEffect(() => {
    if (access === 'reviewer') load();
  }, [access, load]);

  useEffect(() => {
    if (access === 'reviewer' && view === 'history' && history === null) loadHistory();
  }, [access, view, history, loadHistory]);

  const updateDraft = (id: string, patch: Partial<DraftFields>) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  };

  const handleReview = async (correction: PendingCorrection, action: 'approve' | 'reject') => {
    const draft = drafts[correction.id];
    if (!draft || !reviewerName.trim()) {
      setSubmitError('Enter your reviewer name above first.');
      return;
    }
    if (action === 'reject' && !draft.correctionReason) {
      setSubmitError('Pick a reason for the correction above first.');
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
        correctionReason: action === 'reject' ? (draft.correctionReason ?? undefined) : undefined,
      });
      setPending((current) => (current ?? []).filter((c) => c.id !== correction.id));
      setHistory(null); // stale now — reload next time History is opened
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Review failed.');
    } finally {
      setSubmittingId(null);
    }
  };

  if (access === 'checking') {
    return (
      <View testID="reviewer-check-loading" style={{ flex: 1 }}>
        <LoadingScreen />
      </View>
    );
  }

  if (access === 'error') {
    return (
      <ScreenContainer>
        <BackButton />
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>Couldn&apos;t check your reviewer access</Text>
          <Text style={styles.centeredBody}>Check your connection and try again.</Text>
          <Button label="Try again" variant="secondary" onPress={checkAccess} />
        </View>
      </ScreenContainer>
    );
  }

  if (access === 'denied') {
    return (
      <ScreenContainer>
        <BackButton />
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>Reviewer access needed</Text>
          <Text style={styles.centeredBody}>
            Only approved language reviewers can review AI language content. Being an admin doesn&apos;t include it —
            ask the project owner to add your account as a reviewer.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

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

      <View style={styles.tabRow}>
        <Button
          label={`Pending (${pending.length})`}
          variant={view === 'pending' ? 'primary' : 'secondary'}
          onPress={() => setView('pending')}
          style={{ flex: 1 }}
        />
        <Button
          label="History"
          variant={view === 'history' ? 'primary' : 'secondary'}
          onPress={() => setView('history')}
          style={{ flex: 1 }}
        />
      </View>

      {view === 'pending' ? (
        <>
          <Text style={styles.subtitle}>
            Approve as-is, or edit and save a correction. Either way it&apos;s added to the verified corpus.
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
              const isEdited =
                draft.tunisian !== correction.tunisian ||
                draft.english !== correction.english ||
                draft.transliteration !== correction.transliteration;

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

                  <PillSelect
                    label="Promote into"
                    options={TARGET_TABLE_OPTIONS}
                    value={draft.targetTable}
                    onChange={(v) => updateDraft(correction.id, { targetTable: v as 'phrase' | 'sentence' })}
                  />

                  {isEdited ? (
                    <PillSelect
                      label="Why did this need correcting?"
                      options={REASON_OPTIONS}
                      value={draft.correctionReason ?? ''}
                      onChange={(v) => updateDraft(correction.id, { correctionReason: v as CorrectionReason })}
                    />
                  ) : null}

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
        </>
      ) : (
        <HistoryView history={history} error={historyError} onRetry={loadHistory} />
      )}
    </ScreenContainer>
  );
}

function HistoryView({
  history,
  error,
  onRetry,
}: {
  history: ReviewedCorrection[] | null;
  error: boolean;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.centeredTitle}>Couldn&apos;t load history</Text>
        <Button label="Try again" variant="secondary" onPress={onRetry} />
      </View>
    );
  }
  if (history === null) return <LoadingScreen />;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
      {history.length === 0 ? <Text style={styles.emptyText}>No reviewed corrections yet.</Text> : null}
      {history.map((item) => (
        <View key={item.id} style={[styles.card, shadows.card]}>
          <Text style={styles.cardMeta}>
            {new Date(item.reviewedAt).toLocaleString()} · {item.reviewerName ?? 'unknown reviewer'}
          </Text>
          {item.wasEdited ? (
            <>
              <Text style={styles.fieldLabel}>Original (AI)</Text>
              <Text style={styles.historyText}>
                {item.original.tunisian} — {item.original.english}
              </Text>
              <Text style={styles.fieldLabel}>Corrected</Text>
              <Text style={styles.historyText}>
                {item.final.tunisian} — {item.final.english}
              </Text>
              {item.correctionReason ? (
                <View style={styles.reasonBadge}>
                  <Text style={styles.reasonBadgeText}>{REASON_LABEL[item.correctionReason]}</Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.fieldLabel}>Approved as shown</Text>
              <Text style={styles.historyText}>
                {item.final.tunisian} — {item.final.english}
              </Text>
            </>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.md },
  tabRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.sm },
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
  historyText: { fontSize: 14, color: colors.textPrimary },
  reasonBadge: {
    backgroundColor: `${colors.accent}26`,
    borderRadius: radii.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  reasonBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primaryDark },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  centeredTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  centeredBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.lg },
});
