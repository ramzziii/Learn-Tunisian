import { useCallback, useEffect, useRef, useState } from 'react';

import { findTalkScenario } from '@/constants/talkScenarios';
import { fetchLearnerContext, fetchScenarioVocabulary, fetchTalkLevel } from '@/data/talkContext';
import { aiProvider } from '@/lib/ai';
import { canAccessTalkFeature } from '@/lib/ai/accessControl';
import type { AiProviderError, ConversationTurn, GroundedVocabularyItem, LearnerContext, TutorResponse } from '@/lib/ai/types';

export type ConversationMessage =
  | { id: string; role: 'learner'; text: string }
  | { id: string; role: 'tutor'; response: TutorResponse };

type ConversationStatus = 'loading' | 'ready' | 'sending' | 'error' | 'finished';

interface ConversationState {
  status: ConversationStatus;
  messages: ConversationMessage[];
  vocabulary: GroundedVocabularyItem[];
  error: AiProviderError | null;
}

let messageIdCounter = 0;
function nextMessageId(): string {
  messageIdCounter += 1;
  return `msg-${messageIdCounter}`;
}

function toHistory(messages: ConversationMessage[]): ConversationTurn[] {
  return messages.map((message) =>
    message.role === 'learner'
      ? { role: 'learner', text: message.text }
      : { role: 'tutor', text: message.response.tunisian }
  );
}

export interface UseConversationResult {
  status: ConversationStatus;
  messages: ConversationMessage[];
  vocabulary: GroundedVocabularyItem[];
  error: AiProviderError | null;
  sendMessage: (text: string) => void;
  retry: () => void;
}

/**
 * Drives one "Talk to a Tunisian" conversation: fetches the scenario's
 * grounded vocabulary and a light learner-progress hint, gets the tutor's
 * opening line, and thereafter sends the learner's messages through the
 * same AI provider (mock or live — see src/lib/ai/index.ts) while keeping
 * an in-memory turn history. Nothing here is persisted — conversation
 * history only needs to exist for the current session (see APP_OVERVIEW.md
 * for why permanent storage is deferred).
 */
export function useConversation(scenarioId: string, profileId: string, track: 'kid' | 'adult'): UseConversationResult {
  const [state, setState] = useState<ConversationState>({
    status: 'loading',
    messages: [],
    vocabulary: [],
    error: null,
  });

  // Async handlers need the latest messages/vocabulary without recreating
  // callbacks on every message — mirrored into a ref rather than closing
  // over stale state.
  const stateRef = useRef(state);
  stateRef.current = state;

  const learnerContextRef = useRef<LearnerContext | null>(null);
  const pendingLearnerMessageRef = useRef<string | null>(null);

  const requestReply = useCallback(
    async (learnerMessage: string | null) => {
      const scenario = findTalkScenario(scenarioId);
      if (!scenario || !learnerContextRef.current) {
        setState((s) => ({ ...s, status: 'error', error: { kind: 'invalid_response', message: 'Unknown scenario.' } }));
        return;
      }

      // RAG retrieval (live mode only — see supabase/functions/talk-to-a-tunisian)
      // embeds this to find relevant verified examples. For the opening line
      // there's no learner message yet, so fall back to what the scenario is
      // actually about.
      const retrievalQuery = learnerMessage?.trim() || `${scenario.title} ${scenario.description}`;

      const result = await aiProvider.generateReply({
        scenarioId,
        profileId,
        vocabulary: stateRef.current.vocabulary,
        learnerContext: learnerContextRef.current,
        history: toHistory(stateRef.current.messages),
        learnerMessage,
        retrievalQuery,
      });

      if (!result.ok) {
        setState((s) => ({ ...s, status: 'error', error: result.error }));
        return;
      }

      setState((s) => ({
        ...s,
        status: result.response.continueConversation ? 'ready' : 'finished',
        error: null,
        messages: [...s.messages, { id: nextMessageId(), role: 'tutor', response: result.response }],
      }));
    },
    [scenarioId, profileId]
  );

  const start = useCallback(async () => {
    setState({ status: 'loading', messages: [], vocabulary: [], error: null });
    pendingLearnerMessageRef.current = null;

    // Never fetch vocabulary/context or call the AI provider for a child
    // profile — this is a real network/cost boundary, not just a UI gate,
    // since the screen-level check alone would still let this hook fire the
    // request before its result is hidden.
    if (!canAccessTalkFeature(track)) {
      setState({
        status: 'error',
        messages: [],
        vocabulary: [],
        error: { kind: 'not_configured', message: 'This conversation is not available for this profile.' },
      });
      return;
    }

    try {
      const level = await fetchTalkLevel(profileId);
      const [vocabulary, learnerContext] = await Promise.all([
        fetchScenarioVocabulary(scenarioId),
        fetchLearnerContext(profileId, track, level),
      ]);
      learnerContextRef.current = learnerContext;
      setState((s) => ({ ...s, vocabulary }));
      await requestReply(null);
    } catch {
      setState((s) => ({
        ...s,
        status: 'error',
        error: { kind: 'network', message: "Couldn't load this conversation." },
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId, profileId, track]);

  useEffect(() => {
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId, profileId, track]);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || stateRef.current.status === 'sending' || stateRef.current.status === 'loading') return;
      pendingLearnerMessageRef.current = trimmed;
      setState((s) => ({
        ...s,
        status: 'sending',
        error: null,
        messages: [...s.messages, { id: nextMessageId(), role: 'learner', text: trimmed }],
      }));
      requestReply(trimmed);
    },
    [requestReply]
  );

  const retry = useCallback(() => {
    if (stateRef.current.messages.length === 0) {
      start();
      return;
    }
    setState((s) => ({ ...s, status: 'sending', error: null }));
    requestReply(pendingLearnerMessageRef.current);
  }, [start, requestReply]);

  return { status: state.status, messages: state.messages, vocabulary: state.vocabulary, error: state.error, sendMessage, retry };
}
