// The one shared way to show a Tunisian word or phrase: Arabic, Latin
// transliteration or both per the learner's script preference, Arabic laid
// out right-to-left and Latin left-to-right, with the exemptions for
// exercises that test a particular script.
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TunisianText } = require('@/components/tunisian/TunisianText');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DisplayPreferencesOverride } = require('@/lib/display/useDisplayPreferences');

const withScript = (script: string, el: React.ReactElement) =>
  render(<DisplayPreferencesOverride preferences={{ script, form: 'both' }}>{el}</DisplayPreferencesOverride>);

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;

it('both (the default): Arabic right-to-left, transliteration left-to-right', async () => {
  await render(<TunisianText arabic="عسلامة" latin="aslema" />);
  const arabic = screen.getByText('عسلامة');
  const latin = screen.getByText('aslema');
  expect(flat(arabic)).toMatchObject({ writingDirection: 'rtl' });
  expect(flat(latin)).toMatchObject({ writingDirection: 'ltr' });
  expect(arabic.props.accessibilityLanguage).toBe('ar');
});

it('Arabic only', async () => {
  await withScript('arabic', <TunisianText arabic="عسلامة" latin="aslema" />);
  expect(screen.getByText('عسلامة')).toBeOnTheScreen();
  expect(screen.queryByText('aslema')).toBeNull();
});

it('Latin only', async () => {
  await withScript('latin', <TunisianText arabic="عسلامة" latin="aslema" />);
  expect(screen.getByText('aslema')).toBeOnTheScreen();
  expect(screen.queryByText('عسلامة')).toBeNull();
});

it('a reading-Arabic exercise keeps Arabic even with Latin only', async () => {
  await withScript('latin', <TunisianText arabic="عسلامة" latin="aslema" alwaysShowArabic />);
  expect(screen.getByText('عسلامة')).toBeOnTheScreen();
});

it('a transliteration exercise keeps Latin even with Arabic only', async () => {
  await withScript('arabic', <TunisianText arabic="عسلامة" latin="aslema" alwaysShowLatin />);
  expect(screen.getByText('aslema')).toBeOnTheScreen();
});

it('shows what exists rather than a blank when the preferred script is missing', async () => {
  await withScript('arabic', <TunisianText arabic={null} latin="ta3ban" />);
  expect(screen.getByText('ta3ban')).toBeOnTheScreen();
});
