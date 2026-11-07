// Teach before testing: one card per new word (meaning, spelling/forms and
// recording via FormDisplay), Next / Back, then "Start practice"; the intro
// can be skipped at any time.
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
const mockBack = jest.fn();
jest.mock('expo-router', () => ({ router: { back: () => mockBack() } }));
jest.mock('@/components/tunisian/FormDisplay', () => ({
  FormDisplay: ({ group }: { group: { id: string } }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return <Text>{`[forms of ${group.id}]`}</Text>;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { NewWordsIntro } = require('@/components/lesson/NewWordsIntro');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const groups = [
  { id: 'im_hungry', englishMeaning: "I'm hungry", variants: [] },
  { id: 'all_done', englishMeaning: 'all done', variants: [] },
];
const renderIntro = (onDone = jest.fn()) =>
  render(
    <ThemeProvider>
      <NewWordsIntro groups={groups} onDone={onDone} />
    </ThemeProvider>
  );

it('shows each new word with its meaning and forms, then "Start practice" on the last one', async () => {
  const onDone = jest.fn();
  await renderIntro(onDone);
  expect(screen.getByText('New words · 1 of 2')).toBeOnTheScreen();
  expect(screen.getByText("I'm hungry")).toBeOnTheScreen();
  expect(screen.getByText('[forms of im_hungry]')).toBeOnTheScreen();

  await fireEvent.press(screen.getByText('Next'));
  expect(screen.getByText('New words · 2 of 2')).toBeOnTheScreen();
  expect(screen.getByText('all done')).toBeOnTheScreen();
  expect(screen.queryByText('Skip to practice')).toBeNull();

  await fireEvent.press(screen.getByText('Back'));
  expect(screen.getByText("I'm hungry")).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Next'));
  await fireEvent.press(screen.getByText('Start practice'));
  expect(onDone).toHaveBeenCalledTimes(1);
});

it('can be skipped straight to practice, or closed', async () => {
  const onDone = jest.fn();
  await renderIntro(onDone);
  await fireEvent.press(screen.getByText('Skip to practice'));
  expect(onDone).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByLabelText('Close'));
  expect(mockBack).toHaveBeenCalled();
});
