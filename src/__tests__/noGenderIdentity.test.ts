// The grammatical-form setting is a display preference, not the learner's
// gender: no gender/identity question or profile field anywhere in the
// app, the old "If you're a boy / girl" wording is gone, and the form
// preference never reaches the AI tutor.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync, readdirSync, statSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path');
declare const __dirname: string;

const root = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'test-utils') continue;
      out.push(...sourceFiles(p));
    } else if (/\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const files = [...sourceFiles(join(root, 'app')), ...sourceFiles(join(root, 'src'))];
const read = (p: string) => readFileSync(p, 'utf8') as string;

it('no screen asks for the learner’s gender or calls a form “boy”/“girl”', () => {
  const offenders = files.filter((f) =>
    /what is your gender|your gender\?|are you (male|female|a man|a woman)|if you('|&apos;)re a (boy|girl)/i.test(read(f))
  );
  expect(offenders).toEqual([]);
});

it('profiles have no gender/sex/pronoun field', () => {
  const database = read(join(root, 'src', 'types', 'database.ts'));
  const profileRow = /export interface ProfileRow \{([\s\S]*?)\n\}/.exec(database)?.[1] ?? '';
  expect(profileRow).not.toMatch(/gender|sex|pronoun/i);
  const models = read(join(root, 'src', 'types', 'models.ts'));
  const profile = /export interface Profile \{([\s\S]*?)\n\}/.exec(models)?.[1] ?? '';
  expect(profile).not.toMatch(/gender|sex|pronoun|formPreference/i);
});

it('the form preference is never sent to the AI tutor', () => {
  const aiFiles = files.filter((f) => /[\\/](lib[\\/]ai|hooks[\\/]useConversation|data[\\/]talkContext)/.test(f));
  expect(aiFiles.length).toBeGreaterThan(0);
  for (const f of aiFiles) expect(read(f)).not.toMatch(/displayPreferences|formPreference|useDisplayPreferences/);
});
