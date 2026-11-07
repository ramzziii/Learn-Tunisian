// The database's 0028 refusals, in plain words for admins.
import { adminSaveErrorMessage } from '@/lib/admin/adminErrors';

it('approve / reject by a non-reviewer: says what they can do instead', () => {
  expect(adminSaveErrorMessage(new Error('permission denied: only language reviewers can approve or reject content'), 'x')).toBe(
    'Only language reviewers can make content live or reject it. You can edit it, send it back to draft, or archive it.'
  );
});

it('ticking "text checked" by a non-reviewer', () => {
  expect(adminSaveErrorMessage(new Error('permission denied: only language reviewers can mark text as checked'), 'x')).toBe(
    'Only language reviewers can mark text as checked by a native speaker.'
  );
});

it('clearing a re-check flag directly: points to Audio → Re-check', () => {
  expect(
    adminSaveErrorMessage(new Error('permission denied: a recording that needs re-check is cleared only by confirming it or replacing it'), 'x')
  ).toMatch(/Audio → Re-check/);
});

it('anything else keeps its own message, or the fallback', () => {
  expect(adminSaveErrorMessage(new Error('network down'), 'Could not save.')).toBe('network down');
  expect(adminSaveErrorMessage({}, 'Could not save.')).toBe('Could not save.');
});
