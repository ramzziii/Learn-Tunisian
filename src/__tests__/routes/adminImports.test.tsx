// Admin → Imports: the content import log (0028) — what changed, the
// problems of refused/failed runs by sheet row, and "Mark as seen".
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockFetch = jest.fn();
const mockAck = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: () => true } }));
jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));
jest.mock('@/data/admin/importRuns', () => ({
  ...jest.requireActual('@/data/admin/importRuns'),
  fetchImportRuns: (...a: unknown[]) => mockFetch(...a),
  acknowledgeImportRun: (...a: unknown[]) => mockAck(...a),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Imports = require('../../../app/admin/imports').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { summaryLine } = jest.requireActual('@/data/admin/importRuns');

const run = (id: string, outcome: string, extra: Record<string, unknown> = {}) => ({
  id, startedAt: '2026-11-07T10:00:00Z', sourceFile: `${id}.csv`, outcome, rowsRead: 40,
  summary: {}, problems: [], acknowledgedAt: null, ...extra,
});
const renderImports = () => render(<ThemeProvider><Imports /></ThemeProvider>);

beforeEach(() => {
  mockAck.mockReset().mockResolvedValue(undefined);
  mockFetch.mockReset().mockResolvedValue([
    run('bad', 'refused', { problems: [{ rows: [12, 13], message: 'duplicate word id' }] }),
    run('good', 'imported', { summary: { new_words: 12, changed_forms: 3, unchanged_words: 20 } }),
  ]);
});

it('summaryLine shows only the counts that changed', () => {
  expect(summaryLine({ new_words: 12, changed_forms: 3, unchanged_words: 20 })).toBe('12 new words · 3 changed forms');
  expect(summaryLine({})).toBe('No changes');
});

it('lists runs: a refused one with its problems by row, an imported one with what changed', async () => {
  await renderImports();
  expect(await screen.findByText('⛔ Refused — nothing written')).toBeOnTheScreen();
  expect(screen.getByText('Row 12, 13: duplicate word id')).toBeOnTheScreen();
  expect(screen.getByText('12 new words · 3 changed forms')).toBeOnTheScreen();
});

it('"Mark as seen" acknowledges a refused run', async () => {
  await renderImports();
  await fireEvent.press(await screen.findByText('Mark as seen'));
  expect(mockAck).toHaveBeenCalledWith('bad');
  expect(await screen.findByText('Seen')).toBeOnTheScreen();
  expect(screen.queryByText('Mark as seen')).toBeNull();
});
