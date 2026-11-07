import { supabase } from '@/lib/supabase/client';

/** The most a note can hold (0029 checks the same). */
export const FEEDBACK_MAX_LENGTH = 2000;

/**
 * Profile → Send feedback (0029 app_feedback): a short note from a signed-in
 * learner, with the screen it came from and the app version — nothing else
 * about the device. Guests can't send (device-only). The text is never
 * logged or sent anywhere else.
 */
export async function sendFeedback(input: { accountId: string; message: string; screen?: string | null; appVersion?: string | null }) {
  const message = input.message.trim();
  if (message.length === 0) throw new Error('empty_feedback');
  const { error } = await supabase.from('app_feedback').insert({
    account_id: input.accountId,
    message: message.slice(0, FEEDBACK_MAX_LENGTH),
    screen: input.screen?.slice(0, 100) ?? null,
    app_version: input.appVersion?.slice(0, 40) ?? null,
  });
  if (error) throw error;
}

/** Plain words for a refused note. */
export function feedbackErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? '');
  if (message.includes('feedback_limit')) return 'You’ve sent a lot of notes today — thank you! Please try again tomorrow.';
  if (message.includes('empty_feedback')) return 'Write something first.';
  return 'Couldn’t send it — check your connection and try again.';
}
