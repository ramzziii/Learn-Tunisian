import { findTalkScenario, TALK_SCENARIOS } from '@/constants/talkScenarios';

describe('TALK_SCENARIOS', () => {
  it('has at least the 5 scenarios the product spec calls for', () => {
    expect(TALK_SCENARIOS.length).toBeGreaterThanOrEqual(5);
  });

  it('every scenario has a unique id', () => {
    const ids = TALK_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every scenario has the fields the UI and prompt builder depend on', () => {
    for (const scenario of TALK_SCENARIOS) {
      expect(scenario.title.length).toBeGreaterThan(0);
      expect(scenario.description.length).toBeGreaterThan(0);
      expect(scenario.emoji.length).toBeGreaterThan(0);
      expect(scenario.systemInstructions.length).toBeGreaterThan(0);
      expect(Array.isArray(scenario.targetVocabulary)).toBe(true);
    }
  });

  it("every scenario's target_vocabulary entries are unique within that scenario", () => {
    for (const scenario of TALK_SCENARIOS) {
      expect(new Set(scenario.targetVocabulary).size).toBe(scenario.targetVocabulary.length);
    }
  });

  // Mirrors the word_group ids actually seeded by supabase/seed.sql. This
  // isn't a database call — it's a guard against a typo'd id silently
  // producing an empty vocabulary list for a scenario at runtime, which
  // would otherwise only be discovered by noticing an unusually generic
  // conversation.
  const SEEDED_WORD_GROUP_IDS = new Set([
    'red', 'blue', 'yellow', 'green', 'orange', 'black', 'white', 'pink', 'purple', 'brown',
    'cat', 'dog', 'bird', 'fish', 'horse', 'cow', 'sheep', 'chicken_animal', 'rabbit', 'lion',
    'bread', 'water', 'milk', 'apple', 'banana', 'egg', 'rice', 'chicken_food', 'cheese', 'honey',
    'head', 'hand', 'foot', 'eye', 'ear', 'nose', 'mouth', 'hair', 'tooth', 'tummy',
    'im_hungry', 'im_thirsty', 'i_love_you', 'good_morning', 'good_night', 'im_happy', 'im_tired',
    'letsgo', 'more_please', 'all_done',
  ]);

  it('every target_vocabulary id references a word_group that actually exists in the seed data', () => {
    for (const scenario of TALK_SCENARIOS) {
      for (const wordGroupId of scenario.targetVocabulary) {
        expect(SEEDED_WORD_GROUP_IDS.has(wordGroupId)).toBe(true);
      }
    }
  });
});

describe('findTalkScenario', () => {
  it('finds a known scenario by id', () => {
    expect(findTalkScenario('cafe')?.title).toBe('At a Café');
  });

  it('returns undefined for an unknown id rather than throwing', () => {
    expect(findTalkScenario('not-a-real-scenario')).toBeUndefined();
  });
});
