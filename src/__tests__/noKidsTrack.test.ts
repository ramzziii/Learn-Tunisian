// Learn Tunisian is adults-only (18+, one profile per account). The kids
// track was removed from the app — not hidden behind a flag — so none of its
// code paths should come back. (Database tables/columns such as
// profiles.track and consent_records.is_for_child are intentionally kept.)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs') as {
  existsSync: (p: string) => boolean;
  readdirSync: (p: string, o: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[];
  readFileSync: (p: string, e: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path') as { join: (...p: string[]) => string; relative: (a: string, b: string) => string };
declare const __dirname: string;

const ROOT = path.join(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(rel);
    return /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
  });
}

it.each([
  'src/components/exercises/kid/ListenAndTap.tsx',
  'src/components/ui/ParentGateModal.tsx',
  'src/constants/features.ts',
  'src/lib/ai/accessControl.ts',
  'app/onboarding/who.tsx',
  'app/onboarding/goal-select.tsx',
])('%s is gone', (file) => {
  expect(fs.existsSync(path.join(ROOT, file))).toBe(false);
});

it('no app code branches on the kids track any more', () => {
  const offenders: string[] = [];
  const patterns = [
    /track\s*[!=]==\s*'kid'/,
    /'listen_and_tap'/,
    /\bforWhom\b/,
    /\bisForChild\b/,
    /KIDS_SECTION_ENABLED/,
    /trackForDateOfBirth/,
    /canAccessTalkFeature/,
    /ParentGateModal/,
    /\bisKid\b/,
  ];
  for (const file of [...sourceFiles('app'), ...sourceFiles('src')]) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const p of patterns) if (p.test(text)) offenders.push(`${file}: ${p}`);
  }
  expect(offenders).toEqual([]);
});

it('the Profile model no longer carries a track (the column stays in the database row type)', () => {
  const models = fs.readFileSync(path.join(ROOT, 'src/types/models.ts'), 'utf8');
  expect(models).not.toMatch(/export type Track\b/);
  expect(models).not.toMatch(/^\s+track: Track;/m);
  const db = fs.readFileSync(path.join(ROOT, 'src/types/database.ts'), 'utf8');
  expect(db).toMatch(/track: string;/);
});
