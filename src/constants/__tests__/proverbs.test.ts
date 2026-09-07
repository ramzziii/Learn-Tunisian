import { PROVERBS, getProverbById } from '@/constants/proverbs';

describe('proverbs', () => {
  it('gives every proverb complete, non-empty content', () => {
    for (const proverb of PROVERBS) {
      expect(proverb.arabic.length).toBeGreaterThan(0);
      expect(proverb.transliteration.length).toBeGreaterThan(0);
      expect(proverb.literal.length).toBeGreaterThan(0);
      expect(proverb.meaning.length).toBeGreaterThan(0);
      expect(proverb.emoji.length).toBeGreaterThan(0);
    }
  });

  it('has a unique id per proverb', () => {
    const ids = PROVERBS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('looks proverbs up by id', () => {
    expect(getProverbById(PROVERBS[0].id)).toBe(PROVERBS[0]);
    expect(getProverbById('does-not-exist')).toBeUndefined();
  });
});
