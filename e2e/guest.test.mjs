// Guest journeys (signed out, device only) against the web build.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { BASE, bodyText, eventually, openPage, startGuest } from './helpers.mjs';

describe('guest', () => {
  let ctx;
  before(async () => {
    ctx = await openPage();
    await startGuest(ctx.page);
  });
  after(async () => ctx?.browser.close());

  it('Home offers lesson 1; the lesson starts with the new words, then the quiz', async () => {
    const { page } = ctx;
    // The path's card only appears once the lessons are loaded, so this waits for it.
    await page.getByRole('button', { name: /^Start your first lesson/ }).click({ timeout: 20000 });
    await page.waitForURL('**/lesson/**', { timeout: 15000 });
    await page.getByText(/New words · 1 of \d+/).waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: 'Skip to practice' }).click();
    await page.getByText(/Tap the|Type the Tunisian|Listen/).first().waitFor({ timeout: 15000 });
  });

  it('Home lists the preview units', async () => {
    const { page } = ctx;
    await page.goto(`${BASE}/home`);
    await page.getByText(/\d+ units?/).first().waitFor({ timeout: 15000 });
    assert.doesNotMatch(await bodyText(page), /No lessons yet/);
  });

  it('Grammar: sentence order open; present tense and questions "Sign up"; the rest Premium', async () => {
    const { page } = ctx;
    await page.goto(`${BASE}/grammar`);
    await page.getByText('Basic Sentence Order').waitFor();
    assert.equal(await eventually(() => page.getByLabel('Sign up to unlock').count(), 2), 2);
    assert.equal(await eventually(() => page.getByLabel('Premium', { exact: true }).count(), 5), 5);
    await page.getByText('Present Tense', { exact: true }).click();
    await page.waitForURL('**/guest/create-account**');
  });

  it('a page opened straight from its link loads (no blank page)', async () => {
    const { page } = ctx;
    await page.goto(`${BASE}/culture`);
    await page.getByText('Culture Corner').waitFor();
  });

  it('guests only ever read the guest-preview views, with no errors', async () => {
    const { page, problems } = ctx;
    problems.length = 0;
    const requests = [];
    page.on('request', (r) => r.url().includes('/rest/v1/') && requests.push(new URL(r.url()).pathname));
    for (const route of ['/home', '/learn', '/practice', '/talk', '/phrasebook']) {
      await page.goto(BASE + route);
      await page.waitForTimeout(2500);
    }
    const nonGuest = requests.filter((p) => !p.startsWith('/rest/v1/guest_preview_'));
    assert.deepEqual(nonGuest, [], 'guests read nothing but guest_preview_* views');
    assert.deepEqual(problems, []);
  });
});
