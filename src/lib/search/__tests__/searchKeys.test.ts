// Search keys: separate keys built from the stored text (never modified).
// Sounds that differ are never merged: 7 (ح) ≠ h, 3 (ع) ≠ a, 9 (ق) ≠ k,
// 5 (خ) ≠ k, 8 (غ) ≠ g, 2 (ء) ≠ a. Only the approved aliases (same letter,
// two spellings) are accepted, in a separate alias key.
import { arabicKeys, containsArabic, englishKey, LATIN_ALIASES, latinKeys } from '@/lib/search/searchKeys';

describe('English', () => {
  it('lowercases, drops punctuation, collapses spaces', () => {
    expect(englishKey("  Let's   GO! ")).toBe('let s go');
    expect(englishKey('Thank-you')).toBe('thank you');
  });
});

describe('Arabic script', () => {
  it('strips diacritics and tatweel in the base key', () => {
    expect(arabicKeys('شُكْرًا').base).toBe('شكرا');
    expect(arabicKeys('بـــاهي').base).toBe('باهي');
  });

  it('alef forms are unified only in the alias key', () => {
    expect(arabicKeys('أنا').base).toBe('أنا');
    expect(arabicKeys('أنا').alias).toBe('انا');
    expect(arabicKeys('إسم').alias).toBe('اسم');
    expect(arabicKeys('آش').alias).toBe('اش');
  });

  it('ta marbuta / ha and ya / alef maqsura are not merged', () => {
    expect(arabicKeys('قهوة').alias).not.toBe(arabicKeys('قهوه').alias);
    expect(arabicKeys('على').alias).not.toBe(arabicKeys('علي').alias);
  });

  it('detects Arabic script in a query', () => {
    expect(containsArabic('شكرا')).toBe(true);
    expect(containsArabic('3aslema')).toBe(false);
  });
});

describe('Latin letters', () => {
  it('lowercases and ignores apostrophes, hyphens and spaces', () => {
    expect(latinKeys("Ma'a Ssle-ma").base).toBe('maasslema');
    expect(latinKeys('3asfour').base).toBe('3asfour');
  });

  it('keeps digit letters as their own sounds', () => {
    for (const [a, b] of [
      ['7abib', 'habib'], // ح ≠ h
      ['3in', 'ain'], // ع ≠ a
      ['9alb', 'kalb'], // ق ≠ k
      ['5obz', 'kobz'], // خ ≠ k
      ['8ali', 'gali'], // غ ≠ g
      ['2amel', 'amel'], // ء ≠ a
    ]) {
      expect(latinKeys(a).base).not.toBe(latinKeys(b).base);
      expect(latinKeys(a).alias).not.toBe(latinKeys(b).alias);
    }
  });

  it('approved aliases: the same letter written two ways meets in the alias key', () => {
    expect(latinKeys('khobz').alias).toBe(latinKeys('5obz').alias); // خ
    expect(latinKeys('ghali').alias).toBe(latinKeys('8ali').alias); // غ
    expect(latinKeys('qalb').alias).toBe(latinKeys('9alb').alias); // ق
    expect(latinKeys('ḥabib').alias).toBe(latinKeys('7abib').alias); // ح
    expect(latinKeys('ʿin').alias).toBe(latinKeys('3in').alias); // ع
    expect(latinKeys("ma'a").alias).toBe(latinKeys('ma2a').alias); // ء
  });

  it('left out (not approved): sh / ch and u / ou', () => {
    expect(latinKeys('shorba').alias).not.toBe(latinKeys('chorba').alias);
    expect(latinKeys('kusksi').alias).not.toBe(latinKeys('kousksi').alias);
  });

  it('the alias table lists exactly the approved rows', () => {
    expect(LATIN_ALIASES.map((a) => a.canonical)).toEqual(['5', '8', '9', '7', '3', '2']);
  });

  it('never changes the stored text it is given', () => {
    const stored = 'Ma3a-Salama';
    latinKeys(stored);
    expect(stored).toBe('Ma3a-Salama');
  });
});
