// The result pop-up after a reading/typing/listen answer.
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AnswerFeedback, ANSWER_AUTO_ADVANCE_SECONDS } = require('@/components/exercises/shared/AnswerFeedback');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const renderFeedback = (props: Record<string, unknown>) =>
  render(
    <ThemeProvider>
      <AnswerFeedback onNext={jest.fn()} {...props} />
    </ThemeProvider>
  );

it('counts down from 3', () => {
  expect(ANSWER_AUTO_ADVANCE_SECONDS).toBe(3);
});

it('right answer: a "Great job" pop-up with Next and a countdown from 3', async () => {
  const onNext = jest.fn();
  await renderFeedback({ isCorrect: true, onNext });

  expect(screen.getByText('Great job!')).toBeOnTheScreen();
  expect(screen.getByTestId('feedback-countdown')).toHaveTextContent('3');
  await fireEvent.press(screen.getByText('Next'));
  expect(onNext).toHaveBeenCalledTimes(1);
});

it('wrong answer: "Not quite" teaches the right one (Arabic, transliteration, meaning), no "Listen again"', async () => {
  await renderFeedback({
    isCorrect: false,
    correctWordArabic: 'مشماشي',
    correctTransliteration: 'mechmechi',
    correctMeaning: 'orange',
  });

  expect(screen.getByText('Not quite')).toBeOnTheScreen();
  expect(screen.getByText('مشماشي')).toBeOnTheScreen();
  expect(screen.getByText('mechmechi')).toBeOnTheScreen();
  expect(screen.getByText('orange')).toBeOnTheScreen();
  expect(screen.getByText('Next')).toBeOnTheScreen();
  expect(screen.queryByText(/Listen again/)).toBeNull();
});

it('kid track keeps its softer copy', async () => {
  await renderFeedback({ isCorrect: false, kidFriendly: true, correctWordArabic: 'بني' });
  expect(screen.getByText(/Almost!/)).toBeOnTheScreen();
});
