import { buildWordHelp } from '@/lib/ai/buildWordHelp';
import type { GroundedVocabularyItem } from '@/lib/ai/types';

function vocabItem(wordArabic: string, englishMeaning: string): GroundedVocabularyItem {
  return {
    wordGroupId: englishMeaning,
    englishMeaning,
    wordArabic,
    transliteration: englishMeaning,
    variantLabel: 'primary',
    nativeVerified: false,
  };
}

describe('buildWordHelp', () => {
  const vocabulary = [vocabItem('شنوّة', 'what'), vocabItem('تحب', 'you want'), vocabItem('ما', 'water')];

  it('finds every vocabulary word that appears in the message', () => {
    const help = buildWordHelp('شنوّة تحب؟', vocabulary);
    expect(help).toEqual([
      { word: 'شنوّة', meaning: 'what' },
      { word: 'تحب', meaning: 'you want' },
    ]);
  });

  it('returns an empty list when nothing in the vocabulary appears in the message', () => {
    expect(buildWordHelp('عسلامة', vocabulary)).toEqual([]);
  });

  it('does not duplicate a word that appears more than once in the message', () => {
    const help = buildWordHelp('تحب قهوة ولا تحب شاي؟', vocabulary);
    expect(help).toEqual([{ word: 'تحب', meaning: 'you want' }]);
  });

  it('handles an empty vocabulary list without error', () => {
    expect(buildWordHelp('شنوّة تحب؟', [])).toEqual([]);
  });

  it('ignores vocabulary items with an empty wordArabic', () => {
    const withEmpty = [...vocabulary, vocabItem('', 'nothing')];
    expect(buildWordHelp('شنوّة', withEmpty)).toEqual([{ word: 'شنوّة', meaning: 'what' }]);
  });
});
