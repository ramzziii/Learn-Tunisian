// The active profile's display preferences, app-wide. Loaded for the
// signed-in profile; both/both while loading, when signed out, or when
// there's no saved row; changes apply at once and are saved, and a failed
// save puts the previous value back and reports it.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

const mockFetch = jest.fn();
const mockSave = jest.fn();
let mockActiveProfile: { id: string } | null = { id: 'p1' };

jest.mock('@/data/displayPreferences', () => ({
  fetchDisplayPreferences: (...a: unknown[]) => mockFetch(...a),
  saveDisplayPreferences: (...a: unknown[]) => mockSave(...a),
}));
jest.mock('@/lib/account/ActiveProfileContext', () => ({ useActiveProfile: () => ({ activeProfile: mockActiveProfile }) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DisplayPreferencesProvider, useDisplayPreferences } = require('@/lib/display/DisplayPreferencesContext');

let lastResult: unknown = null;
function Probe() {
  const { preferences, setForm, setScript } = useDisplayPreferences();
  return (
    <>
      <Text>{`script=${preferences.script} form=${preferences.form}`}</Text>
      <Pressable onPress={async () => (lastResult = await setForm('feminine'))}>
        <Text>feminine</Text>
      </Pressable>
      <Pressable onPress={async () => (lastResult = await setScript('arabic'))}>
        <Text>arabic</Text>
      </Pressable>
    </>
  );
}

const renderProbe = () =>
  render(
    <DisplayPreferencesProvider>
      <Probe />
    </DisplayPreferencesProvider>
  );

beforeEach(() => {
  mockFetch.mockReset();
  mockSave.mockReset().mockResolvedValue(undefined);
  mockActiveProfile = { id: 'p1' };
  lastResult = null;
});

it('loads the active profile’s saved preferences', async () => {
  mockFetch.mockResolvedValue({ script: 'latin', form: 'masculine' });
  await renderProbe();
  expect(await screen.findByText('script=latin form=masculine')).toBeOnTheScreen();
  expect(mockFetch).toHaveBeenCalledWith('p1');
});

it('signed out: defaults, nothing fetched', async () => {
  mockActiveProfile = null;
  await renderProbe();
  expect(screen.getByText('script=both form=both')).toBeOnTheScreen();
  expect(mockFetch).not.toHaveBeenCalled();
});

it('a failed load keeps the defaults', async () => {
  mockFetch.mockRejectedValue(new Error('offline'));
  await renderProbe();
  await act(async () => {});
  expect(screen.getByText('script=both form=both')).toBeOnTheScreen();
});

it('a change applies straight away and is saved for that profile', async () => {
  mockFetch.mockResolvedValue({ script: 'both', form: 'both' });
  await renderProbe();
  await act(async () => {});
  await fireEvent.press(screen.getByText('feminine'));

  expect(screen.getByText('script=both form=feminine')).toBeOnTheScreen();
  expect(mockSave).toHaveBeenCalledWith('p1', { script: 'both', form: 'feminine' });
  expect(lastResult).toEqual({ ok: true });
});

it('a failed save puts the previous value back and reports it', async () => {
  mockFetch.mockResolvedValue({ script: 'both', form: 'both' });
  mockSave.mockRejectedValue(new Error('denied'));
  await renderProbe();
  await act(async () => {});
  await fireEvent.press(screen.getByText('arabic'));

  expect(screen.getByText('script=both form=both')).toBeOnTheScreen();
  expect(lastResult).toEqual({ ok: false, message: expect.stringMatching(/couldn.t save/i) });
});

it('outside the provider (e.g. isolated components) the hook returns the defaults', async () => {
  function Bare() {
    const { preferences } = useDisplayPreferences();
    return <Text>{`bare script=${preferences.script} form=${preferences.form}`}</Text>;
  }
  await render(<Bare />);
  expect(screen.getByText('bare script=both form=both')).toBeOnTheScreen();
});
