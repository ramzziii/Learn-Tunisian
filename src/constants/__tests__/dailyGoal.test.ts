// The daily goal choices live in one shared constant: exactly 5, 10 and 15
// minutes (the values the database allows). Longer goals like 30 or 60
// minutes are never offered or accepted — learners can still keep going at
// the end of any session with "Add more time".
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path');
declare const __dirname: string;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DAILY_GOAL_OPTIONS, isDailyGoalMinutes } = require('@/constants/dailyGoal');

const root = join(__dirname, '..', '..', '..');

it('offers exactly 5, 10 and 15 minutes', () => {
  expect(DAILY_GOAL_OPTIONS).toEqual([5, 10, 15]);
});

it('accepts only those values', () => {
  for (const ok of [5, 10, 15]) expect(isDailyGoalMinutes(ok)).toBe(true);
  for (const no of [0, 1, 20, 30, 45, 60, null, undefined, '10']) expect(isDailyGoalMinutes(no)).toBe(false);
});

it('matches what the database allows', () => {
  const sql = readFileSync(join(root, 'supabase', 'migrations', '0001_init.sql'), 'utf8');
  expect(sql).toMatch(/daily_goal_minutes smallint not null check \(daily_goal_minutes in \(5, 10, 15\)\)/);
});

it('onboarding and Profile use the shared list instead of their own copy', () => {
  for (const file of ['app/onboarding/goal.tsx', 'app/(tabs)/profile.tsx']) {
    const source = readFileSync(join(root, file), 'utf8');
    expect(source).toMatch(/DAILY_GOAL_OPTIONS/);
    expect(source).not.toMatch(/\[5, 10, 15\]/);
  }
});
