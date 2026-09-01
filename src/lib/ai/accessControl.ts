import type { Track } from '@/types/models';

/**
 * "Talk to a Tunisian" is adult/teen only for now — a child profile must
 * never reach the general AI conversation feature, whether via the Home
 * entry point (hidden entirely) or a direct/stale deep link to /talk (this
 * is the check both app/talk/index.tsx and app/talk/[scenarioId].tsx use
 * for that second, defense-in-depth case).
 */
export function canAccessTalkFeature(track: Track): boolean {
  return track === 'adult';
}
