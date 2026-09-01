import { edgeFunctionAiProvider } from '@/lib/ai/edgeFunctionProvider';
import { mockAiProvider } from '@/lib/ai/mockProvider';
import type { AiProvider } from '@/lib/ai/types';

// EXPO_PUBLIC_TALK_AI_MODE only chooses which client-side wrapper to use —
// it never carries a secret, so it's safe to be a public env var. Defaults
// to mock so the feature works out of the box with no AI provider
// configured; set EXPO_PUBLIC_TALK_AI_MODE=live once a real key is set up
// (see supabase/functions/talk-to-a-tunisian/index.ts).
const mode = process.env.EXPO_PUBLIC_TALK_AI_MODE === 'live' ? 'live' : 'mock';

export const aiProvider: AiProvider = mode === 'live' ? edgeFunctionAiProvider : mockAiProvider;

export const isUsingMockAiProvider = mode === 'mock';

export type { AiProvider, AiProviderError, ConversationRequest, TutorResponse } from '@/lib/ai/types';
