// Deep link / direct navigation to /lesson/[lessonId]: a free profile must
// get the Premium gate *instead of* a session for a locked lesson, and the
// normal session for a free one. Real access guard + real route component;
// only Supabase, the router, and the session engine itself are faked.
import { render, screen } from '@testing-library/react-native';

import { createFakeSupabase } from '@/test-utils/fakeSupabase';

const mockDb = createFakeSupabase();
let mockLessonId = 'lesson-1';
let mockIsPremium = false;

jest.mock('@/lib/supabase/client', () => ({ supabase: mockDb.client }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ lessonId: mockLessonId }),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
// Stable identity per entitlement, like the real context — a fresh object
// every render would re-trigger the route's [activeProfile] effect forever.
const mockProfiles = {
  free: { id: 'p1', track: 'adult', isPremium: false },
  premium: { id: 'p1', track: 'adult', isPremium: true },
};
jest.mock('@/lib/account/ActiveProfileContext', () => ({
  useActiveProfile: () => ({ activeProfile: mockIsPremium ? mockProfiles.premium : mockProfiles.free }),
}));
jest.mock('@/lib/offline/audioCache', () => ({ prefetchLessonAudio: jest.fn() }));
jest.mock('@/components/session/SessionRunner', () => ({
  SessionRunner: ({ groups }: { groups: unknown[] }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text: RNText } = require('react-native');
    return <RNText>{`Session started with ${groups.length} words`}</RNText>;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const LessonSession = require('../../../app/lesson/[lessonId]').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

beforeEach(() => {
  mockDb.reset();
  mockDb.respond('units.select', {
    data: [
      { id: 'u1', sort_order: 1, is_curriculum: true },
      { id: 'pb-greetings', sort_order: 100, is_curriculum: false },
    ],
    error: null,
  });
  mockDb.respond('lessons.select', {
    data: [
      { id: 'lesson-1', unit_id: 'u1', sort_order: 1, lesson_number: 1 },
      { id: 'lesson-2', unit_id: 'u1', sort_order: 2, lesson_number: 2 },
    ],
    error: null,
  });
  mockDb.respond('word_groups.select', { data: [], error: null });
  mockDb.respond('word_variants.select', { data: [], error: null });
  mockDb.respond('daily_goal_settings.select', { data: null, error: null });
});

const renderRoute = () =>
  render(
    <ThemeProvider>
      <LessonSession />
    </ThemeProvider>
  );

it('free profile opening a locked lesson by URL sees the Premium gate, and no session starts', async () => {
  mockLessonId = 'lesson-2';
  mockIsPremium = false;

  await renderRoute();

  expect(await screen.findByText('This lesson is part of Premium')).toBeOnTheScreen();
  expect(screen.getByText('See Premium plans')).toBeOnTheScreen();
  expect(screen.queryByText(/Session started/)).toBeNull();
  // The locked lesson's words were never requested.
  expect(mockDb.queries.some((q) => q.table === 'word_groups')).toBe(false);
});

it('free profile opening the free first lesson gets the normal session', async () => {
  mockLessonId = 'lesson-1';
  mockIsPremium = false;

  await renderRoute();

  expect(await screen.findByText(/Session started/)).toBeOnTheScreen();
  expect(screen.queryByText('This lesson is part of Premium')).toBeNull();
});

it('Premium profile opens any lesson directly', async () => {
  mockLessonId = 'lesson-2';
  mockIsPremium = true;

  await renderRoute();

  expect(await screen.findByText(/Session started/)).toBeOnTheScreen();
});
