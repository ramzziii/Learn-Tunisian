// Reading and saving a profile's display preferences (0023). No row means
// both/both — existing learners are never assigned a form. Anything
// unexpected from the database falls back to the default rather than
// guessing.
const mockMaybeSingle = jest.fn();
const mockUpsert = jest.fn();
const mockEq = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      mockFrom(table);
      return {
        select: () => ({
          eq: (...a: unknown[]) => {
            mockEq(...a);
            return { maybeSingle: () => mockMaybeSingle() };
          },
        }),
        upsert: (...a: unknown[]) => mockUpsert(...a),
      };
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchDisplayPreferences, saveDisplayPreferences } = require('@/data/displayPreferences');

beforeEach(() => {
  [mockMaybeSingle, mockUpsert, mockEq, mockFrom].forEach((m) => m.mockReset());
});

it('reads the profile’s row', async () => {
  mockMaybeSingle.mockResolvedValue({ data: { script: 'arabic', form: 'feminine' }, error: null });
  await expect(fetchDisplayPreferences('p1')).resolves.toEqual({ script: 'arabic', form: 'feminine' });
  expect(mockFrom).toHaveBeenCalledWith('learner_display_preferences');
  expect(mockEq).toHaveBeenCalledWith('profile_id', 'p1');
});

it('no row (existing learners) → both/both', async () => {
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(fetchDisplayPreferences('p1')).resolves.toEqual({ script: 'both', form: 'both' });
});

it('an unexpected stored value falls back to the default for that setting only', async () => {
  mockMaybeSingle.mockResolvedValue({ data: { script: 'klingon', form: 'masculine' }, error: null });
  await expect(fetchDisplayPreferences('p1')).resolves.toEqual({ script: 'both', form: 'masculine' });
});

it('a read error is thrown, so the caller can keep the defaults and say so', async () => {
  mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'offline' } });
  await expect(fetchDisplayPreferences('p1')).rejects.toBeTruthy();
});

it('saves with an upsert on the profile — only the two display settings', async () => {
  mockUpsert.mockResolvedValue({ error: null });
  await saveDisplayPreferences('p1', { script: 'latin', form: 'both' });
  expect(mockUpsert).toHaveBeenCalledWith({ profile_id: 'p1', script: 'latin', form: 'both' }, { onConflict: 'profile_id' });
});

it('a save error is thrown', async () => {
  mockUpsert.mockResolvedValue({ error: { message: 'denied' } });
  await expect(saveDisplayPreferences('p1', { script: 'latin', form: 'both' })).rejects.toBeTruthy();
});
