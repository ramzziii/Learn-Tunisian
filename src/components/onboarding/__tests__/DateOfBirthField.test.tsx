// The typed date-of-birth field (MM / DD / YYYY) replacing the scrolling
// picker: labelled numeric fields, focus moving month → day → year as each
// is completed, backspace moving back, and only a complete, real, past
// date reported to the screen.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TextInput } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DateOfBirthField } = require('@/components/onboarding/DateOfBirthField');

// The RN Jest mock shares one focus() on the prototype; mock.contexts says
// which input it was called on.
const focus = TextInput.prototype.focus as unknown as jest.Mock;
const lastFocused = () => {
  const ctx = focus.mock.contexts[focus.mock.contexts.length - 1] as { props: { accessibilityLabel: string } } | undefined;
  return ctx?.props.accessibilityLabel;
};

const MONTH = 'Birth month, two digits';
const DAY = 'Birth day, two digits';
const YEAR = 'Birth year, four digits';

let onChange: jest.Mock;
const renderField = () => render(<DateOfBirthField label="Date of birth" value={null} onChange={onChange} />);

beforeEach(() => {
  onChange = jest.fn();
  focus.mockClear();
});

it('three labelled numeric fields, shown as MM / DD / YYYY', async () => {
  await renderField();
  for (const [label, placeholder] of [
    [MONTH, 'MM'],
    [DAY, 'DD'],
    [YEAR, 'YYYY'],
  ]) {
    const input = screen.getByLabelText(label);
    expect(input.props.keyboardType).toBe('number-pad');
    expect(input.props.placeholder).toBe(placeholder);
  }
  expect(screen.getByText('Date of birth')).toBeOnTheScreen();
});

it('a valid two-digit month moves focus to the day; a valid two-digit day moves it to the year', async () => {
  await renderField();
  await fireEvent.changeText(screen.getByLabelText(MONTH), '04');
  expect(lastFocused()).toBe(DAY);
  await fireEvent.changeText(screen.getByLabelText(DAY), '27');
  expect(lastFocused()).toBe(YEAR);
});

it('a single digit, or an impossible month, does not jump ahead', async () => {
  await renderField();
  await fireEvent.changeText(screen.getByLabelText(MONTH), '1');
  await fireEvent.changeText(screen.getByLabelText(MONTH), '13');
  expect(focus).not.toHaveBeenCalled();
});

it('backspace in an empty field goes back to the previous one', async () => {
  await renderField();
  await fireEvent(screen.getByLabelText(YEAR), 'keyPress', { nativeEvent: { key: 'Backspace' } });
  expect(lastFocused()).toBe(DAY);
  await fireEvent(screen.getByLabelText(DAY), 'keyPress', { nativeEvent: { key: 'Backspace' } });
  expect(lastFocused()).toBe(MONTH);
});

it('backspace inside a field with digits just deletes (no jump)', async () => {
  await renderField();
  await fireEvent.changeText(screen.getByLabelText(DAY), '2');
  focus.mockClear();
  await fireEvent(screen.getByLabelText(DAY), 'keyPress', { nativeEvent: { key: 'Backspace' } });
  expect(focus).not.toHaveBeenCalled();
});

it('only a complete, real date is reported; partial input reports nothing usable', async () => {
  await renderField();
  await fireEvent.changeText(screen.getByLabelText(MONTH), '04');
  await fireEvent.changeText(screen.getByLabelText(DAY), '27');
  await fireEvent.changeText(screen.getByLabelText(YEAR), '199');
  expect(onChange).toHaveBeenLastCalledWith(null);

  await fireEvent.changeText(screen.getByLabelText(YEAR), '1990');
  expect(onChange).toHaveBeenLastCalledWith('1990-04-27');
});

it('corrections take effect: fixing the month updates the date', async () => {
  await renderField();
  await fireEvent.changeText(screen.getByLabelText(MONTH), '04');
  await fireEvent.changeText(screen.getByLabelText(DAY), '27');
  await fireEvent.changeText(screen.getByLabelText(YEAR), '1990');
  await fireEvent.changeText(screen.getByLabelText(MONTH), '0');
  expect(onChange).toHaveBeenLastCalledWith(null);
  await fireEvent.changeText(screen.getByLabelText(MONTH), '05');
  expect(onChange).toHaveBeenLastCalledWith('1990-05-27');
});

it('letters and symbols are ignored', async () => {
  await renderField();
  await fireEvent.changeText(screen.getByLabelText(YEAR), '19a9-0');
  expect(screen.getByLabelText(YEAR).props.value).toBe('1990');
});

it('an impossible date says why, and reports nothing usable', async () => {
  await renderField();
  await fireEvent.changeText(screen.getByLabelText(MONTH), '02');
  await fireEvent.changeText(screen.getByLabelText(DAY), '30');
  await fireEvent.changeText(screen.getByLabelText(YEAR), '1990');
  expect(onChange).toHaveBeenLastCalledWith(null);
  expect(screen.getByRole('alert')).toHaveTextContent(/doesn.t exist/i);
});

it('a future date says so', async () => {
  await renderField();
  const nextYear = String(new Date().getFullYear() + 1);
  await fireEvent.changeText(screen.getByLabelText(MONTH), '01');
  await fireEvent.changeText(screen.getByLabelText(DAY), '01');
  await fireEvent.changeText(screen.getByLabelText(YEAR), nextYear);
  expect(onChange).toHaveBeenLastCalledWith(null);
  expect(screen.getByRole('alert')).toHaveTextContent(/future/i);
});
