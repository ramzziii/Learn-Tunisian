import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { findTalkScenario } from '@/constants/talkScenarios';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { buildWordHelp } from '@/lib/ai/buildWordHelp';
import type { ConversationDifficulty, GroundedVocabularyItem, SuggestedReply, TutorResponse } from '@/lib/ai/types';
import { canAccessTalkFeature } from '@/lib/ai/accessControl';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { type ConversationMessage, useConversation } from '@/hooks/useConversation';

const ERROR_MESSAGES: Record<string, string> = {
  network: "Couldn't connect. Check your internet and try again.",
  timeout: 'That took too long. Give it another try.',
  rate_limited: "We're getting a lot of requests right now — try again in a moment.",
  invalid_response: 'Something unexpected happened. Let\'s try again.',
  provider_error: 'Something went wrong on our end. Let\'s try again.',
  not_configured: 'This feature isn\'t fully set up yet.',
};

export default function TalkConversation() {
  const { scenarioId, difficulty } = useLocalSearchParams<{ scenarioId: string; difficulty?: string }>();
  const { activeProfile } = useActiveProfile();
  const [input, setInput] = useState('');
  const [helpForMessageId, setHelpForMessageId] = useState<string | null>(null);

  const resolvedDifficulty: ConversationDifficulty = difficulty === 'intermediate' ? 'intermediate' : 'beginner';
  const scenario = findTalkScenario(scenarioId ?? '');

  const { status, messages, vocabulary, error, sendMessage, retry } = useConversation(
    scenarioId ?? '',
    activeProfile?.id ?? '',
    activeProfile?.track ?? 'adult',
    resolvedDifficulty
  );

  if (!activeProfile) return <LoadingScreen />;

  // Same defense-in-depth as the scenario picker — a kid profile reaching
  // this route directly (e.g. a stale deep link) never sees the feature.
  if (!canAccessTalkFeature(activeProfile.track)) {
    return (
      <ScreenContainer>
        <BackButton />
        <View style={styles.centered}>
          <Text style={styles.centeredEmoji}>🌱</Text>
          <Text style={styles.centeredTitle}>Coming soon!</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!scenario) {
    return (
      <ScreenContainer>
        <BackButton />
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>We couldn&apos;t find that conversation.</Text>
          <Button label="Back to situations" variant="secondary" onPress={() => router.replace('/talk')} />
        </View>
      </ScreenContainer>
    );
  }

  const handleSend = (text: string) => {
    setHelpForMessageId(null);
    setInput('');
    sendMessage(text);
  };

  const lastTutorMessage = [...messages].reverse().find((m): m is Extract<ConversationMessage, { role: 'tutor' }> => m.role === 'tutor');
  const isBusy = status === 'sending' || status === 'loading';

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle}>
          {scenario.emoji} {scenario.title}
        </Text>
      </View>

      <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent}>
        {messages.map((message) =>
          message.role === 'tutor' ? (
            <TutorBubble
              key={message.id}
              response={message.response}
              showHelp={helpForMessageId === message.id}
              onToggleHelp={() => setHelpForMessageId((current) => (current === message.id ? null : message.id))}
              vocabulary={vocabulary}
            />
          ) : (
            <LearnerBubble key={message.id} text={message.text} />
          )
        )}

        {status === 'loading' ? <Text style={styles.typingIndicator}>The tutor is typing…</Text> : null}
        {status === 'sending' ? <Text style={styles.typingIndicator}>The tutor is typing…</Text> : null}

        {status === 'error' && error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{ERROR_MESSAGES[error.kind] ?? ERROR_MESSAGES.provider_error}</Text>
            <Button label="Try again" variant="secondary" onPress={retry} />
          </View>
        ) : null}

        {status === 'finished' ? (
          <View style={styles.finishedBanner}>
            <Text style={styles.finishedEmoji}>🎉</Text>
            <Text style={styles.finishedTitle}>Conversation complete!</Text>
            <Text style={styles.finishedBody}>
              You practiced {vocabulary.length > 0 ? `${vocabulary.length} words` : 'this conversation'} in {scenario.title.toLowerCase()}.
            </Text>
            <Button label="Done" onPress={() => router.replace('/talk')} />
          </View>
        ) : null}
      </ScrollView>

      {status !== 'finished' && lastTutorMessage?.response.suggestedReplies?.length ? (
        <View style={styles.suggestedRow}>
          {lastTutorMessage.response.suggestedReplies.map((reply, index) => (
            <SuggestedReplyChip key={index} reply={reply} disabled={isBusy} onPress={() => handleSend(reply.tunisian)} />
          ))}
        </View>
      ) : null}

      {status !== 'finished' ? (
        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Type your reply…"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            editable={!isBusy}
            onSubmitEditing={() => input.trim() && handleSend(input)}
          />
          <PressableScale
            onPress={() => input.trim() && handleSend(input)}
            disabled={isBusy || !input.trim()}
            style={[styles.sendButton, (isBusy || !input.trim()) && styles.sendButtonDisabled]}
          >
            <Text style={styles.sendIcon}>➤</Text>
          </PressableScale>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

function TutorBubble({
  response,
  showHelp,
  onToggleHelp,
  vocabulary,
}: {
  response: TutorResponse;
  showHelp: boolean;
  onToggleHelp: () => void;
  vocabulary: GroundedVocabularyItem[];
}) {
  const wordHelp = buildWordHelp(response.tunisian, vocabulary);

  return (
    <View style={[styles.bubble, styles.tutorBubble, shadows.card]}>
      <Text style={styles.tutorLabel}>🇹🇳 Tutor</Text>
      <Text style={styles.tunisianText}>{response.tunisian}</Text>
      {response.transliteration ? <Text style={styles.transliterationText}>{response.transliteration}</Text> : null}
      <Text style={styles.englishText}>{response.english}</Text>

      {response.correction ? (
        <View style={styles.correctionBox}>
          <Text style={styles.correctionLabel}>A small tip:</Text>
          <Text style={styles.correctionText}>
            {response.correction.corrected}
            {'  '}
            <Text style={styles.correctionExplanation}>({response.correction.explanation})</Text>
          </Text>
        </View>
      ) : null}

      <PressableScale onPress={onToggleHelp} style={styles.helpButton}>
        <Text style={styles.helpButtonText}>{showHelp ? 'Hide help' : "I don't understand"}</Text>
      </PressableScale>

      {showHelp ? (
        <View style={styles.helpPanel}>
          <Text style={styles.helpLine}>
            <Text style={styles.helpLineLabel}>Tunisian: </Text>
            {response.tunisian}
          </Text>
          <Text style={styles.helpLine}>
            <Text style={styles.helpLineLabel}>English: </Text>
            {response.english}
          </Text>
          {wordHelp.length > 0 ? (
            <View style={{ marginTop: spacing.xs }}>
              <Text style={styles.helpLineLabel}>Word help:</Text>
              {wordHelp.map((entry) => (
                <Text key={entry.word} style={styles.helpWordLine}>
                  {entry.word} = {entry.meaning}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function LearnerBubble({ text }: { text: string }) {
  return (
    <View style={[styles.bubble, styles.learnerBubble]}>
      <Text style={styles.learnerLabel}>You</Text>
      <Text style={styles.learnerText}>{text}</Text>
    </View>
  );
}

function SuggestedReplyChip({ reply, disabled, onPress }: { reply: SuggestedReply; disabled: boolean; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} disabled={disabled} style={[styles.chip, disabled && styles.chipDisabled]}>
      <Text style={styles.chipTunisian}>{reply.tunisian}</Text>
      <Text style={styles.chipEnglish}>{reply.english}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  messages: { flex: 1 },
  messagesContent: { paddingBottom: spacing.md, gap: spacing.sm },
  bubble: { borderRadius: radii.lg, padding: spacing.md, maxWidth: '90%' },
  tutorBubble: { backgroundColor: colors.surface, alignSelf: 'flex-start' },
  tutorLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs },
  tunisianText: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  transliterationText: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', marginTop: 2 },
  englishText: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs },
  correctionBox: { backgroundColor: '#FFF8E7', borderRadius: radii.sm, padding: spacing.sm, marginTop: spacing.sm },
  correctionLabel: { fontSize: 11, fontWeight: '700', color: colors.accent, marginBottom: 2 },
  correctionText: { fontSize: 14, color: colors.textPrimary },
  correctionExplanation: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic' },
  helpButton: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  helpButtonText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  helpPanel: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, gap: 2 },
  helpLine: { fontSize: 13, color: colors.textPrimary },
  helpLineLabel: { fontWeight: '700' },
  helpWordLine: { fontSize: 13, color: colors.textSecondary },
  learnerBubble: { backgroundColor: colors.primary, alignSelf: 'flex-end' },
  learnerLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.75)', marginBottom: 2 },
  learnerText: { fontSize: 16, color: colors.textOnPrimary },
  typingIndicator: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', marginTop: spacing.xs },
  errorBanner: {
    backgroundColor: '#FBEAE6',
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  errorText: { fontSize: 14, color: colors.textPrimary, textAlign: 'center' },
  finishedBanner: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  finishedEmoji: { fontSize: 40 },
  finishedTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  finishedBody: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.sm },
  suggestedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingVertical: spacing.sm },
  chip: {
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipDisabled: { opacity: 0.5 },
  chipTunisian: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  chipEnglish: { fontSize: 11, color: colors.textSecondary },
  composer: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', paddingTop: spacing.sm },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.4 },
  sendIcon: { fontSize: 18, color: colors.textOnPrimary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  centeredEmoji: { fontSize: 48 },
  centeredTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
});
