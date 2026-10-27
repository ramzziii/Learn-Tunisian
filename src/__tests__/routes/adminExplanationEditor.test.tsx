// Admin content editor: each word form has two separately labelled
// recorders — the pronunciation, and an optional explanation — saved to
// different columns, with Repeat After Me only on the pronunciation.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockSetInclusion = jest.fn();
const mockCreateVariant = jest.fn();
const mockUpdateVariant = jest.fn();

const variant = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  wordGroupId: 'g1',
  variantLabel: 'primary',
  wordArabic: 'عسلامة',
  transliteration: '3aslema',
  audioPath: 'g1/v-1000.m4a',
  explanationAudioPath: null,
  notes: null,
  sortOrder: 0,
  nativeVerified: false,
  contentStatus: 'approved',
  createdBy: null,
  updatedBy: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  speakerName: null,
  dialectNotes: null,
  isNativeVoice: false,
  inRepeatAfterMe: false,
  approvedBy: null,
  approvedAt: null,
  ...overrides,
});

let mockGroup: Record<string, unknown>;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ wordGroupId: 'g1' }),
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'admin-1' } } }) }));
jest.mock('@/data/admin/content', () => ({
  getWordGroupAdmin: jest.fn(async () => mockGroup),
  createWordVariant: (...a: unknown[]) => mockCreateVariant(...a),
  updateWordVariant: (...a: unknown[]) => mockUpdateVariant(...a),
  deleteWordVariant: jest.fn(),
  updateWordGroup: jest.fn(),
}));
jest.mock('@/data/repeatAfterMe', () => ({ setRepeatAfterMeInclusion: (...a: unknown[]) => mockSetInclusion(...a) }));
// The recorder itself is tested on its own; this stub just exposes its props.
jest.mock('@/components/admin/AudioRecorderField', () => ({
  AudioRecorderField: ({
    wordGroupId,
    variantId,
    currentAudioPath,
    repeatAfterMe,
    onUploaded,
  }: {
    wordGroupId: string;
    variantId: string;
    currentAudioPath: string | null;
    repeatAfterMe?: unknown;
    onUploaded: (path: string) => Promise<string | null>;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text, Pressable } = require('react-native');
    return (
      <>
        <Text>{`Recorder ${variantId} current=${currentAudioPath} ram=${!!repeatAfterMe}`}</Text>
        <Pressable onPress={() => onUploaded(`${wordGroupId}/${variantId}-5.m4a`).catch(() => {})}>
          <Text>{`Save ${variantId}`}</Text>
        </Pressable>
      </>
    );
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdminWordGroupDetail = require('../../../app/admin/word-groups/[wordGroupId]').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const renderScreen = () =>
  render(
    <ThemeProvider>
      <AdminWordGroupDetail />
    </ThemeProvider>
  );

beforeEach(() => {
  mockGroup = {
    id: 'g1',
    unitId: 'u1',
    lessonNumber: 1,
    englishMeaning: 'hello',
    imageKeyword: null,
    imagePath: null,
    sortOrder: 0,
    contentStatus: 'approved',
    createdBy: null,
    updatedBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    variants: [variant('v1')],
  };
  mockSetInclusion.mockReset().mockImplementation(async (id: string, include: boolean) => variant(id, { inRepeatAfterMe: include }));
  mockCreateVariant.mockReset();
  mockUpdateVariant.mockReset().mockImplementation(async (id: string, patch: Record<string, unknown>) => variant(id, patch));
});

it('shows two clearly labelled recorders per form: pronunciation (with Repeat After Me) and explanation (without)', async () => {
  mockGroup.variants = [variant('v1', { explanationAudioPath: 'g1/v1-explanation-1.m4a' })];
  await renderScreen();

  expect(await screen.findByText('Pronunciation recording')).toBeOnTheScreen();
  expect(screen.getByText(/Explanation recording \(optional\)/)).toBeOnTheScreen();
  expect(screen.getByText('Recorder v1 current=g1/v-1000.m4a ram=true')).toBeOnTheScreen();
  expect(screen.getByText('Recorder v1-explanation current=g1/v1-explanation-1.m4a ram=false')).toBeOnTheScreen();
});

it('saving an explanation writes only the explanation column — never the pronunciation', async () => {
  await renderScreen();

  await fireEvent.press(await screen.findByText('Save v1-explanation'));

  expect(mockUpdateVariant).toHaveBeenCalledWith('v1', { explanationAudioPath: 'g1/v1-explanation-5.m4a' }, 'admin-1');
  expect(mockUpdateVariant.mock.calls[0][1]).not.toHaveProperty('audioPath');
});

it('saving a pronunciation writes only the pronunciation column, as before', async () => {
  await renderScreen();

  await fireEvent.press(await screen.findByText('Save v1'));

  expect(mockUpdateVariant).toHaveBeenCalledWith('v1', { audioPath: 'g1/v1-5.m4a' }, 'admin-1');
});

it('a form with no explanation yet says so', async () => {
  await renderScreen();
  expect(await screen.findByText(/No explanation yet/)).toBeOnTheScreen();
  expect(screen.getByText('Recorder v1-explanation current=null ram=false')).toBeOnTheScreen();
});
