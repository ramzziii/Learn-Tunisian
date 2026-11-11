// The admin content journey, end to end, in the separate TEST project only
// (npm run test:e2e:staging — see support.mjs; it refuses the live project):
//   unit → lesson → word + form → native recording upload (Audio) →
//   spelling change puts the recording on Re-check → "Still matches" →
//   reviewer approves it (Review → one at a time) → a learner sees the unit
//   and sends feedback → the admin reads it → the unit is deleted, taking
//   everything it made with it.
// Uses made-up accounts e2e-admin@example.com (admin + reviewer, set once by
// SQL in the test project) and e2e-learner@example.com.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { eventually, openPage } from '../helpers.mjs';
import { ensureTestAccount, roles, silentWav, STAGING, unsafeReason } from './support.mjs';

const RUN = Date.now().toString(36);
const UNIT = `E2E test unit ${RUN}`;
const LESSON_TITLE = `E2E lesson ${RUN}`;
const WORD_ID = `e2e_${RUN}`;
const MEANING = `E2E test word ${RUN}`;
// Test-only text in the test project (never real content): "test" / tajriba.
const ARABIC = 'تجربة';
const LATIN = 'tajriba';
const LATIN_FIXED = 'tajrba';
const ADMIN_EMAIL = 'e2e-admin@example.com';
const LEARNER_EMAIL = 'e2e-learner@example.com';

const skip = unsafeReason() ?? false;

/** A text box by its accessible name (every admin field is labelled for screen readers). */
const field = (page, name) => page.getByRole('textbox', { name, exact: true });

async function signInUi(page, email) {
  await page.goto(`${STAGING.base}/auth/sign-in`);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(STAGING.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 20000 });
}

/** Runs a step; if it fails, saves a screenshot of the admin's page and says where. */
const shotOnFailure = (name, body) => async () => {
  try {
    await body();
  } catch (e) {
    const file = join(tmpdir(), `e2e-staging-${RUN}-${name.replace(/\W+/g, '-')}.png`);
    await shared.admin?.page.screenshot({ path: file }).catch(() => undefined);
    console.log(`Screenshot of the failed step "${name}": ${file}`);
    throw e;
  }
};
const shared = {};

describe('admin content journey (TEST project)', { skip }, () => {
  let admin;
  let unitId = null;
  const steps = [];
  const step = (name) => steps.push(name);

  before(async () => {
    const account = await ensureTestAccount(ADMIN_EMAIL, 'E2E Admin');
    const r = await roles(account.token, account.id);
    assert.ok(
      r.isAdmin && r.isReviewer,
      `${ADMIN_EMAIL} must be an admin and a reviewer in the TEST project (run the one-time SQL). Now: ${JSON.stringify(r)}`
    );
    await ensureTestAccount(LEARNER_EMAIL, 'E2E Learner');
    admin = await openPage({ width: 430, height: 932 });
    shared.admin = admin;
    await signInUi(admin.page, ADMIN_EMAIL);
  });

  after(async () => {
    // Clean-up even if a step failed: deleting the unit cascades to its
    // lesson, word and forms.
    if (unitId && admin) {
      try {
        await admin.page.goto(`${STAGING.base}/admin/units/${unitId}`);
        await admin.page.getByRole('button', { name: 'Delete Unit' }).click({ timeout: 15000 });
        await admin.page.waitForTimeout(2000);
        await admin.page.goto(`${STAGING.base}/admin/units`);
        await admin.page.getByText('Units', { exact: true }).waitFor({ timeout: 15000 });
        const left = await eventually(() => admin.page.getByText(UNIT).count(), 0);
        console.log(left === 0 ? `Cleaned up: ${UNIT}` : `CLEAN-UP: ${UNIT} is still listed — delete it in the TEST project's admin`);
      } catch (e) {
        console.log(`CLEAN-UP: couldn't delete ${UNIT} — delete it in the TEST project's admin (${e.message})`);
      }
    }
    await admin?.browser.close();
    console.log(`Steps completed: ${steps.join(' → ')}`);
  });

  it('creates a unit and a lesson', shotOnFailure('creates a unit and a lesson', async () => {
    const { page } = admin;
    await page.goto(`${STAGING.base}/admin/units`);
    await page.getByRole('button', { name: '+ New Unit' }).click({ timeout: 20000 });
    await field(page, 'Name').fill(UNIT);
    await field(page, 'Sort order').fill('-100');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByText(UNIT).click({ timeout: 15000 });
    await page.waitForURL('**/admin/units/**');
    unitId = new URL(page.url()).pathname.split('/').pop();
    step('unit');

    await page.getByRole('button', { name: '+ New Lesson' }).click({ timeout: 15000 });
    await field(page, 'Lesson number').fill('1');
    await field(page, 'Title (optional)').fill(LESSON_TITLE);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByText(LESSON_TITLE).click({ timeout: 15000 });
    await page.waitForURL('**/admin/lessons/**');
    step('lesson');
  }));

  it('adds a word with one form', shotOnFailure('adds a word with one form', async () => {
    const { page } = admin;
    await page.getByRole('button', { name: '+ New Word Group' }).click({ timeout: 15000 });
    await field(page, 'ID (slug)').fill(WORD_ID);
    await field(page, 'English meaning').fill(MEANING);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.waitForURL(`**/admin/word-groups/${WORD_ID}`, { timeout: 20000 });
    step('word');

    await field(page, 'New form: Arabic').fill(ARABIC);
    await field(page, 'New form: Transliteration').fill(LATIN);
    await page.getByRole('button', { name: '+ Add Variant' }).click();
    await page.getByText(/Forms \(1\)/).waitFor({ timeout: 15000 });
    step('form');
  }));

  it('uploads a native recording from Audio → To record', shotOnFailure('uploads a native recording from Audio → To record', async () => {
    const { page } = admin;
    const wav = join(tmpdir(), `e2e-${RUN}.wav`);
    writeFileSync(wav, silentWav());
    await page.goto(`${STAGING.base}/admin/audio`);
    await page.getByText(MEANING).click({ timeout: 20000 });
    const chooser = page.waitForEvent('filechooser', { timeout: 15000 });
    await page.getByRole('button', { name: 'Upload audio' }).click();
    await (await chooser).setFiles(wav);
    // Only the word's recording: "Add explanation recording" starts unticked.
    const explanation = page.getByRole('checkbox', { name: 'Add explanation recording' });
    assert.equal(await explanation.isChecked(), false, 'explanation is optional (unticked)');
    await page.getByRole('button', { name: 'Save & next' }).click({ timeout: 15000 });
    // Saving finishes when the station moves on (next word, or the list) — or shows an error.
    await page.waitForTimeout(4000);
    // Saved: the word leaves the "to record" list.
    await page.goto(`${STAGING.base}/admin/audio`);
    await page.getByText(/Words to record|Every word has a native voice/).first().waitFor({ timeout: 20000 });
    assert.equal(await eventually(() => page.getByText(MEANING).count(), 0), 0, 'recorded word left the To record list');
    step('recording');
  }));

  it('changing the spelling puts the recording on Re-check; "Still matches" clears it', shotOnFailure('changing the spelling puts the recording on Re-check; "Still matches" clears it', async () => {
    const { page } = admin;
    await page.goto(`${STAGING.base}/admin/word-groups/${WORD_ID}`);
    const latin = page.getByLabel('Transliteration', { exact: true });
    await latin.fill(LATIN_FIXED, { timeout: 20000 });
    await page.getByText(/keeps the recording and marks it for re-check/).waitFor();
    await page.getByRole('button', { name: 'Save', exact: true }).nth(1).click();
    await page.getByText(/Recording waiting for re-check/).waitFor({ timeout: 15000 });
    step('spelling change');

    await page.goto(`${STAGING.base}/admin/audio`);
    await page.getByRole('tab', { name: 'Re-check' }).click({ timeout: 20000 });
    await page.getByText(MEANING).waitFor({ timeout: 15000 });
    assert.match(await page.locator('body').innerText(), new RegExp(`Now spelled: ${LATIN_FIXED}`));
    await page.getByRole('button', { name: '✓ Still matches' }).first().click();
    assert.equal(await eventually(() => page.getByText(MEANING).count(), 0), 0, 'confirmed recording left Re-check');
    step('re-check confirmed');
  }));

  it('a reviewer approves it in Review → one at a time, and the word goes live', shotOnFailure('a reviewer approves it in Review → one at a time, and the word goes live', async () => {
    const { page } = admin;
    await page.goto(`${STAGING.base}/admin/review`);
    await page.getByRole('button', { name: 'Review one at a time' }).click({ timeout: 20000 });
    await page.waitForURL('**/admin/review-session', { timeout: 15000 });
    await page.getByRole('button', { name: '✓ Correct' }).waitFor({ timeout: 20000 });
    // Ours sorts first (its unit's sort order is -100).
    // (The Review list stays loaded underneath, so the word's name appears twice: use the top screen.)
    await page.getByText(MEANING).last().waitFor({ timeout: 10000 });
    await page.getByText(LATIN_FIXED, { exact: true }).last().waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: '✓ Correct' }).click();
    await page.getByText(`Approved: ${MEANING} — the word is live`).waitFor({ timeout: 15000 });
    step('approved');
  }));

  it('a learner sees the new unit, and their feedback reaches the admin', shotOnFailure('a learner sees the new unit, and their feedback reaches the admin', async () => {
    const learner = await openPage();
    const note = `E2E feedback ${RUN}`;
    try {
      await signInUi(learner.page, LEARNER_EMAIL);
      await learner.page.goto(`${STAGING.base}/home`);
      await learner.page.getByText(UNIT).first().waitFor({ timeout: 20000 });
      step('learner sees unit');

      await learner.page.goto(`${STAGING.base}/feedback?from=/learn`);
      await learner.page.getByLabel('Your feedback').fill(note);
      await learner.page.getByRole('button', { name: 'Send' }).click();
      await learner.page.getByText('Thank you!').waitFor({ timeout: 15000 });
      assert.deepEqual(learner.problems, []);
    } finally {
      await learner.browser.close();
    }

    const { page } = admin;
    await page.goto(`${STAGING.base}/admin/feedback`);
    await page.getByText(note).waitFor({ timeout: 20000 });
    step('feedback received');
  }));

  it('nothing on the admin side errored along the way', () => {
    assert.deepEqual(admin.problems, []);
  });
});
