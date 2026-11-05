// The central access table: guests try 2 items per counted feature; a free
// account gets 3 more (5 in total, counting guest use); Premium opens every
// eligible item. An item already used — or a lesson already completed — is
// never counted again and always stays open.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const access = require('@/lib/access/accessRules');

const set = (...keys: string[]) => new Set(keys);

describe('the table', () => {
  it('2 for guests, 5 in total for free accounts', () => {
    expect(access.GUEST_ITEM_ALLOWANCE).toBe(2);
    expect(access.FREE_ITEM_TOTAL).toBe(5);
    expect(access.itemAllowance('guest')).toBe(2);
    expect(access.itemAllowance('free')).toBe(5);
    expect(access.itemAllowance('premium')).toBe(Infinity);
  });

  it('counts exactly these features', () => {
    expect([...access.COUNTED_FEATURES].sort()).toEqual(
      ['alphabet_letter', 'dictionary_result', 'grammar_note', 'lesson', 'phrasebook_category', 'proverb', 'repeat_after_me'].sort()
    );
  });

  it('practice features are not counted — they use unlocked, approved words only', () => {
    for (const f of ['review', 'flashcards', 'listening', 'speaking', 'favorites']) {
      expect(access.COUNTED_FEATURES).not.toContain(f);
    }
  });

  it('translation requests keep their own rule (guest none, free 1, premium unlimited)', () => {
    expect(access.TRANSLATION_REQUEST_ALLOWANCE).toEqual({ guest: 0, free: 1, premium: Infinity });
  });

  it('Talk needs Premium; guests and free accounts see it locked', () => {
    expect(access.canUseTalk('premium')).toBe(true);
    expect(access.canUseTalk('free')).toBe(false);
    expect(access.canUseTalk('guest')).toBe(false);
  });
});

describe('Dictionary / Search', () => {
  it('one opened search result is one item: guests 2, accounts unlimited', () => {
    expect(access.itemAllowance('guest', 'dictionary_result')).toBe(2);
    expect(access.itemAllowance('free', 'dictionary_result')).toBe(Infinity);
    expect(access.itemAllowance('premium', 'dictionary_result')).toBe(Infinity);
  });

  it('free accounts never claim it (nothing to send to the server)', () => {
    const decide = (tier: 'guest' | 'free', claimed: string[], itemKey: string) =>
      access.decideItemAccess({ tier, claimed: new Set(claimed), itemKey, feature: 'dictionary_result' });
    expect(decide('free', ['a', 'b', 'c', 'd', 'e', 'f'], 'g')).toBe('open');
    expect(decide('guest', [], 'a')).toBe('claim');
    expect(decide('guest', ['a', 'b'], 'a')).toBe('open');
    expect(decide('guest', ['a', 'b'], 'c')).toBe('limit');
  });

  it('only server-counted features are imported at sign-up or claimed on the server', () => {
    expect(access.isServerCounted('lesson')).toBe(true);
    expect(access.isServerCounted('dictionary_result')).toBe(false);
  });

  it('other features keep the default allowance', () => {
    expect(access.itemAllowance('free', 'lesson')).toBe(5);
  });
});

describe('Grammar notes: a fixed free set', () => {
  const grammar = (tier: 'guest' | 'free' | 'premium', key: string, claimed: string[] = []) =>
    access.decideItemAccess({ tier, claimed: new Set(claimed), itemKey: key, feature: 'grammar_note' });

  it('guests: only sentence order', () => {
    expect(grammar('guest', 'sentence_order')).toBe('open');
    for (const id of ['present_verbs', 'questions', 'past_tense', 'negation']) expect(grammar('guest', id)).toBe('limit');
  });

  it('free accounts: sentence order, present tense and questions; nothing else', () => {
    for (const id of ['sentence_order', 'present_verbs', 'questions']) expect(grammar('free', id)).toBe('open');
    for (const id of ['everyday_pronouns', 'past_tense', 'negation', 'possession', 'small_words']) expect(grammar('free', id)).toBe('limit');
  });

  it('never counted: no claim, and an old claim doesn’t open a Premium note', () => {
    expect(grammar('free', 'past_tense', ['past_tense'])).toBe('limit');
    expect(access.isServerCounted('grammar_note')).toBe(false);
  });

  it('Premium: every note open', () => {
    expect(grammar('premium', 'past_tense')).toBe('open');
  });

  it('every free id is a real grammar note', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ids = new Set(require('@/constants/grammarNotes').GRAMMAR_NOTES.map((n: { id: string }) => n.id));
    const { guest, free } = access.FIXED_FREE_ITEMS.grammar_note!;
    for (const id of [...guest, ...free]) expect(ids.has(id)).toBe(true);
    for (const id of guest) expect(free.has(id)).toBe(true); // signing up never loses a note
  });
});

describe('decideItemAccess', () => {
  const decide = (tier: string, claimed: Set<string>, key: string, extra: object = {}) =>
    access.decideItemAccess({ tier, claimed, itemKey: key, ...extra });

  it('Premium: always open, nothing counted', () => {
    expect(decide('premium', set(), 'x')).toBe('open');
  });

  it('guest: 2 new items, then the limit', () => {
    expect(decide('guest', set(), 'a')).toBe('claim');
    expect(decide('guest', set('a'), 'b')).toBe('claim');
    expect(decide('guest', set('a', 'b'), 'c')).toBe('limit');
  });

  it('free: up to 5 in total including what was used as a guest', () => {
    expect(decide('free', set('a', 'b'), 'c')).toBe('claim'); // 2 guest + 1
    expect(decide('free', set('a', 'b', 'c', 'd'), 'e')).toBe('claim');
    expect(decide('free', set('a', 'b', 'c', 'd', 'e'), 'f')).toBe('limit');
  });

  it('an item already used is open and never counted again', () => {
    expect(decide('guest', set('a', 'b'), 'a')).toBe('open');
    expect(decide('free', set('a', 'b', 'c', 'd', 'e'), 'c')).toBe('open');
  });

  it('a completed lesson always reopens, even beyond the free allowance', () => {
    expect(decide('free', set('a', 'b', 'c', 'd', 'e'), 'z', { completed: true })).toBe('open');
  });

  it('after Premium ends, items open so far stay open; new ones count toward 5', () => {
    // Nothing was recorded while Premium; completed lessons still reopen.
    expect(decide('free', set(), 'done-while-premium', { completed: true })).toBe('open');
    expect(decide('free', set(), 'new')).toBe('claim');
  });

  it('isItemOpen: only open/claim mean the item can be opened now', () => {
    expect(access.isItemOpen('open')).toBe(true);
    expect(access.isItemOpen('claim')).toBe(true);
    expect(access.isItemOpen('limit')).toBe(false);
  });
});

describe('tierOf', () => {
  it('signed in → free or premium (effective entitlement); signed out guest → guest', () => {
    expect(access.tierOf({ signedIn: true, isPremium: true })).toBe('premium');
    expect(access.tierOf({ signedIn: true, isPremium: false })).toBe('free');
    expect(access.tierOf({ signedIn: false, isPremium: false })).toBe('guest');
  });
});
