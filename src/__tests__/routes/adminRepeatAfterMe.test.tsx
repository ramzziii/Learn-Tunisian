// Admin word-group screen wiring for Repeat After Me: an "Add recording"
// action right after adding content, and the recorder's opt-in/opt-out
// being persisted (or not written at all when nothing changes).
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockSetInclusion = jest.fn();
const mockCreateVariant = jest.fn();

const variant = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  wordGroupId: 'g1',
  variantLabel: 'primary',
  wordArabic: 'عسلامة',
  transliteration: '3aslema',
  audioPath: 'g1/v-1000.m4a',
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
  updateWordVariant: jest.fn(),
  deleteWordVariant: jest.fn(),
  updateWordGroup: jest.fn(),
}));
jest.mock('@/data/repeatAfterMe', () => ({ setRepeatAfterMeInclusion: (...a: unknown[]) => mockSetInclusion(...a) }));
// The recorder itself is tested on its own; this stub just exposes its props.
jest.mock('@/components/admin/AudioRecorderField', () => ({
  AudioRecorderField: ({
    variantId,
    repeatAfterMe,
  }: {
    variantId: string;
    repeatAfterMe?: { isIncluded: boolean; onDecide: (include: boolean) => Promise<void> };
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text, Pressable } = require('react-native');
    return (
      <>
        <Text>{`Recorder ${variantId} asks=${!!repeatAfterMe} included=${repeatAfterMe?.isIncluded}`}</Text>
        <Pressable onPress={() => repeatAfterMe?.onDecide(true).catch(() => {})}>
          <Text>{`Opt in ${variantId}`}</Text>
        </Pressable>
        <Pressable onPress={() => repeatAfterMe?.onDecide(false).catch(() => {})}>
          <Text>{`Opt out ${variantId}`}</Text>
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
});

it('every variant recorder asks the Repeat After Me question', async () => {
  await renderScreen();
  expect(await screen.findByText('Recorder v1 asks=true included=false')).toBeOnTheScreen();
});

it('opting in persists it for that variant as this admin, and the row reflects it', async () => {
  await renderScreen();

  await fireEvent.press(await screen.findByText('Opt in v1'));

  expect(mockSetInclusion).toHaveBeenCalledWith('v1', true, 'admin-1');
  expect(await screen.findByText('Recorder v1 asks=true included=true')).toBeOnTheScreen();
});

it('declining a recording that is not included writes nothing (already out)', async () => {
  await renderScreen();

  await fireEvent.press(await screen.findByText('Opt out v1'));

  expect(mockSetInclusion).not.toHaveBeenCalled();
});

it('declining a recording that was included removes it', async () => {
  mockGroup.variants = [variant('v1', { inRepeatAfterMe: true })];
  await renderScreen();

  await fireEvent.press(await screen.findByText('Opt out v1'));

  expect(mockSetInclusion).toHaveBeenCalledWith('v1', false, 'admin-1');
});

it('after adding a variant, offers "Add recording" for it right in the add flow', async () => {
  mockCreateVariant.mockResolvedValue(variant('v2', { audioPath: null, variantLabel: 'also_heard' }));
  await renderScreen();

  await fireEvent.changeText((await screen.findAllByPlaceholderText('Arabic'))[0], 'مرحبا');
  await fireEvent.changeText(screen.getAllByPlaceholderText('Transliteration')[0], 'mar7ba');
  await fireEvent.press(screen.getByText('+ Add Variant'));

  await fireEvent.press(await screen.findByText('Add recording'));
  expect((await screen.findAllByText('Recorder v2 asks=true included=false')).length).toBeGreaterThan(0);
});
