import {
  ARABIC_LETTERS,
  DIACRITICS,
  buildAlphabetChoices,
  buildAlphabetExerciseQueue,
  buildAlphabetSet,
  buildMatchingGrid,
  buildSimilarLetterChoices,
  buildTrueFalseQuestion,
  buildVocalizedReading,
  getLetterById,
  getVocalizedForms,
  splitAtLetter,
  withFatha,
} from '@/lib/alphabet';

describe('alphabet data', () => {
  it('builds the primary Arabic letters for the learning module', () => {
    const letters = buildAlphabetSet();

    expect(letters.length).toBeGreaterThanOrEqual(10);
    expect(letters[0]).toMatchObject({ id: 'baa', label: 'ب', name: 'Baa' });
    expect(letters.some((letter) => letter.id === 'taa')).toBe(true);
    expect(letters.some((letter) => letter.id === 'jeem')).toBe(true);
    expect(letters.some((letter) => letter.id === 'haa')).toBe(true);
  });

  it('creates a valid choice set with the correct answer included', () => {
    const set = buildAlphabetChoices('taa', 4);

    expect(set).toContain('taa');
    expect(set.length).toBe(4);
    expect(new Set(set).size).toBe(set.length);
  });

  it('gives every letter position-dependent forms and two example words', () => {
    for (const letter of ARABIC_LETTERS) {
      expect(letter.forms.isolated).toBe(letter.label);
      expect(letter.forms.initial).toContain(letter.label);
      expect(letter.forms.medial).toContain(letter.label);
      expect(letter.forms.final).toContain(letter.label);
      expect(letter.examples).toHaveLength(2);
      for (const example of letter.examples) {
        expect(example.arabic.length).toBeGreaterThan(0);
        expect(example.transliteration.length).toBeGreaterThan(0);
        expect(example.english.length).toBeGreaterThan(0);
      }
    }
  });

  it('looks letters up by id', () => {
    expect(getLetterById('baa')?.label).toBe('ب');
    expect(getLetterById('does-not-exist')).toBeUndefined();
  });

  it('builds a fixed-length queue that cycles through all four exercise kinds', () => {
    const queue = buildAlphabetExerciseQueue(8);

    expect(queue).toHaveLength(8);
    const kinds = new Set(queue.map((item) => item.kind));
    expect(kinds).toEqual(new Set(['listen_choose', 'true_false', 'choose_sound', 'sound_match']));
    for (const item of queue) {
      expect(getLetterById(item.letterId)).toBeDefined();
    }
  });

  it('gives every letter a phonetic cue and a similar-shape group', () => {
    for (const letter of ARABIC_LETTERS) {
      expect(letter.phoneticCue.sound.length).toBeGreaterThan(0);
      expect(letter.phoneticCue.exampleWord.length).toBeGreaterThan(0);
      expect(letter.similarShapeGroup.length).toBeGreaterThan(0);
    }
  });

  it('renders a letter vocalized with a fatha', () => {
    expect(withFatha(getLetterById('baa')!)).toBe('بَ');
  });

  it('gives every letter an example word (with a placeholder emoji) for each of the three short vowels', () => {
    for (const letter of ARABIC_LETTERS) {
      for (const id of ['fatha', 'damma', 'kasra'] as const) {
        const example = letter.vowelExamples[id];
        expect(example.arabic.length).toBeGreaterThan(0);
        expect(example.transliteration.length).toBeGreaterThan(0);
        expect(example.english.length).toBeGreaterThan(0);
        expect(example.emoji?.length).toBeGreaterThan(0);
      }
    }
  });

  it('builds a friendly phonetic reading per vowel from the transliteration', () => {
    expect(buildVocalizedReading(getLetterById('baa')!, 'fatha')).toBe('Baa');
    expect(buildVocalizedReading(getLetterById('baa')!, 'damma')).toBe('Boo');
    expect(buildVocalizedReading(getLetterById('baa')!, 'kasra')).toBe('Bee');
    // Ayn's transliteration is itself a vowel ("a"), so the consonant is dropped to avoid "Aaa".
    expect(buildVocalizedReading(getLetterById('ain')!, 'fatha')).toBe('Aa');
  });

  it('builds all three vocalized forms for a letter, in fatha/damma/kasra order', () => {
    const forms = getVocalizedForms(getLetterById('baa')!);

    expect(forms).toHaveLength(3);
    expect(forms.map((f) => f.diacritic.id)).toEqual(['fatha', 'damma', 'kasra']);
    expect(forms[0].glyph).toBe('بَ');
    expect(forms[0].reading).toBe('Baa');
    expect(forms[0].example.arabic.length).toBeGreaterThan(0);
  });

  it('exposes exactly the three short-vowel diacritics', () => {
    expect(DIACRITICS.map((d) => d.id)).toEqual(['fatha', 'damma', 'kasra']);
  });

  it('splits a word around a letter, keeping its diacritic attached to the match', () => {
    const baa = getLetterById('baa')!;
    const split = splitAtLetter('بَطة', baa);

    expect(split).not.toBeNull();
    expect(split!.before).toBe('');
    expect(split!.match).toBe('بَ');
    expect(split!.after).toBe('طة');
    expect(split!.before + split!.match + split!.after).toBe('بَطة');
  });

  it('finds every letter within its own vowel example words', () => {
    for (const letter of ARABIC_LETTERS) {
      for (const id of ['fatha', 'damma', 'kasra'] as const) {
        const example = letter.vowelExamples[id];
        expect(splitAtLetter(example.arabic, letter)).not.toBeNull();
      }
    }
  });

  it('returns null when the letter is not in the word', () => {
    expect(splitAtLetter('طاولة', getLetterById('baa')!)).toBeNull();
  });

  it('prefers same-shape-group distractors, falling back to random ones for singleton groups', () => {
    // "teeth" group (baa/taa/thaa/noon/yaa) has enough members to fill 4 choices without falling back.
    const teethChoices = buildSimilarLetterChoices('baa', 4);
    expect(teethChoices).toContain('baa');
    expect(teethChoices).toHaveLength(4);
    expect(new Set(teethChoices).size).toBe(4);
    for (const id of teethChoices) {
      expect(getLetterById(id)!.similarShapeGroup).toBe('teeth');
    }

    // "laam" is a singleton group, so it must fall back to letters outside its own group.
    const laamChoices = buildSimilarLetterChoices('laam', 4);
    expect(laamChoices).toContain('laam');
    expect(laamChoices).toHaveLength(4);
    expect(new Set(laamChoices).size).toBe(4);
  });

  it('builds a true/false question referencing valid letters', () => {
    const question = buildTrueFalseQuestion('taa');

    expect(question.audioLetterId).toBe('taa');
    expect(getLetterById(question.shownLetterId)).toBeDefined();
    expect(question.isMatch).toBe(question.shownLetterId === 'taa');
  });

  it('builds a shuffled matching grid with exactly one glyph and one name tile per letter', () => {
    const tiles = buildMatchingGrid(6);

    expect(tiles).toHaveLength(12);
    const byLetter = new Map<string, Set<string>>();
    for (const tile of tiles) {
      const kinds = byLetter.get(tile.letterId) ?? new Set<string>();
      kinds.add(tile.kind);
      byLetter.set(tile.letterId, kinds);
    }
    expect(byLetter.size).toBe(6);
    for (const kinds of byLetter.values()) {
      expect(kinds).toEqual(new Set(['glyph', 'name']));
    }
  });
});
