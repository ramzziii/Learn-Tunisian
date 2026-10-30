// The Delete account screen (app/account/delete.tsx): explains what is
// deleted and what is kept, requires typing DELETE, shows progress, blocks
// double submits, shows a useful error (never success) when the server
// fails, allows a safe retry, and on success goes to the welcome screen.
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockComplete = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockResetOnboarding = jest.fn();
let mockIsAdmin = false;
let mockIsReviewer = false;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), back: (...a: unknown[]) => mockBack(...a), push: jest.fn(), canGoBack: () => true },
}));
jest.mock('@/lib/account/deleteAccount', () => ({ completeAccountDeletion: (...a: unknown[]) => mockComplete(...a) }));
jest.mock('@/lib/account/ActiveProfileContext', () => ({
  useActiveProfile: () => ({ profiles: [{ id: 'p1' }], activeProfile: { id: 'p1' } }),
}));
jest.mock('@/lib/admin/AdminContext', () => ({ useIsAdmin: () => ({ isAdmin: mockIsAdmin, isLoading: false }) }));
jest.mock('@/data/reviewers', () => ({ fetchIsReviewer: async () => mockIsReviewer }));
jest.mock('@/lib/onboarding/OnboardingContext', () => ({ useOnboarding: () => ({ reset: mockResetOnboarding }) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const DeleteAccount = require('../../../app/account/delete').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const renderScreen = () =>
  render(
    <ThemeProvider>
      <DeleteAccount />
    </ThemeProvider>
  );

const deleteButton = () => screen.getByRole('button', { name: 'Delete my account' });
const typeConfirmation = (text: string) => fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), text);

beforeEach(() => {
  mockComplete.mockReset();
  mockReplace.mockReset();
  mockBack.mockReset();
  mockResetOnboarding.mockReset();
  mockIsAdmin = false;
  mockIsReviewer = false;
});

it('explains that it is permanent and what is deleted and kept, without naming anything personal', async () => {
  await renderScreen();

  expect(screen.getByText(/permanent/i)).toBeOnTheScreen();
  expect(screen.getByText(/can’t be undone/i)).toBeOnTheScreen();
  for (const item of [/your profile/i, /learning progress/i, /translation requests/i, /reminders/i]) {
    expect(screen.getByText(item)).toBeOnTheScreen();
  }
  expect(screen.getByText(/AI usage and cost records.*without anything that identifies you/i)).toBeOnTheScreen();
  expect(screen.getByText(/shared lessons and phrases/i)).toBeOnTheScreen();
});

it('the delete button stays disabled until exactly DELETE is typed', async () => {
  await renderScreen();
  expect(deleteButton()).toBeDisabled();

  await typeConfirmation('delete');
  expect(deleteButton()).toBeDisabled();
  await typeConfirmation('DELET');
  expect(deleteButton()).toBeDisabled();

  await typeConfirmation('DELETE');
  expect(deleteButton()).toBeEnabled();
  await fireEvent.press(deleteButton());
  expect(mockComplete).toHaveBeenCalled();
});

it('pressing it while disabled does nothing', async () => {
  await renderScreen();
  await fireEvent.press(deleteButton());
  expect(mockComplete).not.toHaveBeenCalled();
});

it('shows progress while deleting and ignores a second press', async () => {
  let finish: (v: unknown) => void = () => {};
  mockComplete.mockReturnValue(new Promise((r) => (finish = r)));
  await renderScreen();
  await typeConfirmation('DELETE');

  // Not awaited: the press handler stays pending until `finish` is called.
  const firstPress = fireEvent.press(deleteButton());
  expect(await screen.findByText('Deleting your account…')).toBeOnTheScreen();
  const busy = screen.getByRole('button', { name: /deleting/i });
  expect(busy).toBeDisabled();
  const secondPress = fireEvent.press(busy);
  expect(mockComplete).toHaveBeenCalledTimes(1);

  await act(async () => finish({ ok: true }));
  await firstPress;
  await secondPress;
  expect(mockComplete).toHaveBeenCalledTimes(1);
});

it('on success: deletes this account’s local data, resets onboarding and goes to the welcome screen', async () => {
  mockComplete.mockResolvedValue({ ok: true });
  await renderScreen();
  await typeConfirmation('DELETE');
  await fireEvent.press(deleteButton());

  expect(mockComplete).toHaveBeenCalledWith({ profileIds: ['p1'], wasAdmin: false });
  expect(mockResetOnboarding).toHaveBeenCalled();
  expect(mockReplace).toHaveBeenCalledWith('/welcome');
});

it('on failure: a useful error, no success, no navigation — and retrying works', async () => {
  mockComplete.mockResolvedValueOnce({ ok: false, message: 'Your account couldn’t be deleted yet. Please try again.' });
  await renderScreen();
  await typeConfirmation('DELETE');
  await fireEvent.press(deleteButton());

  expect(screen.getByRole('alert')).toHaveTextContent('Your account couldn’t be deleted yet. Please try again.');
  expect(mockReplace).not.toHaveBeenCalled();
  expect(screen.queryByText(/has been deleted/i)).toBeNull();

  mockComplete.mockResolvedValueOnce({ ok: true });
  await fireEvent.press(deleteButton());
  expect(mockComplete).toHaveBeenCalledTimes(2);
  expect(mockReplace).toHaveBeenCalledWith('/welcome');
});

it('Cancel goes back without deleting', async () => {
  await renderScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(mockBack).toHaveBeenCalled();
  expect(mockComplete).not.toHaveBeenCalled();
});

it('an admin or reviewer is told what losing that role means — but is not blocked', async () => {
  mockIsAdmin = true;
  mockIsReviewer = true;
  mockComplete.mockResolvedValue({ ok: true });
  await renderScreen();

  expect(await screen.findByText(/admin access/i)).toBeOnTheScreen();
  expect(screen.getByText(/language reviewer/i)).toBeOnTheScreen();

  await typeConfirmation('DELETE');
  await fireEvent.press(deleteButton());
  expect(mockComplete).toHaveBeenCalledWith({ profileIds: ['p1'], wasAdmin: true });
});
