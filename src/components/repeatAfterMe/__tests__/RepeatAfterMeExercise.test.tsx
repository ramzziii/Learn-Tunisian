// One Repeat After Me item: the shared record → check → compare flow
// (tested in PronunciationPractice.test.tsx) against the admin's own
// recording — never the generated voice.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPracticeProps = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('@/components/pronunciation/PronunciationPractice', () => ({
  PRONUNCIATION_MAX_ATTEMPTS: 3,
  PronunciationPractice: (props: { onFinish: (r: { correct: boolean; attempts: number }) => void; children?: unknown }) => {
    mockPracticeProps(props);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text, Pressable } = require('react-native');
    return (
      <>
        {props.children as never}
        <Pressable onPress={() => props.onFinish({ correct: false, attempts: 3 })}>
          <Text>Finish: missed</Text>
        </Pressable>
      </>
    );
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RepeatAfterMeExercise } = require('@/components/repeatAfterMe/RepeatAfterMeExercise');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const item = {
  id: 'v1',
  wordGroupId: 'g1',
  englishMeaning: 'hello',
  variant: { id: 'v1', wordArabic: 'عسلامة', transliteration: '3aslema', audioPath: 'g1/v1-1000.m4a' },
};

async function renderExercise(props: Record<string, unknown> = {}) {
  const onFinish = jest.fn();
  await render(
    <ThemeProvider>
      <RepeatAfterMeExercise item={item} maxAttempts={3} isReview={false} onFinish={onFinish} {...props} />
    </ThemeProvider>
  );
  return { onFinish };
}

beforeEach(() => mockPracticeProps.mockClear());

it("checks against the admin's recording, with no generated-voice fallback", async () => {
  await renderExercise();

  expect(mockPracticeProps).toHaveBeenCalledWith(
    expect.objectContaining({
      nativeVariant: item.variant,
      matchGroup: { id: 'g1', variants: [item.variant] },
      maxAttempts: 3,
      allowFallbackVoice: false,
    })
  );
  expect(screen.getByText('hello')).toBeOnTheScreen();
  expect(screen.getByText('3aslema')).toBeOnTheScreen();
});

it('reports the item’s result to the session', async () => {
  const { onFinish } = await renderExercise();

  await fireEvent.press(screen.getByText('Finish: missed'));

  expect(onFinish).toHaveBeenCalledWith({ correct: false, attempts: 3 });
});

it('the review pass is a single try that promises review later, not another revisit', async () => {
  await renderExercise({ isReview: true, maxAttempts: 1 });

  expect(screen.getByText('Review — one more try')).toBeOnTheScreen();
  expect(mockPracticeProps).toHaveBeenCalledWith(
    expect.objectContaining({ maxAttempts: 1, outOfTriesMessage: expect.stringMatching(/come up again/) })
  );
});
