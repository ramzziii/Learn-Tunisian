import type { DailyGoalMinutes } from '@/types/models';

/**
 * The daily goal choices, shared by onboarding and Profile: exactly the
 * values daily_goal_settings.daily_goal_minutes allows (0001_init.sql). The
 * goal is a target, not a limit — any session can be extended with "Add
 * more time" without changing it.
 */
export const DAILY_GOAL_OPTIONS: readonly DailyGoalMinutes[] = [5, 10, 15];

export function isDailyGoalMinutes(value: unknown): value is DailyGoalMinutes {
  return typeof value === 'number' && (DAILY_GOAL_OPTIONS as readonly number[]).includes(value);
}
