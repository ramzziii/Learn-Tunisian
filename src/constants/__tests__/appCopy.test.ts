// Marketing copy has one source (src/constants/appCopy.ts): the Welcome
// screen, the "Why Tunisian, not MSA?" screen and docs/store-listing.md all
// use it. These checks keep the store fields inside their limits, keep the
// doc in step with the source, and keep out claims the app can't back up.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path');
declare const __dirname: string;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const copy = require('@/constants/appCopy');

const root = join(__dirname, '..', '..', '..');
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const store = copy.STORE_LISTING;

describe('store field limits', () => {
  it('app name options fit both stores (30 characters)', () => {
    expect(store.appNameOptions).toHaveLength(3);
    for (const name of store.appNameOptions) expect(name.length).toBeLessThanOrEqual(30);
  });

  it('Apple subtitle is 30 characters or fewer', () => {
    expect(store.appleSubtitle.length).toBeLessThanOrEqual(30);
  });

  it('Google Play short description is 80 characters or fewer', () => {
    expect(store.googleShortDescription.length).toBeLessThanOrEqual(80);
  });

  it('full description fits both stores (4,000 characters)', () => {
    expect(store.fullDescription.length).toBeLessThanOrEqual(4000);
  });

  it('Apple keywords fit the 100-character field, comma-separated without repeats', () => {
    const field = store.appleKeywords.join(',');
    expect(field.length).toBeLessThanOrEqual(100);
    expect(new Set(store.appleKeywords).size).toBe(store.appleKeywords.length);
  });

  it('Apple promotional text is 170 characters or fewer; what’s new fits 4,000', () => {
    expect(store.promotionalText.length).toBeLessThanOrEqual(170);
    expect(store.whatsNew.length).toBeLessThanOrEqual(4000);
  });

  it('five screenshot captions, each under eight words', () => {
    expect(store.screenshotCaptions).toHaveLength(5);
    for (const { caption } of store.screenshotCaptions) expect(words(caption)).toBeLessThan(8);
  });
});

describe('in-app explanation', () => {
  it('“Why Tunisian, not MSA?” stays under about 150 words', () => {
    expect(words(copy.WHY_TUNISIAN.paragraphs.join(' '))).toBeLessThanOrEqual(150);
  });

  it('says who it’s for: travelers, family or partner, diaspora, curious learners', () => {
    const list = copy.WHO_ITS_FOR.join('\n');
    expect(copy.WHO_ITS_FOR).toHaveLength(4);
    for (const re of [/travel/i, /family/i, /partner/i, /roots/i, /curious/i]) expect(list).toMatch(re);
  });
});

describe('honest claims', () => {
  const everything = JSON.stringify(copy);

  it('no competitor names', () => {
    expect(everything).not.toMatch(/duolingo|babbel|memrise|busuu|pimsleur|rosetta|drops|mondly|lingodeer/i);
  });

  it('no hype, urgency or guilt', () => {
    expect(everything).not.toMatch(/#1|\bbest\b|fluent in|guaranteed|limited time|don.t miss|hurry|streak (?!guilt|pressure)/i);
  });

  it('no claims the app can’t back up yet', () => {
    // Content isn't native-verified, the seeded audio is placeholder TTS,
    // Talk runs in mock mode until the owner sets it up, and lessons aren't
    // personalised by goal or level.
    expect(everything).not.toMatch(/native[- ]speaker[- ]verified|verified by native|native recordings|ai (tutor|chat|partner)|shaped around|personali[sz]ed|\bever\b/i);
  });
});

describe('docs/store-listing.md matches the source', () => {
  const doc = readFileSync(join(root, 'docs', 'store-listing.md'), 'utf8');

  it.each([
    ['app names', () => store.appNameOptions],
    ['subtitle', () => [store.appleSubtitle]],
    ['short description', () => [store.googleShortDescription]],
    ['full description', () => [store.fullDescription]],
    ['keywords', () => [store.appleKeywords.join(',')]],
    ['promotional text', () => [store.promotionalText]],
    ["what's new", () => [store.whatsNew]],
    ['captions', () => store.screenshotCaptions.map((c: { caption: string }) => c.caption)],
  ])('%s', (_label, get) => {
    for (const text of (get as () => string[])()) expect(doc).toContain(text);
  });

  it('ends with the owner checklist', () => {
    expect(doc).toMatch(/## Owner checklist/);
    expect(doc).toMatch(/TODO\(owner\)/);
  });

  it('does not list French meanings as a feature', () => {
    expect(doc).not.toMatch(/french (meaning|translation)/i);
  });
});
