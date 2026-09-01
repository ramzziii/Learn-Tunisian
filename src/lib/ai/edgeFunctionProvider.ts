import { buildSystemPrompt } from '@/lib/ai/buildSystemPrompt';
import { validateTutorResponse } from '@/lib/ai/validateTutorResponse';
import { supabase } from '@/lib/supabase/client';
import { findTalkScenario } from '@/constants/talkScenarios';
import type { AiProvider, AiProviderError, ConversationRequest } from '@/lib/ai/types';

const FUNCTION_NAME = 'talk-to-a-tunisian';

/**
 * Calls the talk-to-a-tunisian Supabase Edge Function — the only path that
 * ever reaches a real AI provider. The system prompt is built here
 * client-side (via the same buildSystemPrompt used by the mock provider,
 * and unit-tested independently of any network call) and sent as plain
 * text; the Edge Function is a thin proxy that holds the actual API key.
 *
 * This has not been exercised against a live AI provider in this
 * environment — it needs an AI_API_KEY secret configured on the deployed
 * function first (see supabase/functions/talk-to-a-tunisian/index.ts).
 */
export const edgeFunctionAiProvider: AiProvider = {
  async generateReply(request: ConversationRequest) {
    const scenario = findTalkScenario(request.scenarioId);
    if (!scenario) {
      return { ok: false, error: { kind: 'invalid_response', message: `Unknown scenario "${request.scenarioId}"` } };
    }

    const systemPrompt = buildSystemPrompt(
      scenario,
      request.learnerContext.level,
      request.vocabulary,
      request.learnerContext
    );

    let invokeResult;
    try {
      invokeResult = await supabase.functions.invoke(FUNCTION_NAME, {
        body: { systemPrompt, history: request.history, learnerMessage: request.learnerMessage },
      });
    } catch {
      return { ok: false, error: { kind: 'network', message: 'Could not reach the conversation service.' } };
    }

    const { data, error } = invokeResult;
    if (error) {
      return { ok: false, error: mapInvokeError(error) };
    }
    if (data?.error) {
      return { ok: false, error: { kind: data.error.kind ?? 'provider_error', message: data.error.message } };
    }
    if (typeof data?.raw !== 'string') {
      return { ok: false, error: { kind: 'invalid_response', message: 'The AI response was empty.' } };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data.raw);
    } catch {
      return { ok: false, error: { kind: 'invalid_response', message: 'The AI response was not valid JSON.' } };
    }

    const validated = validateTutorResponse(parsed);
    if (!validated) {
      return { ok: false, error: { kind: 'invalid_response', message: "The AI response didn't match the expected shape." } };
    }

    return { ok: true, response: validated };
  },
};

function mapInvokeError(error: unknown): AiProviderError {
  const message = error instanceof Error ? error.message : 'The conversation service failed.';
  if (/rate.?limit/i.test(message)) return { kind: 'rate_limited', message };
  if (/timeout|timed out/i.test(message)) return { kind: 'timeout', message };
  return { kind: 'provider_error', message };
}
