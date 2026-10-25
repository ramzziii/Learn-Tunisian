import { supabase } from '@/lib/supabase/client';

/** Supported analytics periods, in whole UTC days (see 0014_admin_analytics.sql). */
export const ANALYTICS_PERIOD_DAYS = [7, 30, 90] as const;
export type AnalyticsPeriodDays = (typeof ANALYTICS_PERIOD_DAYS)[number];

export interface AnalyticsOverview {
  /** [start, end) in UTC; end is the next UTC midnight. */
  period: { start: string; end: string; days: number };
  learners: {
    accountsTotal: number;
    accountsNew: number;
    profilesTotal: number;
    profilesNew: number;
    activeLearners: number;
  };
  learning: { sessions: number; minutesLearned: number; wordsPracticed: number; wordsMasteredTotal: number };
  location: { minGroupSize: number; countries: { country: string; learners: number }[] };
}

/** The database refused: the caller isn't an admin (or the session expired). */
export class AnalyticsAccessDeniedError extends Error {}

function malformed(field: string): never {
  throw new Error(`Malformed analytics response: "${field}" is missing or invalid.`);
}

function count(data: Record<string, unknown>, field: string): number {
  const value = data[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) malformed(field);
  return value;
}

function text(data: Record<string, unknown>, field: string): string {
  const value = data[field];
  if (typeof value !== 'string' || value.length === 0) malformed(field);
  return value;
}

/**
 * Aggregate learner/learning analytics for the admin dashboard, from the
 * admin-only `admin_analytics_overview` database function — the only path
 * to cross-user data, and it returns counts only. Every field is validated:
 * anything missing or malformed is an error, never a stand-in zero.
 */
export async function fetchAnalyticsOverview(days: number): Promise<AnalyticsOverview> {
  if (!(ANALYTICS_PERIOD_DAYS as readonly number[]).includes(days)) {
    throw new Error(`Unsupported analytics period: ${days} days`);
  }

  const { data, error } = await supabase.rpc('admin_analytics_overview', { p_days: days });
  if (error) {
    if ((error as { code?: string }).code === '42501') throw new AnalyticsAccessDeniedError(error.message);
    throw error;
  }
  if (!data || typeof data !== 'object') malformed('response');
  const row = data as Record<string, unknown>;

  const countries = row.countries;
  if (!Array.isArray(countries)) malformed('countries');

  return {
    period: { start: text(row, 'period_start'), end: text(row, 'period_end'), days: count(row, 'period_days') },
    learners: {
      accountsTotal: count(row, 'accounts_total'),
      accountsNew: count(row, 'accounts_new'),
      profilesTotal: count(row, 'learner_profiles_total'),
      profilesNew: count(row, 'learner_profiles_new'),
      activeLearners: count(row, 'active_learners'),
    },
    learning: {
      sessions: count(row, 'sessions_count'),
      minutesLearned: count(row, 'minutes_learned'),
      wordsPracticed: count(row, 'words_practiced'),
      wordsMasteredTotal: count(row, 'words_mastered_total'),
    },
    location: {
      minGroupSize: count(row, 'country_min_group_size'),
      countries: countries.map((entry, i) => {
        if (!entry || typeof entry !== 'object') malformed(`countries[${i}]`);
        const c = entry as Record<string, unknown>;
        return { country: text(c, 'country'), learners: count(c, 'learners') };
      }),
    },
  };
}
