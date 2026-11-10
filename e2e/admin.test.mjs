// Admin journeys: run only when E2E_ADMIN_EMAIL / _PASSWORD are set — a
// TEST admin account that is not a language reviewer. They only look: no
// approve, reject, "Still matches", save, delete or record. The one change is
// the "View app as Premium" switch, which lives on the device and is put
// back as it was.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { BASE, bodyText, eventually, openPage, signIn } from './helpers.mjs';

const ADMIN =
  process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD
    ? { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD }
    : null;

/** No spinner for a moment: the screen has finished loading (or is stuck — then this throws). */
async function settled(page, timeout = 15000) {
  const until = Date.now() + timeout;
  let calmSince = null;
  while (Date.now() < until) {
    const spinning = await page.locator('[role="progressbar"]').count();
    if (spinning === 0) {
      calmSince ??= Date.now();
      if (Date.now() - calmSince > 1000) return;
    } else calmSince = null;
    await page.waitForTimeout(250);
  }
  throw new Error(`still loading after ${timeout / 1000}s: ${page.url()}`);
}

describe('admin (test account, not a reviewer)', { skip: ADMIN ? false : 'set E2E_ADMIN_EMAIL and _PASSWORD to run' }, () => {
  let ctx;
  before(async () => {
    ctx = await openPage();
    await signIn(ctx.page, ADMIN);
  });
  after(async () => ctx?.browser.close());

  it('Today opens: pipeline and "Needs you now"; no reviewer-only rows', async () => {
    const { page } = ctx;
    await page.goto(`${BASE}/admin`);
    await page.getByText('Needs you now').waitFor({ timeout: 20000 });
    await settled(page);
    const text = await bodyText(page);
    assert.match(text, /Admin/);
    assert.doesNotMatch(text, /Language reviewer/, 'this test account must not be a reviewer');
    assert.doesNotMatch(text, /AI corrections? to check/);
  });

  it('every tab and admin screen opens without errors or endless spinners', async () => {
    const { page, problems } = ctx;
    problems.length = 0;
    for (const [route, expected] of [
      ['/admin/requests', /Translation requests/],
      ['/admin/review', /Waiting for review/],
      ['/admin/audio', /Words to record|Every word has a native voice/],
      ['/admin/content', /Course units/],
      ['/admin/imports', /Imports/],
      ['/admin/feedback', /Feedback/],
      ['/admin/word-groups/red', /Forms \(\d+\)/],
    ]) {
      await page.goto(BASE + route);
      await page.getByText(expected).first().waitFor({ timeout: 20000 });
      await settled(page);
    }
    assert.deepEqual(problems, []);
  });

  it('Review: no "Review one at a time" or AI corrections for a non-reviewer', async () => {
    const { page } = ctx;
    await page.goto(`${BASE}/admin/review`);
    await page.getByText('Waiting for review', { exact: true }).waitFor({ timeout: 20000 });
    await settled(page);
    assert.equal(await page.getByRole('button', { name: 'Review one at a time' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'AI corrections to check' }).count(), 0);
  });

  it('Audio: all four parts open', async () => {
    const { page, problems } = ctx;
    problems.length = 0;
    await page.goto(`${BASE}/admin/audio`);
    for (const [tab, expected] of [
      ['Skipped', /Skipped/],
      ['Explain', /Missing explanations|Every recorded word/],
      ['Re-check', /Re-check|Nothing to re-check/],
      ['To record', /Words to record|Every word has a native voice/],
    ]) {
      await page.getByRole('tab', { name: tab }).click();
      await page.getByText(expected).first().waitFor({ timeout: 20000 });
      await settled(page);
    }
    assert.deepEqual(problems, []);
  });

  it('a recording card has "Edit word", which opens that word in the editor', async (t) => {
    const { page } = ctx;
    await page.goto(`${BASE}/admin/audio`);
    await settled(page);
    // A word's "why" label in the To record list ("Re-check" is also a tab name, so not that one).
    const firstWord = page.getByText(/^(No recording|File missing|Computer voice)$/).first();
    if ((await firstWord.count()) === 0) return t.skip('no word left to record');
    await firstWord.click();
    await page.getByText('✏️ Edit word').click({ timeout: 15000 });
    await page.waitForURL('**/admin/word-groups/**', { timeout: 15000 });
    await page.getByText(/Forms \(\d+\)/).waitFor({ timeout: 20000 });
  });

  it('"View app as Premium" switches what the learner screens show, then goes back', async () => {
    const { page } = ctx;
    const toggle = async (wantPremium) => {
      await page.goto(`${BASE}/admin`);
      const sw = page.getByRole('switch', { name: 'View app as Premium' });
      await sw.waitFor({ timeout: 20000 });
      if ((await sw.isChecked()) !== wantPremium) await sw.click();
      await eventually(() => sw.isChecked(), wantPremium);
      // Saved on the device before the next page load reads it.
      const stored = () => page.evaluate(() => localStorage.getItem('learn-tunisian.admin-premium-preview'));
      assert.equal(await eventually(stored, wantPremium ? 'premium' : 'free'), wantPremium ? 'premium' : 'free');
    };
    // Open Grammar once, then let the locks settle (access resolves after the first paint).
    const grammarLocksSettleAt = async (expected) => {
      await page.goto(`${BASE}/grammar`);
      await page.getByText('Basic Sentence Order').waitFor({ timeout: 20000 });
      return eventually(() => page.getByLabel('Premium', { exact: true }).count(), expected);
    };

    await page.goto(`${BASE}/admin`);
    const sw = page.getByRole('switch', { name: 'View app as Premium' });
    await sw.waitFor({ timeout: 20000 });
    const startedPremium = await sw.isChecked();
    try {
      await toggle(false);
      assert.equal(await grammarLocksSettleAt(5), 5, 'free preview: 5 grammar notes locked');
      assert.match(await bodyText(page), /Viewing as a free user/);
      await toggle(true);
      assert.equal(await grammarLocksSettleAt(0), 0, 'Premium: nothing locked');
      assert.doesNotMatch(await bodyText(page), /Viewing as a free user/);
    } finally {
      await toggle(startedPremium);
    }
  });

  it('dark mode and a computer screen: Today and Audio open cleanly', async () => {
    const dark = await openPage({ colorScheme: 'dark', width: 1440, height: 900 });
    try {
      await signIn(dark.page, ADMIN);
      for (const [route, expected] of [
        ['/admin', /Needs you now/],
        ['/admin/audio', /Words to record|Every word has a native voice/],
      ]) {
        await dark.page.goto(BASE + route);
        await dark.page.getByText(expected).first().waitFor({ timeout: 20000 });
        await settled(dark.page);
      }
      assert.deepEqual(dark.problems, []);
    } finally {
      await dark.browser.close();
    }
  });
});
