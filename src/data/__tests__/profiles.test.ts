// createProfile: one learner profile per account. The first one is created;
// a second is refused before any insert, and if the database refuses it
// anyway (another device got there first, or a direct API call) the app gets
// the same clear ProfileAlreadyExistsError.
const mockExisting: { data: unknown[]; error: unknown } = { data: [], error: null };
const mockInsertResult: { data: unknown; error: unknown } = { data: null, error: null };
const mockInsert = jest.fn();
const mockEq = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (...a: unknown[]) => {
          mockEq(...a);
          return { limit: async () => mockExisting };
        },
      }),
      insert: (row: unknown) => {
        mockInsert(row);
        return { select: () => ({ single: async () => mockInsertResult }) };
      },
    }),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createProfile } = require('@/data/profiles');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ProfileAlreadyExistsError } = require('@/lib/account/profileLimit');

const input = {
  accountId: 'acc-1',
  name: 'Sam',
  dateOfBirth: '1990-05-01',
  nativeLanguage: 'English',
  country: 'United States',
  startingProficiency: 'none',
  learningGoal: null,
};

const row = {
  id: 'p1',
  account_id: 'acc-1',
  name: 'Sam',
  date_of_birth: '1990-05-01',
  native_language: 'English',
  country: 'United States',
  starting_proficiency: 'none',
  learning_goal: null,
  track: 'adult',
  is_premium: false,
  created_at: '2026-10-27T00:00:00Z',
};

beforeEach(() => {
  mockInsert.mockReset();
  mockEq.mockReset();
  mockExisting.data = [];
  mockExisting.error = null;
  mockInsertResult.data = row;
  mockInsertResult.error = null;
});

it('creates the account’s first profile', async () => {
  const profile = await createProfile(input);

  expect(mockEq).toHaveBeenCalledWith('account_id', 'acc-1');
  expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ account_id: 'acc-1', name: 'Sam', track: 'adult' }));
  expect(profile).toMatchObject({ id: 'p1', accountId: 'acc-1', isPremium: false });
});

it('refuses a second profile without inserting anything', async () => {
  mockExisting.data = [{ id: 'p-existing' }];

  await expect(createProfile(input)).rejects.toBeInstanceOf(ProfileAlreadyExistsError);
  expect(mockInsert).not.toHaveBeenCalled();
});

it('maps the database’s one-profile rejection to ProfileAlreadyExistsError', async () => {
  mockInsertResult.data = null;
  mockInsertResult.error = { code: '23505', message: 'profile_already_exists' };

  const error = await createProfile(input).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ProfileAlreadyExistsError);
  expect((error as Error).message).toMatch(/already has a learner profile/i);
});

it('passes other database errors through unchanged', async () => {
  const other = { code: '42501', message: 'permission denied' };
  mockInsertResult.data = null;
  mockInsertResult.error = other;

  await expect(createProfile(input)).rejects.toBe(other);
});
