// Admin field help: each field's ⓘ shows a short English explanation on tap
// and hides it on a second tap; every explanation is filled in.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FieldHelp } = require('@/components/admin/FieldHelp');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PillSelect } = require('@/components/admin/PillSelect');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FIELD_HELP } = require('@/lib/admin/fieldHelp');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('FieldHelp', () => {
  it('shows the explanation on tap and hides it on a second tap', async () => {
    await wrap(<FieldHelp label="Transliteration" help="transliteration" />);
    expect(screen.getByText('Transliteration')).toBeTruthy();
    expect(screen.queryByText(FIELD_HELP.transliteration)).toBeNull();

    const info = screen.getByRole('button', { name: 'What is “Transliteration”?' });
    await fireEvent.press(info);
    expect(screen.getByText(FIELD_HELP.transliteration)).toBeTruthy();
    await fireEvent.press(info);
    expect(screen.queryByText(FIELD_HELP.transliteration)).toBeNull();
  });

  it('can wrap another row (a checkbox) instead of a plain label', async () => {
    await wrap(
      <FieldHelp label="Add to Repeat After Me" help="repeatAfterMe">
        <Text>Checkbox row</Text>
      </FieldHelp>
    );
    expect(screen.getByText('Checkbox row')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'What is “Add to Repeat After Me”?' }));
    expect(screen.getByText(FIELD_HELP.repeatAfterMe)).toBeTruthy();
  });

  it('PillSelect shows an ⓘ only when given help', async () => {
    const options = [{ value: 'a', label: 'A' }];
    const { rerender } = await wrap(<PillSelect label="Label" options={options} value="a" onChange={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'What is “Label”?' })).toBeNull();
    await rerender(
      <ThemeProvider>
        <PillSelect label="Label" options={options} value="a" onChange={() => undefined} help="formLabel" />
      </ThemeProvider>
    );
    await fireEvent.press(screen.getByRole('button', { name: 'What is “Label”?' }));
    expect(screen.getByText(FIELD_HELP.formLabel)).toBeTruthy();
  });

  it('every explanation is a real sentence', () => {
    for (const text of Object.values(FIELD_HELP) as string[]) {
      expect(text.length).toBeGreaterThan(20);
    }
  });
});
