import { useAudioPlayer } from 'expo-audio';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import {
  cancelTranslationRequest,
  fetchMyTranslationRequests,
  fetchTranslationAllowance,
  getTranslationAnswerAudioUrl,
  markTranslationAnswersSeen,
  submitTranslationRequest,
  TranslationRequestLimitError,
  type TranslationAllowance,
  type TranslationRequest,
} from '@/data/translationRequests';
import { computeResponseDeadline, describeDeadline, formatTunisDay } from '@/lib/translationRequests/deadline';
import { createClientRequestId, MAX_REQUEST_LENGTH, validateRequestText } from '@/lib/translationRequests/validation';
import { useTheme } from '@/lib/theme/ThemeContext';

/**
 * Request a Translation: a signed-in learner asks for an English phrase or
 * sentence in Tunisian Arabic, and gets the Arabic, a transliteration, the
 * meaning and a native recording back — privately, in this list. The free
 * limit (one request) and ownership are enforced by the database
 * (0015_translation_requests.sql); this screen just reflects them.
 */
export default function TranslationRequestsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [requests, setRequests] = useState<TranslationRequest[] | null>(null);
  const [allowance, setAllowance] = useState<TranslationAllowance | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const submitInFlight = useRef(false);
  // One idempotency key per draft: retrying the same text reuses it, so a
  // lost response can't turn into a second request.
  const draftKey = useRef<{ text: string; key: string } | null>(null);

  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const markedSeen = useRef(false);
  const player = useAudioPlayer(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [mine, allowed] = await Promise.all([fetchMyTranslationRequests(), fetchTranslationAllowance()]);
      setRequests(mine);
      setAllowance(allowed);
      if (!markedSeen.current && mine.some((r) => r.isNewAnswer)) {
        markedSeen.current = true;
        // Clears the "ready" notice elsewhere; this visit still shows "New".
        markTranslationAnswersSeen().catch(() => undefined);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'unknown error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const deadlineIfSentNow = describeDeadline(computeResponseDeadline(new Date(Date.now())));

  const handleSubmit = async () => {
    if (submitInFlight.current) return;
    setFormError(null);
    setSentMessage(null);
    const validation = validateRequestText(text);
    if (!validation.ok) {
      setFormError(validation.message);
      return;
    }
    if (draftKey.current?.text !== validation.text) {
      draftKey.current = { text: validation.text, key: createClientRequestId() };
    }

    submitInFlight.current = true;
    setIsSubmitting(true);
    try {
      await submitTranslationRequest(validation.text, draftKey.current.key);
      draftKey.current = null;
      setText('');
      setSentMessage(`Request sent — we'll answer by the end of ${deadlineIfSentNow}.`);
      await load();
    } catch (err) {
      if (err instanceof TranslationRequestLimitError) {
        // The server is the authority: show the "used" state it implies.
        setAllowance((current) => ({ isPremium: false, used: Math.max(1, current?.used ?? 1), remaining: 0 }));
      } else {
        setFormError(err instanceof Error ? err.message : 'Couldn’t send your request.');
      }
    } finally {
      submitInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const handleCancel = async (requestId: string) => {
    if (cancellingId) return;
    setCancellingId(requestId);
    setCardErrors((e) => ({ ...e, [requestId]: '' }));
    try {
      await cancelTranslationRequest(requestId);
      setConfirmingCancelId(null);
      await load();
    } catch (err) {
      setCardErrors((e) => ({ ...e, [requestId]: err instanceof Error ? err.message : 'Couldn’t cancel the request.' }));
    } finally {
      setCancellingId(null);
    }
  };

  const playAnswer = async (request: TranslationRequest, which: 'pronunciation' | 'explanation' = 'pronunciation') => {
    if (!request.answer) return;
    const path = which === 'explanation' ? request.answer.explanationAudioPath : request.answer.audioPath;
    if (!path) return;
    setCardErrors((e) => ({ ...e, [request.id]: '' }));
    try {
      const uri = await getTranslationAnswerAudioUrl(path);
      player.replace({ uri });
      await player.seekTo(0);
      player.play();
    } catch {
      setCardErrors((e) => ({ ...e, [request.id]: 'Couldn’t play the recording — check your connection and try again.' }));
    }
  };

  const canRequest = allowance !== null && allowance.remaining !== 0;

  return (
    <ScreenContainer themed>
      <BackButton themed />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Request a Translation</Text>
        <Text style={styles.body}>
          Ask for any English phrase or sentence and we&apos;ll send it back in Tunisian Arabic, with a transliteration and a
          recording by a native speaker. Only you can see your requests and answers.
        </Text>

        {loadError ? (
          <View style={styles.card}>
            <Text style={styles.errorText}>Couldn&apos;t load your requests ({loadError}). Check your connection.</Text>
            <Button themed label="Retry" variant="secondary" onPress={load} />
          </View>
        ) : requests === null || allowance === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.promise}>We will respond within 3 business days.</Text>
              <Text style={styles.note}>
                Business days are Monday to Friday (Tunis time). Send a request now and expect an answer by the end of{' '}
                {deadlineIfSentNow}.
              </Text>
              <Text style={styles.note}>
                {allowance.isPremium
                  ? 'Premium: unlimited requests.'
                  : allowance.remaining === 0
                    ? 'You’ve used your free request. Premium includes unlimited translation requests.'
                    : `Free plan: 1 request in total — you have ${allowance.remaining} left. Cancelling a request doesn’t give it back.`}
              </Text>

              {canRequest ? (
                <>
                  <TextInput
                    value={text}
                    onChangeText={(value) => {
                      setText(value);
                      setFormError(null);
                    }}
                    placeholder="Type an English phrase or sentence"
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    style={styles.input}
                  />
                  <Text style={[styles.counter, text.trim().length > MAX_REQUEST_LENGTH && styles.errorText]}>
                    {text.trim().length}/{MAX_REQUEST_LENGTH}
                  </Text>
                  {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
                  <Button themed label="Send request" onPress={handleSubmit} loading={isSubmitting} disabled={!text.trim()} />
                </>
              ) : (
                <Button themed label="See Premium plans" onPress={() => router.push('/onboarding/plans')} />
              )}
              {sentMessage ? <Text style={styles.successText}>{sentMessage}</Text> : null}
            </View>

            <Text style={styles.sectionTitle}>Your requests</Text>
            {requests.length === 0 ? (
              <Text style={styles.note}>No requests yet. Your requests and their answers will appear here.</Text>
            ) : (
              requests.map((request) => (
                <View key={request.id} style={styles.card}>
                  <View style={styles.row}>
                    <Text style={[styles.chip, request.status === 'answered' && styles.chipAnswered]}>
                      {request.status === 'answered' ? 'Answered' : 'Submitted'}
                    </Text>
                    {request.isNewAnswer ? <Text style={[styles.chip, styles.chipNew]}>New</Text> : null}
                  </View>
                  <Text style={styles.label}>Your question</Text>
                  <Text style={styles.requestText}>{request.englishText}</Text>
                  <Text style={styles.meta}>Sent {formatTunisDay(new Date(request.submittedAt))}</Text>

                  {request.status === 'answered' && request.answer ? (
                    <View style={styles.answer}>
                      <Text style={styles.arabic}>{request.answer.arabic}</Text>
                      <Text style={styles.transliteration}>{request.answer.transliteration}</Text>
                      <Text style={styles.note}>Meaning: {request.answer.english}</Text>
                      <Button themed label="▶ Play native recording" variant="secondary" onPress={() => playAnswer(request)} />
                      {request.answer.explanationAudioPath ? (
                        <Button
                          themed
                          label="▶ Play explanation"
                          variant="ghost"
                          onPress={() => playAnswer(request, 'explanation')}
                        />
                      ) : null}
                    </View>
                  ) : (
                    <>
                      <Text style={styles.note}>Answer expected by the end of {describeDeadline(new Date(request.dueAt))}.</Text>
                      {confirmingCancelId === request.id ? (
                        <View style={styles.confirm}>
                          <Text style={styles.confirmText}>Cancel this request?</Text>
                          <View style={styles.row}>
                            <Button
                              themed
                              label="Keep it"
                              variant="ghost"
                              onPress={() => setConfirmingCancelId(null)}
                              disabled={cancellingId !== null}
                              style={{ flex: 1 }}
                            />
                            <Button
                              themed
                              label="Yes, cancel it"
                              variant="secondary"
                              onPress={() => handleCancel(request.id)}
                              loading={cancellingId === request.id}
                              style={{ flex: 1 }}
                            />
                          </View>
                        </View>
                      ) : (
                        <Button themed label="Cancel request" variant="ghost" onPress={() => setConfirmingCancelId(request.id)} />
                      )}
                    </>
                  )}
                  {cardErrors[request.id] ? <Text style={styles.errorText}>{cardErrors[request.id]}</Text> : null}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    scroll: { paddingBottom: spacing.xxl },
    title: { fontSize: 26, fontWeight: '800', color: c.textPrimary, marginTop: spacing.md },
    body: { fontSize: 15, lineHeight: 22, color: c.textSecondary, marginTop: spacing.xs, marginBottom: spacing.md },
    card: {
      backgroundColor: c.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.md,
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    promise: { fontSize: 16, fontWeight: '700', color: c.textPrimary },
    note: { fontSize: 14, lineHeight: 20, color: c.textSecondary },
    input: {
      minHeight: 80,
      borderWidth: 1.5,
      borderColor: c.border,
      borderRadius: radii.md,
      padding: spacing.sm,
      fontSize: 16,
      color: c.textPrimary,
      backgroundColor: c.background,
      textAlignVertical: 'top',
    },
    counter: { fontSize: 12, color: c.textSecondary, textAlign: 'right' },
    errorText: { fontSize: 13, color: c.error },
    successText: { fontSize: 13, color: c.success },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: c.textPrimary, marginTop: spacing.sm, marginBottom: spacing.sm },
    row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
    chip: {
      fontSize: 12,
      fontWeight: '700',
      color: c.primary,
      backgroundColor: `${c.primary}1A`,
      borderRadius: radii.pill,
      paddingVertical: 2,
      paddingHorizontal: spacing.sm,
      overflow: 'hidden',
    },
    chipAnswered: { color: c.success, backgroundColor: `${c.success}1A` },
    chipNew: { color: c.textOnPrimary, backgroundColor: c.primary },
    label: { fontSize: 11, fontWeight: '700', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
    requestText: { fontSize: 16, fontWeight: '600', color: c.textPrimary },
    meta: { fontSize: 12, color: c.textSecondary },
    answer: { gap: spacing.xs, marginTop: spacing.xs },
    arabic: { fontSize: 26, fontWeight: '700', color: c.textPrimary, textAlign: 'center' },
    transliteration: { fontSize: 16, fontStyle: 'italic', color: c.textSecondary, textAlign: 'center' },
    confirm: { gap: spacing.xs },
    confirmText: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
  });
