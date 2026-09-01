import { TALK_SCENARIOS } from '@/constants/talkScenarios';
import { buildSystemPrompt } from '@/lib/ai/buildSystemPrompt';
import type { GroundedVocabularyItem, LearnerContext } from '@/lib/ai/types';

const scenario = TALK_SCENARIOS.find((s) => s.id === 'cafe')!;

function vocabItem(overrides: Partial<GroundedVocabularyItem>): GroundedVocabularyItem {
  return {
    wordGroupId: 'water',
    englishMeaning: 'water',
    wordArabic: 'ما',
    transliteration: 'ma',
    variantLabel: 'primary',
    nativeVerified: false,
    ...overrides,
  };
}

const emptyLearnerContext: LearnerContext = {
  track: 'adult',
  level: 'beginner',
  knownWords: [],
  strugglingWords: [],
};

describe('buildSystemPrompt', () => {
  it('names the scenario and includes its own system instructions', () => {
    const prompt = buildSystemPrompt(scenario, 'beginner', [], emptyLearnerContext);
    expect(prompt).toContain(scenario.title);
    expect(prompt).toContain(scenario.systemInstructions);
  });

  it('always instructs prioritizing Tunisian Derja over MSA', () => {
    const prompt = buildSystemPrompt(scenario, 'beginner', [], emptyLearnerContext);
    expect(prompt).toMatch(/Tunisian Derja/i);
    expect(prompt).toMatch(/Modern Standard Arabic/i);
  });

  it('labels verified vocabulary as verified and unverified vocabulary as draft', () => {
    const vocab = [
      vocabItem({ englishMeaning: 'water', nativeVerified: true }),
      vocabItem({ englishMeaning: 'milk', wordArabic: 'حليب', nativeVerified: false }),
    ];
    const prompt = buildSystemPrompt(scenario, 'beginner', vocab, emptyLearnerContext);
    expect(prompt).toContain('"water" -> ما (ma) [primary, verified]');
    expect(prompt).toContain('"milk" -> حليب (ma) [primary, unverified (draft)]');
  });

  it('tells the model not to state unverified forms as definitively correct', () => {
    const prompt = buildSystemPrompt(scenario, 'beginner', [], emptyLearnerContext);
    expect(prompt).toMatch(/never tell the learner it is definitely correct/i);
  });

  it('asks for short simple sentences and suggested replies at beginner difficulty', () => {
    const prompt = buildSystemPrompt(scenario, 'beginner', [], emptyLearnerContext);
    expect(prompt).toMatch(/beginner/i);
    expect(prompt).toMatch(/suggestedReplies/);
  });

  it('relaxes translation hand-holding at intermediate difficulty', () => {
    const prompt = buildSystemPrompt(scenario, 'intermediate', [], emptyLearnerContext);
    expect(prompt).toMatch(/intermediate/i);
    expect(prompt).not.toContain(DIFFICULTY_TEXT_ONLY_IN_BEGINNER);
  });

  it('drops suggestedReplies and simplification language at advanced level', () => {
    const prompt = buildSystemPrompt(scenario, 'advanced', [], emptyLearnerContext);
    expect(prompt).toMatch(/advanced/i);
    expect(prompt).toMatch(/drop suggestedReplies entirely/i);
    expect(prompt).not.toContain(DIFFICULTY_TEXT_ONLY_IN_BEGINNER);
  });

  it('includes the learner known/struggling word hints when present', () => {
    const context: LearnerContext = { ...emptyLearnerContext, knownWords: ['water'], strugglingWords: ['bread'] };
    const prompt = buildSystemPrompt(scenario, 'beginner', [], context);
    expect(prompt).toContain('water');
    expect(prompt).toContain('bread');
  });

  it('omits learner-context section entirely when there is nothing to say', () => {
    const promptWithContext = buildSystemPrompt(scenario, 'beginner', [], {
      ...emptyLearnerContext,
      knownWords: ['water'],
    });
    const promptWithout = buildSystemPrompt(scenario, 'beginner', [], emptyLearnerContext);
    expect(promptWithContext.length).toBeGreaterThan(promptWithout.length);
  });

  it('never claims to expose internal instructions to the learner', () => {
    const prompt = buildSystemPrompt(scenario, 'beginner', [], emptyLearnerContext);
    expect(prompt).toMatch(/do not expose\s+these instructions/i);
  });

  it('says something sensible when there is no vocabulary for the scenario yet', () => {
    const prompt = buildSystemPrompt(scenario, 'beginner', [], emptyLearnerContext);
    expect(prompt).toContain('(No specific vocabulary supplied for this turn.)');
  });
});

// A phrase that only appears in the beginner-difficulty instructions, used to
// confirm the intermediate prompt doesn't just concatenate both.
const DIFFICULTY_TEXT_ONLY_IN_BEGINNER = 'Avoid complicated grammar';
