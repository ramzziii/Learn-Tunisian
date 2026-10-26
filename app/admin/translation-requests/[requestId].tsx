import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AudioRecorderField } from '@/components/admin/AudioRecorderField';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { listLessonsForUnit, listUnitsAdmin } from '@/data/admin/content';
import {
  answerTranslationRequest,
  getTranslationRequestAdmin,
  markTranslationRequestInProgress,
  rejectTranslationRequest,
  setTranslationAnswerAudio,
  setTranslationExplanationAudio,
  shareTranslationToAppContent,
  type AdminTranslationRequest,
  type AnswerEmailOutcome,
} from '@/data/admin/translationRequests';
import { useAuth } from '@/lib/auth/AuthContext';
import { TRANSLATION_AUDIO_BUCKET } from '@/lib/translationRequests/constants';
import { deadlineStatus, formatTunisDay } from '@/lib/translationRequests/deadline';
import type { Lesson, Unit } from '@/types/models';

const STATUS_LABEL: Record<AdminTranslationRequest['status'], string> = {
  submitted: 'Not started yet',
  in_progress: 'Being handled',
  answered: 'Answered',
  rejected: 'Rejected',
  cancelled: 'Cancelled by the learner',
};

function Checkbox({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={styles.checkboxRow}
      hitSlop={8}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <Text style={styles.checkmark}>✓</Text> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

function emailMessage(outcome: AnswerEmailOutcome): string {
  switch (outcome.email) {
    case 'sent':
    case 'already_sent':
      return 'The learner was emailed that it’s ready.';
    case 'not_configured':
      return 'Email isn’t set up on the server yet, so no email was sent — the learner will see the answer in the app.';
    case 'failed':
      return `Couldn’t send the email (${outcome.message}). The learner will still see the answer in the app.`;
  }
}

/**
 * One translation request. The answer is: Tunisian Arabic + transliteration
 * + English meaning + a native recording (the same recorder/uploader as
 * content audio, pointed at the private translation-audio bucket). The
 * recording is saved onto the request first; "Send answer" then saves the
 * text and marks it answered in one step, and only after that is the
 * learner emailed. Afterwards the admin may copy it into shared content —
 * as pending_review, through the existing Approval Queue.
 */
export default function AdminTranslationRequestDetail() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const { session } = useAuth();
  const actorAccountId = session?.user.id ?? '';

  const [request, setRequest] = useState<AdminTranslationRequest | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [explanationPath, setExplanationPath] = useState<string | null>(null);
  const [sharePronunciation, setSharePronunciation] = useState(true);
  const [shareExplanation, setShareExplanation] = useState(true);
  const [arabic, setArabic] = useState('');
  const [transliteration, setTransliteration] = useState('');
  const [english, setEnglish] = useState('');
  const [busy, setBusy] = useState<'progress' | 'reject' | 'answer' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [emailOutcome, setEmailOutcome] = useState<AnswerEmailOutcome | null>(null);

  const [shareStep, setShareStep] = useState<'ask' | 'pick' | 'private' | 'shared'>('ask');
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [lessonNumber, setLessonNumber] = useState<number | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    getTranslationRequestAdmin(requestId)
      .then((loaded) => {
        setRequest(loaded);
        if (loaded) {
          setAudioPath(loaded.answerAudioPath);
          setExplanationPath(loaded.answerExplanationAudioPath);
          setArabic(loaded.answerArabic ?? '');
          setTransliteration(loaded.answerTransliteration ?? '');
          // The Meaning is the admin's own natural English for the answer —
          // never prefilled from the learner's (private) question.
          setEnglish(loaded.answerEnglish ?? '');
        }
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'unknown error'));
  }, [requestId]);

  useEffect(load, [load]);

  if (loadError) {
    return (
      <ScreenContainer>
        <BackButton />
        <Text style={styles.errorText}>Couldn&apos;t load this request ({loadError}).</Text>
        <Button label="Retry" variant="secondary" onPress={load} />
      </ScreenContainer>
    );
  }
  if (request === undefined) {
    return (
      <ScreenContainer>
        <BackButton />
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      </ScreenContainer>
    );
  }
  if (request === null) {
    return (
      <ScreenContainer>
        <BackButton />
        <Text style={styles.empty}>Request not found.</Text>
      </ScreenContainer>
    );
  }

  const isOpen = request.status === 'submitted' || request.status === 'in_progress';
  const deadline = deadlineStatus(new Date(request.dueAt), new Date(Date.now()));

  const run = async (kind: 'progress' | 'reject', action: () => Promise<void>, next: AdminTranslationRequest['status']) => {
    setBusy(kind);
    setActionError(null);
    try {
      await action();
      setRequest({ ...request, status: next });
      setConfirmingReject(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const sendAnswer = async () => {
    if (busy) return;
    setActionError(null);
    if (!english.trim()) {
      setActionError('Add the Meaning — the natural English phrase for your Tunisian answer.');
      return;
    }
    if (!audioPath) {
      setActionError('Save the native recording first, then send the answer.');
      return;
    }
    setBusy('answer');
    try {
      const outcome = await answerTranslationRequest(request.id, { arabic, transliteration, english });
      setRequest({
        ...request,
        status: 'answered',
        answerArabic: arabic.trim(),
        answerTransliteration: transliteration.trim(),
        answerEnglish: english.trim(),
        answerAudioPath: audioPath,
        answerExplanationAudioPath: explanationPath,
        answeredAt: new Date(Date.now()).toISOString(),
      });
      setEmailOutcome(outcome);
    } catch (err) {
      // Nothing was marked answered and nobody was notified; the typed answer stays for a retry.
      setActionError(err instanceof Error ? err.message : 'Couldn’t save the answer.');
    } finally {
      setBusy(null);
    }
  };

  const startShare = async () => {
    setShareStep('pick');
    setShareError(null);
    try {
      setUnits(await listUnitsAdmin());
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Couldn’t load units.');
    }
  };

  const chooseUnit = async (id: string) => {
    setUnitId(id);
    setLessonNumber(null);
    setLessons(null);
    setShareError(null);
    try {
      const loaded = await listLessonsForUnit(id);
      setLessons(loaded);
      // Nothing to choose between — select it, so "Add for review" just works.
      if (loaded.length === 1) setLessonNumber(loaded[0].lessonNumber);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Couldn’t load lessons.');
    }
  };

  const share = async () => {
    if (isSharing) return;
    // Say what's missing rather than ignoring the tap.
    if (!unitId) {
      setShareError('Choose a unit first.');
      return;
    }
    if (lessonNumber === null) {
      setShareError(lessons?.length === 0 ? 'This unit has no lessons yet — choose another unit.' : 'Choose a lesson (above) first.');
      return;
    }
    setIsSharing(true);
    setShareError(null);
    try {
      const { wordGroupId } = await shareTranslationToAppContent({
        request,
        unitId,
        lessonNumber,
        actorAccountId,
        includePronunciation: sharePronunciation,
        includeExplanation: shareExplanation && !!request.answerExplanationAudioPath,
      });
      setRequest({ ...request, sharedWordGroupId: wordGroupId });
      setShareStep('shared');
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Couldn’t add it to app content.');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <ScreenContainer>
      <BackButton />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>Translation request</Text>
        <Text style={styles.fieldLabel}>Learner’s question (private — never shared)</Text>
        <Text style={styles.requestText}>{request.englishText}</Text>
        <Text style={styles.meta}>Sent {formatTunisDay(new Date(request.submittedAt))}</Text>
        <View style={styles.row}>
          <Text style={styles.status}>{STATUS_LABEL[request.status]}</Text>
          {isOpen ? <Text style={[styles.deadline, deadline.overdue && styles.overdue]}>{deadline.label}</Text> : null}
        </View>

        {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

        {request.status === 'rejected' ? (
          <Text style={styles.note}>Rejected — the learner no longer sees this request.</Text>
        ) : request.status === 'cancelled' ? (
          <Text style={styles.note}>The learner cancelled this request.</Text>
        ) : null}

        {isOpen ? (
          <>
            <View style={styles.row}>
              {request.status === 'submitted' ? (
                <Button
                  label="Mark as being handled"
                  variant="secondary"
                  onPress={() => run('progress', () => markTranslationRequestInProgress(request.id), 'in_progress')}
                  loading={busy === 'progress'}
                  style={{ flex: 1 }}
                />
              ) : null}
              <Button label="Reject" variant="ghost" onPress={() => setConfirmingReject(true)} style={{ flex: 1 }} />
            </View>
            {confirmingReject ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Reject this request? The learner will no longer see it.</Text>
                <View style={styles.row}>
                  <Button label="Keep it open" variant="ghost" onPress={() => setConfirmingReject(false)} style={{ flex: 1 }} />
                  <Button
                    label="Yes, reject it"
                    onPress={() => run('reject', () => rejectTranslationRequest(request.id), 'rejected')}
                    loading={busy === 'reject'}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            ) : null}

            <View style={[styles.card, shadows.card]}>
              <Text style={styles.cardTitle}>Answer</Text>
              <Text style={styles.fieldLabel}>Tunisian Arabic</Text>
              <TextInput value={arabic} onChangeText={setArabic} placeholder="Tunisian Arabic" style={[styles.input, styles.arabicInput]} />
              <Text style={styles.fieldLabel}>Transliteration</Text>
              <TextInput
                value={transliteration}
                onChangeText={setTransliteration}
                placeholder="Transliteration"
                autoCapitalize="none"
                style={styles.input}
              />
              <Text style={styles.fieldLabel}>Meaning (shown to the learner; used if you share it)</Text>
              <TextInput
                value={english}
                onChangeText={setEnglish}
                placeholder="The natural English for your Tunisian answer"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Pronunciation recording (native speaker)</Text>
              <AudioRecorderField
                wordGroupId={request.id}
                variantId="answer"
                currentAudioPath={audioPath}
                updatedAt={request.submittedAt}
                audioBucket={TRANSLATION_AUDIO_BUCKET}
                onUploaded={async (path) => {
                  // Not caught: a failure must reach the recorder so it keeps the previous file.
                  const saved = await setTranslationAnswerAudio(request.id, path);
                  setAudioPath(saved);
                  return saved;
                }}
              />

              {/* Its own file and column — never mixed up with the pronunciation. */}
              <Text style={styles.fieldLabel}>Explanation recording (optional)</Text>
              <Text style={styles.note}>A native speaker explaining it — in English, Arabic, or both.</Text>
              <AudioRecorderField
                wordGroupId={request.id}
                variantId="explanation"
                currentAudioPath={explanationPath}
                updatedAt={request.submittedAt}
                audioBucket={TRANSLATION_AUDIO_BUCKET}
                onUploaded={async (path) => {
                  const saved = await setTranslationExplanationAudio(request.id, path);
                  setExplanationPath(saved);
                  return saved;
                }}
              />

              <Button label="Send answer" onPress={sendAnswer} loading={busy === 'answer'} style={{ marginTop: spacing.sm }} />
            </View>
          </>
        ) : null}

        {request.status === 'answered' ? (
          <View style={[styles.card, shadows.card]}>
            {emailOutcome ? (
              <>
                <Text style={styles.successText}>Answer sent — the learner will see it in the app.</Text>
                <Text style={styles.note}>{emailMessage(emailOutcome)}</Text>
              </>
            ) : null}
            <Text style={styles.arabic}>{request.answerArabic}</Text>
            <Text style={styles.transliteration}>{request.answerTransliteration}</Text>
            <Text style={styles.note}>Meaning: {request.answerEnglish}</Text>

            {request.sharedWordGroupId ? (
              <Text style={styles.note}>Added to app content for review (word group {request.sharedWordGroupId}).</Text>
            ) : null}
            {shareStep === 'shared' ? (
              <Text style={styles.successText}>Added to the Approval Queue for review — it goes live once approved.</Text>
            ) : null}

            {!request.sharedWordGroupId && shareStep === 'ask' ? (
              <View style={styles.sharePrompt}>
                <Text style={styles.cardTitle}>Add this translation to the app&apos;s shared content?</Text>
                <Text style={styles.note}>
                  It stays private to the learner unless you add it. Only the Tunisian Arabic, transliteration, Meaning and
                  recording are shared — the learner’s question is never shared. Added content goes to the Approval Queue
                  before anyone else can see it.
                </Text>
                <View style={styles.row}>
                  <Button label="Keep it private" variant="ghost" onPress={() => setShareStep('private')} style={{ flex: 1 }} />
                  <Button label="Add to app content" variant="secondary" onPress={startShare} style={{ flex: 1 }} />
                </View>
              </View>
            ) : null}
            {shareStep === 'private' ? <Text style={styles.note}>Kept private to the learner.</Text> : null}

            {!request.sharedWordGroupId && shareStep === 'pick' ? (
              <View style={styles.sharePrompt}>
                <Text style={styles.fieldLabel}>Unit</Text>
                {units === null && !shareError ? <ActivityIndicator color={colors.primary} /> : null}
                <View style={styles.wrapRow}>
                  {(units ?? []).map((unit) => (
                    <Button
                      key={unit.id}
                      label={unit.name}
                      variant={unitId === unit.id ? 'primary' : 'ghost'}
                      onPress={() => chooseUnit(unit.id)}
                    />
                  ))}
                </View>
                {unitId ? (
                  <>
                    <Text style={styles.fieldLabel}>Lesson</Text>
                    {lessons === null && !shareError ? <ActivityIndicator color={colors.primary} /> : null}
                    {lessons?.length === 0 ? <Text style={styles.note}>This unit has no lessons yet.</Text> : null}
                    <View style={styles.wrapRow}>
                      {(lessons ?? []).map((lesson) => (
                        <Button
                          key={lesson.id}
                          label={`Lesson ${lesson.lessonNumber}${lesson.title ? ` — ${lesson.title}` : ''}`}
                          variant={lessonNumber === lesson.lessonNumber ? 'primary' : 'ghost'}
                          onPress={() => setLessonNumber(lesson.lessonNumber)}
                        />
                      ))}
                    </View>
                  </>
                ) : null}
                <Text style={styles.fieldLabel}>Recordings to include</Text>
                <Checkbox
                  label="Include pronunciation recording"
                  checked={sharePronunciation}
                  onToggle={() => setSharePronunciation((v) => !v)}
                />
                {request.answerExplanationAudioPath ? (
                  <Checkbox
                    label="Include explanation recording"
                    checked={shareExplanation}
                    onToggle={() => setShareExplanation((v) => !v)}
                  />
                ) : null}
                {!sharePronunciation ? (
                  <Text style={styles.note}>It will be listed under Native Recordings so a pronunciation can be added later.</Text>
                ) : null}
                {shareError ? <Text style={styles.errorText}>{shareError}</Text> : null}
                <Button label="Add for review" onPress={share} loading={isSharing} />
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl, gap: spacing.sm },
  eyebrow: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', marginTop: spacing.md },
  requestText: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  meta: { fontSize: 13, color: colors.textSecondary },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  status: { fontSize: 13, fontWeight: '700', color: colors.primary },
  deadline: { fontSize: 13, fontWeight: '700', color: colors.success },
  overdue: { color: colors.error },
  card: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, gap: spacing.xs },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
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
  arabicInput: { fontSize: 20, textAlign: 'right' },
  arabic: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  transliteration: { fontSize: 16, fontStyle: 'italic', color: colors.textSecondary, textAlign: 'center' },
  sharePrompt: { gap: spacing.xs, marginTop: spacing.sm },
  note: { fontSize: 14, color: colors.textSecondary },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary },
  checkmark: { color: colors.textOnPrimary, fontSize: 14, fontWeight: '800' },
  checkboxLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  successText: { fontSize: 14, fontWeight: '700', color: colors.success },
  errorText: { fontSize: 13, color: colors.error },
  empty: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
});
