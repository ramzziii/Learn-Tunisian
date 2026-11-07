// Admin, organised in 5 tabs by the job at hand:
// - Today: the pipeline (waiting for review → live → with native audio) and
//   "Needs you now" (most urgent first; AI corrections only for reviewers);
//   "All caught up" when nothing waits; a failed load says so (never zeros);
//   the "View app as Premium" switch;
// - Requests: translation requests, without a back button inside the tab;
// - Review: words waiting for review, plus AI corrections for reviewers only;
// - Audio: one recording studio — To record / Skipped / Explanations;
// - Content: search every word and phrase, course units and Phrasebook
//   categories listed separately, and the reports.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockSetPreview = jest.fn();
let mockIsReviewer = true;
const mockMetrics = jest.fn();
const mockRequests = jest.fn();
const mockProgress = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), canGoBack: () => true },
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));
jest.mock('@/lib/premium/PremiumContext', () => ({
  usePremium: () => ({ adminPreview: 'premium', setAdminPreview: (...a: unknown[]) => mockSetPreview(...a) }),
}));
jest.mock('@/data/reviewers', () => ({ fetchIsReviewer: jest.fn(async () => mockIsReviewer) }));
jest.mock('@/data/admin/metrics', () => ({ fetchAdminMetrics: (...a: unknown[]) => mockMetrics(...a) }));
jest.mock('@/data/admin/translationRequests', () => ({ listOpenTranslationRequests: (...a: unknown[]) => mockRequests(...a) }));
jest.mock('@/data/admin/contentProgress', () => ({ fetchContentProgress: (...a: unknown[]) => mockProgress(...a) }));
jest.mock('@/data/admin/content', () => ({
  listWordGroupsNeedingReview: jest.fn(async () => []),
  listUnitsAdmin: jest.fn(async () => [
    { id: 'u1', name: 'Greetings & Politeness', sortOrder: 1, isCurriculum: true },
    { id: 'pb', name: 'Shopping', sortOrder: 107, isCurriculum: false },
  ]),
}));
jest.mock('@/data/admin/phraseWords', () => ({
  fetchLinkCandidatesAdmin: jest.fn(async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { makeGroup, makeVariant } = require('@/test-utils/wordGroupFixtures');
    return [makeGroup('door', { englishMeaning: 'Door', variants: [makeVariant('door', { wordArabic: 'باب', transliteration: 'beb' })] })];
  }),
}));
jest.mock('@/components/admin/AnalyticsOverview', () => ({ AnalyticsOverview: () => null }));
jest.mock('../../../app/admin/recordings', () => {
  // Like the real screens: the shared top (the tab's switcher), then the content.
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { Text } = require('react-native');
  const { AdminScreenTop } = require('@/components/admin/AdminScreenTop');
  /* eslint-enable @typescript-eslint/no-var-requires */
  return {
    __esModule: true,
    default: () => (
      <>
        <AdminScreenTop />
        <Text>[words to record]</Text>
      </>
    ),
  };
});
jest.mock('../../../app/admin/recordings-skipped', () => {
  // Like the real screens: the shared top (the tab's switcher), then the content.
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { Text } = require('react-native');
  const { AdminScreenTop } = require('@/components/admin/AdminScreenTop');
  /* eslint-enable @typescript-eslint/no-var-requires */
  return {
    __esModule: true,
    default: () => (
      <>
        <AdminScreenTop />
        <Text>[skipped]</Text>
      </>
    ),
  };
});
jest.mock('../../../app/admin/recordings-explanations', () => {
  // Like the real screens: the shared top (the tab's switcher), then the content.
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { Text } = require('react-native');
  const { AdminScreenTop } = require('@/components/admin/AdminScreenTop');
  /* eslint-enable @typescript-eslint/no-var-requires */
  return {
    __esModule: true,
    default: () => (
      <>
        <AdminScreenTop />
        <Text>[explanations]</Text>
      </>
    ),
  };
});

jest.mock('../../../app/admin/recordings-recheck', () => {
  // Like the real screens: the shared top (the tab's switcher), then the content.
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { Text } = require('react-native');
  const { AdminScreenTop } = require('@/components/admin/AdminScreenTop');
  /* eslint-enable @typescript-eslint/no-var-requires */
  return {
    __esModule: true,
    default: () => (
      <>
        <AdminScreenTop />
        <Text>[re-check]</Text>
      </>
    ),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');
const themed = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);
/* eslint-disable @typescript-eslint/no-var-requires */
const Today = require('../../../app/admin/(tabs)/index').default;
const Requests = require('../../../app/admin/(tabs)/requests').default;
const Review = require('../../../app/admin/(tabs)/review').default;
const Audio = require('../../../app/admin/(tabs)/audio').default;
const Content = require('../../../app/admin/(tabs)/content').default;
const { ContentProgressSection } = require('@/components/admin/ContentProgressSection');
/* eslint-enable @typescript-eslint/no-var-requires */

const metrics = (draft: number, pending: number, approved: number, corrections = 0) => ({
  unitCount: 2, lessonCount: 3, wordGroupCount: draft + pending + approved, wordVariantCount: 0,
  wordGroupsByStatus: { draft, pending_review: pending, approved, rejected: 0, archived: 0 },
  pendingCorrectionsCount: corrections,
});
const progress = (needsRecording = 0, withNativeAudio = 0) => ({
  overall: { words: 300, approved: 150, withNativeAudio, awaitingReview: 140 },
  units: [
    { unitId: 'u1', name: 'Greetings & Politeness', isPhrasebook: false, words: 28, approved: 14, withNativeAudio: 7, awaitingReview: 14 },
    { unitId: 'pb', name: 'Shopping', isPhrasebook: true, words: 10, approved: 10, withNativeAudio: 0, awaitingReview: 0 },
  ],
  needsRecording: Array.from({ length: needsRecording }, (_, i) => ({
    variantId: `v${i}`, wordGroupId: `w${i}`, variantLabel: 'primary', englishMeaning: `Word ${i}`, unitName: 'Greetings & Politeness',
  })),
});
const request = (overdue: boolean) => ({
  id: overdue ? 'r-late' : 'r-ok', englishText: 'How do I say…', status: 'submitted', submittedAt: '2026-10-01T00:00:00Z',
  dueAt: overdue ? '2020-01-01T00:00:00Z' : '2999-01-01T00:00:00Z',
});

beforeEach(() => {
  mockPush.mockReset();
  mockSetPreview.mockReset();
  mockIsReviewer = true;
  mockMetrics.mockReset().mockResolvedValue(metrics(280, 3, 50, 2));
  mockRequests.mockReset().mockResolvedValue([request(true), request(false)]);
  mockProgress.mockReset().mockResolvedValue(progress(41, 12));
});

describe('Today', () => {
  it('the pipeline: waiting for review → live → with native audio, each opening its tab', async () => {
    await themed(<Today />);
    await fireEvent.press(await screen.findByRole('button', { name: '283 Waiting for review' }));
    expect(mockPush).toHaveBeenLastCalledWith('/admin/review');
    await fireEvent.press(screen.getByRole('button', { name: '50 Live' }));
    expect(mockPush).toHaveBeenLastCalledWith('/admin/content');
    await fireEvent.press(screen.getByRole('button', { name: '12 With native audio' }));
    expect(mockPush).toHaveBeenLastCalledWith('/admin/audio');
  });

  it('needs you now: most urgent first, each opening the right place', async () => {
    await themed(<Today />);
    await screen.findByText('Needs you now');
    const tasks = screen
      .getAllByRole('button')
      .map((b) => b.props.accessibilityLabel as string | undefined)
      .filter((l): l is string => !!l && l.includes('. '));
    expect(tasks).toEqual([
      '2 translation requests. 1 overdue',
      '283 words waiting for review. Approve, fix or reject each one',
      '2 AI corrections to check. From learners’ conversations',
      '41 live forms need a native recording. Record them in Audio',
    ]);
    await fireEvent.press(screen.getByRole('button', { name: /^2 translation requests/ }));
    expect(mockPush).toHaveBeenCalledWith('/admin/requests');
    expect(screen.getByText('Admin · Language reviewer')).toBeOnTheScreen();
  });

  it('a non-reviewer admin never sees AI corrections', async () => {
    mockIsReviewer = false;
    await themed(<Today />);
    await screen.findByText('Needs you now');
    expect(screen.queryByText(/AI correction/)).toBeNull();
  });

  it('nothing waiting: "All caught up"', async () => {
    mockMetrics.mockResolvedValue(metrics(0, 0, 50));
    mockRequests.mockResolvedValue([]);
    mockProgress.mockResolvedValue(progress(0, 50));
    await themed(<Today />);
    expect(await screen.findByText('All caught up 🎉')).toBeOnTheScreen();
  });

  it('a failed load says so — never zeros — and can be retried', async () => {
    mockRequests.mockRejectedValueOnce(new Error('network'));
    await themed(<Today />);
    expect(await screen.findByText("Couldn't load today's work.")).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Waiting for review/ })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Needs you now')).toBeOnTheScreen();
  });

  it('the "View app as Premium" switch is here too', async () => {
    await themed(<Today />);
    await fireEvent(await screen.findByLabelText('View app as Premium'), 'valueChange', false);
    expect(mockSetPreview).toHaveBeenCalledWith('free');
  });
});

describe('Requests', () => {
  it('shows the translation requests, with no back button inside the tab', async () => {
    await themed(<Requests />);
    expect(await screen.findByText('Translation requests')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Go back' })).toBeNull();
  });
});

describe('Review', () => {
  it('words waiting for review, plus AI corrections for reviewers', async () => {
    await themed(<Review />);
    expect(await screen.findByText('Waiting for review')).toBeOnTheScreen();
    await fireEvent.press(await screen.findByRole('button', { name: 'AI corrections to check' }));
    expect(mockPush).toHaveBeenCalledWith('/admin/corrections');
    await fireEvent.press(screen.getByRole('button', { name: 'Review one at a time' }));
    expect(mockPush).toHaveBeenCalledWith('/admin/review-session');
  });

  it('no "Review one at a time" or AI corrections for an admin who isn’t a reviewer', async () => {
    mockIsReviewer = false;
    await themed(<Review />);
    await screen.findByText('Waiting for review');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'AI corrections to check' })).toBeNull());
    expect(screen.queryByRole('button', { name: 'Review one at a time' })).toBeNull();
  });
});

describe('Audio', () => {
  it('one studio: To record, Skipped, Explain, Re-check', async () => {
    await themed(<Audio />);
    expect(screen.getByText('[words to record]')).toBeOnTheScreen();
    expect(screen.getAllByRole('tab').map((t) => t.props.accessibilityState.selected)).toEqual([true, false, false, false]);
    await fireEvent.press(screen.getByRole('tab', { name: 'Skipped' }));
    expect(screen.getByText('[skipped]')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Explain' }));
    expect(screen.getByText('[explanations]')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Re-check' }));
    expect(screen.getByText('[re-check]')).toBeOnTheScreen();
  });
});

describe('Content', () => {
  it('course units and Phrasebook categories listed separately', async () => {
    await themed(<Content />);
    expect(await screen.findByText('Course units')).toBeOnTheScreen();
    expect(screen.getByText('Phrasebook categories')).toBeOnTheScreen();
    await fireEvent.press(screen.getAllByText('Shopping')[0]);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/admin/units/[unitId]', params: { unitId: 'pb' } });
  });

  it('search every word and phrase, then open one', async () => {
    await themed(<Content />);
    await screen.findByText('Course units');
    await fireEvent.changeText(screen.getByLabelText('Search all words and phrases'), 'beb');
    await fireEvent.press(await screen.findByRole('button', { name: 'Open Door' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/admin/word-groups/[wordGroupId]', params: { wordGroupId: 'door' } });
  });
});

describe('Content progress (in Content → reports)', () => {
  it('catalog tiles, then course units and Phrasebook with native-audio bars; tap a unit to open it', async () => {
    await themed(<ContentProgressSection />);
    expect(await screen.findByText('300')).toBeOnTheScreen();
    expect(screen.getByText('Words')).toBeOnTheScreen();
    expect(screen.getByText('50%')).toBeOnTheScreen(); // live
    expect(screen.getByText('140')).toBeOnTheScreen(); // waiting for review
    expect(screen.getByText('By course unit')).toBeOnTheScreen();
    expect(screen.getByText('By Phrasebook category')).toBeOnTheScreen();
    expect(screen.getByText('25% native audio')).toBeOnTheScreen();
    expect(screen.getByText('14 waiting for review')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Shopping: 10 words, 100% live, 0% with native audio, 0 waiting for review'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/admin/units/[unitId]', params: { unitId: 'pb' } });
  });

  it('the first forms that need a recording, the rest counted, with a way into Audio', async () => {
    mockProgress.mockResolvedValue(progress(7));
    await themed(<ContentProgressSection />);
    expect(await screen.findByText('Needs recording · 7')).toBeOnTheScreen();
    expect(screen.getByText('Word 4')).toBeOnTheScreen();
    expect(screen.queryByText('Word 5')).toBeNull();
    expect(screen.getByText('+ 2 more')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('🎙 Record them in Audio'));
    expect(mockPush).toHaveBeenCalledWith('/admin/audio');
  });

  it('a failed load says so', async () => {
    mockProgress.mockRejectedValue(new Error('network'));
    await themed(<ContentProgressSection />);
    expect(await screen.findByText(/Couldn.t load content progress/)).toBeOnTheScreen();
  });
});
