/**
 * The central access table — the one place that says who may open what.
 *
 * Tiers:
 * - guest:   signed out, device only (no account, no server writes);
 * - free:    signed-in account without Premium;
 * - premium: effective Premium (usePremium(): profiles.is_premium, or an admin
 *            unless previewing the free plan).
 *
 * Counted features: guests may try GUEST_ITEM_ALLOWANCE items per feature; a
 * free account gets 3 more, FREE_ITEM_TOTAL in total including guest use;
 * Premium opens every eligible item. An item already used is never counted
 * again and stays open; a completed lesson always reopens. Nothing is counted
 * while Premium, so when Premium ends, what was opened stays open and new
 * items count toward the free total. Only approved content is ever eligible.
 *
 * Grammar notes aren't counted: fixed free sets per tier (FIXED_FREE_ITEMS),
 * the rest is Premium.
 *
 * Practice (Review, Flashcards, Listening, Speaking, Favorites) isn't counted:
 * it uses only words from unlocked lessons/categories, approved only.
 */

export type Tier = 'guest' | 'free' | 'premium';

export const COUNTED_FEATURES = [
  'lesson',
  'phrasebook_category',
  'grammar_note',
  'proverb',
  'alphabet_letter',
  'repeat_after_me',
  // One search result opened from Dictionary / Search (guests only; see FEATURE_ALLOWANCE).
  'dictionary_result',
] as const;
export type CountedFeature = (typeof COUNTED_FEATURES)[number];

/** Items a guest may try per counted feature. */
export const GUEST_ITEM_ALLOWANCE = 2;
/** Items a free account may use per counted feature, guest use included (2 + 3). */
export const FREE_ITEM_TOTAL = 5;

/** Translation requests are answered by a person, so they keep their own rule (the database enforces "free: 1"). */
export const TRANSLATION_REQUEST_ALLOWANCE: Record<Tier, number> = { guest: 0, free: 1, premium: Infinity };

/** Alphabet matching needs at least this many unlocked letters. */
export const MATCHING_MIN_LETTERS = 3;

/**
 * Features whose allowance differs from the default (guest 2 / free 5 in
 * total / Premium all). Dictionary / Search: guests may open 2 results;
 * accounts search and open freely (only words they can already open are
 * searchable — src/data/search.ts).
 */
const FEATURE_ALLOWANCE: Partial<Record<CountedFeature, Record<Tier, number>>> = {
  dictionary_result: { guest: GUEST_ITEM_ALLOWANCE, free: Infinity, premium: Infinity },
};

/**
 * Features with fixed free sets instead of a count: guests and free accounts
 * may open exactly their tier's items (never counted, nothing claimed); every
 * other item is Premium. Grammar notes (ids in src/constants/grammarNotes.ts):
 * guests get sentence order; a free account adds present tense and questions.
 */
export const FIXED_FREE_ITEMS: Partial<Record<CountedFeature, Record<'guest' | 'free', ReadonlySet<string>>>> = {
  grammar_note: {
    guest: new Set(['sentence_order']),
    free: new Set(['sentence_order', 'present_verbs', 'questions']),
  },
};

export function itemAllowance(tier: Tier, feature?: CountedFeature): number {
  const special = feature ? FEATURE_ALLOWANCE[feature] : undefined;
  if (special) return special[tier];
  if (tier === 'premium') return Infinity;
  return tier === 'guest' ? GUEST_ITEM_ALLOWANCE : FREE_ITEM_TOTAL;
}

/**
 * Counted on the server for free accounts (feature_item_claims, 0025) and
 * imported from the guest preview at sign-up. Features unlimited for
 * accounts are counted on the device only, for guests, and never sent.
 */
export const isServerCounted = (feature: CountedFeature): boolean =>
  !FIXED_FREE_ITEMS[feature] && itemAllowance('free', feature) !== Infinity;

/** Talk (AI conversation and tutor voice) is Premium only; the server enforces it too. */
export const canUseTalk = (tier: Tier): boolean => tier === 'premium';

export function tierOf({ signedIn, isPremium }: { signedIn: boolean; isPremium: boolean }): Tier {
  if (!signedIn) return 'guest';
  return isPremium ? 'premium' : 'free';
}

/**
 * - open:  may open now without using an item (Premium, already used, or a completed lesson);
 * - claim: may open now, and opening it uses one item;
 * - limit: the allowance is used up — show the account / upgrade prompt.
 */
export type ItemDecision = 'open' | 'claim' | 'limit';

export function decideItemAccess({
  tier,
  claimed,
  itemKey,
  completed = false,
  feature,
}: {
  tier: Tier;
  claimed: ReadonlySet<string>;
  itemKey: string;
  completed?: boolean;
  feature?: CountedFeature;
}): ItemDecision {
  const fixedFree = feature ? FIXED_FREE_ITEMS[feature] : undefined;
  if (fixedFree) return tier === 'premium' || fixedFree[tier].has(itemKey) ? 'open' : 'limit';
  const allowance = itemAllowance(tier, feature);
  if (allowance === Infinity || completed || claimed.has(itemKey)) return 'open';
  return claimed.size < allowance ? 'claim' : 'limit';
}

export const isItemOpen = (decision: ItemDecision): boolean => decision !== 'limit';
