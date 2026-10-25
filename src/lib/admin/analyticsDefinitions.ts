import type { AnalyticsOverview } from '@/data/admin/analytics';

/**
 * What each admin analytics number means — shown next to it in the UI so
 * nobody has to guess. Sections mirror the dashboard's planned structure
 * (Learners, Learning, Location, Revenue, Marketing); a section with no
 * reliable data source yet is listed as unavailable, with what it needs,
 * rather than shown as zero. Calculations live in 0014_admin_analytics.sql.
 */
export interface MetricDefinition {
  key: string;
  label: string;
  definition: string;
  value: (o: AnalyticsOverview) => number;
  /** All-time rather than for the selected period. */
  allTime?: boolean;
}

export interface MetricSection {
  title: string;
  metrics: MetricDefinition[];
}

export const ANALYTICS_SECTIONS: MetricSection[] = [
  {
    title: 'Learners',
    metrics: [
      {
        key: 'accountsTotal',
        label: 'Registered users',
        definition: 'All accounts that have signed up, as of the end of the period.',
        value: (o) => o.learners.accountsTotal,
        allTime: true,
      },
      {
        key: 'accountsNew',
        label: 'New sign-ups',
        definition: 'Accounts created during the period.',
        value: (o) => o.learners.accountsNew,
      },
      {
        key: 'profilesNew',
        label: 'New learner profiles',
        definition: 'Learner profiles created during the period (an account can hold several).',
        value: (o) => o.learners.profilesNew,
      },
      {
        key: 'activeLearners',
        label: 'Active learners',
        definition: "Learner profiles that did at least one lesson, review or Today's Practice session in the period.",
        value: (o) => o.learners.activeLearners,
      },
    ],
  },
  {
    title: 'Learning',
    metrics: [
      {
        key: 'sessions',
        label: 'Sessions',
        definition: "Lesson, review and Today's Practice sessions finished or left during the period.",
        value: (o) => o.learning.sessions,
      },
      {
        key: 'minutesLearned',
        label: 'Minutes learned',
        definition: 'Total time spent in those sessions.',
        value: (o) => o.learning.minutesLearned,
      },
      {
        key: 'wordsPracticed',
        label: 'Words practiced',
        definition: 'Learner–word pairs practiced during the period, each counted once.',
        value: (o) => o.learning.wordsPracticed,
      },
      {
        key: 'wordsMastered',
        label: 'Words mastered',
        definition: 'Learner–word pairs currently mastered (answered right 3+ times).',
        value: (o) => o.learning.wordsMasteredTotal,
        allTime: true,
      },
    ],
  },
];

export const ADMIN_EXCLUSION_NOTE = 'Admin accounts are excluded from every learner number.';

export interface UnavailableSection {
  title: string;
  reason: string;
}

/** Not shown as numbers: there is no trustworthy source for these yet. */
export const UNAVAILABLE_SECTIONS: UnavailableSection[] = [
  {
    title: 'Revenue',
    reason:
      'Premium is a manual flag and there is no billing provider yet. Needs verified purchase data (App Store / Google Play or a payment provider) recorded server-side.',
  },
  {
    title: 'Marketing',
    reason:
      'The app does not record where sign-ups come from. Needs consented campaign attribution (e.g. store install referrer or UTM links) — not collected today.',
  },
];
