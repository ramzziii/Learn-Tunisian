// The result pop-up shown after every answer: Next button, optional
// countdown that moves on by itself, optional secondary choices.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FeedbackSheet } = require('@/components/ui/FeedbackSheet');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const renderSheet = (props: Record<string, unknown>) =>
  render(
    <ThemeProvider>
      <FeedbackSheet visible tone="success" icon="🎉" title="Great job!" onPrimary={jest.fn()} {...props} />
    </ThemeProvider>
  );

it('pops up with its title, message and content', async () => {
  await renderSheet({ message: 'That sounded right.', children: <Text>extra content</Text> });

  expect(screen.getByText('Great job!')).toBeOnTheScreen();
  expect(screen.getByText('That sounded right.')).toBeOnTheScreen();
  expect(screen.getByText('extra content')).toBeOnTheScreen();
});

it('Next moves on straight away', async () => {
  const onPrimary = jest.fn();
  await renderSheet({ onPrimary, autoAdvanceSeconds: 3 });

  await fireEvent.press(screen.getByText('Next'));

  expect(onPrimary).toHaveBeenCalledTimes(1);
});

it('counts down from the given seconds and then moves on by itself — once', async () => {
  const onPrimary = jest.fn();
  await renderSheet({ onPrimary, autoAdvanceSeconds: 2 });

  expect(screen.getByTestId('feedback-countdown')).toHaveTextContent('2');
  await waitFor(() => expect(screen.getByTestId('feedback-countdown')).toHaveTextContent('1'), { timeout: 2000 });
  await waitFor(() => expect(onPrimary).toHaveBeenCalledTimes(1), { timeout: 3000 });
  await act(async () => new Promise((r) => setTimeout(r, 1200)));
  expect(onPrimary).toHaveBeenCalledTimes(1);
}, 15000);

it('tapping Next before the countdown ends never triggers a second move', async () => {
  const onPrimary = jest.fn();
  await renderSheet({ onPrimary, autoAdvanceSeconds: 1 });

  await fireEvent.press(screen.getByText('Next'));
  await act(async () => new Promise((r) => setTimeout(r, 1500)));

  expect(onPrimary).toHaveBeenCalledTimes(1);
}, 10000);

it('a paused countdown waits (e.g. while comparing recordings)', async () => {
  const onPrimary = jest.fn();
  await renderSheet({ onPrimary, autoAdvanceSeconds: 1, paused: true });

  await act(async () => new Promise((r) => setTimeout(r, 1500)));

  expect(onPrimary).not.toHaveBeenCalled();
  expect(screen.getByText('Next')).toBeOnTheScreen();
}, 10000);

it('no countdown when it needs a choice: shows both actions and never moves on by itself', async () => {
  const onPrimary = jest.fn();
  const onSecondary = jest.fn();
  await renderSheet({ tone: 'error', title: 'Not quite right yet', primaryLabel: 'Try again', onPrimary, secondaryLabel: 'Move on', onSecondary });

  expect(screen.queryByTestId('feedback-countdown')).toBeNull();
  expect(screen.getByText('Try again')).toBeOnTheScreen();
  await act(async () => new Promise((r) => setTimeout(r, 1200)));
  expect(onPrimary).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByText('Move on'));
  expect(onSecondary).toHaveBeenCalledTimes(1);
  // One choice per pop-up: a second tap can't trigger another action.
  await fireEvent.press(screen.getByText('Try again'));
  expect(onPrimary).not.toHaveBeenCalled();
}, 10000);

it('renders nothing when not visible', async () => {
  await renderSheet({ visible: false });
  expect(screen.queryByText('Great job!')).toBeNull();
});
