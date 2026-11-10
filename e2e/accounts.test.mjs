// Signed-in journeys: run only when E2E_FREE_* / E2E_PREMIUM_* are set.
// They only look (no counted items opened, no Talk), then sign out.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ACCOUNTS, BASE, bodyText, eventually, openPage, signIn } from './helpers.mjs';

for (const [name, expectPremium] of [
  ['free', false],
  ['premium', true],
]) {
  const skip = ACCOUNTS[name] ? false : `set E2E_${name.toUpperCase()}_EMAIL and _PASSWORD to run`;
  describe(`${name} account`, { skip }, () => {
    it('signs in, sees the right plan and locks, and signs out', async () => {
      const { browser, page, problems } = await openPage();
      try {
        await signIn(page, ACCOUNTS[name]);

        await page.goto(`${BASE}/profile`);
        await page.getByText('Sign out', { exact: true }).waitFor({ timeout: 15000 });
        assert.match(await bodyText(page), expectPremium ? /Premium — everything is unlocked/ : /Free plan/);

        await page.goto(`${BASE}/grammar`);
        await page.getByText('Basic Sentence Order').waitFor();
        const locks = expectPremium ? 0 : 5;
        assert.equal(await eventually(() => page.getByLabel('Premium', { exact: true }).count(), locks), locks);

        await page.goto(`${BASE}/talk`);
        const talkLocked = async () => (await bodyText(page)).includes('Talk is part of Premium');
        assert.equal(await eventually(talkLocked, !expectPremium), !expectPremium);

        await page.goto(`${BASE}/profile`);
        await page.getByRole('button', { name: 'Sign out', exact: true }).click();
        await page.waitForURL((u) => !u.pathname.startsWith('/profile'), { timeout: 15000 });
        assert.deepEqual(problems, []);
      } finally {
        await browser.close();
      }
    });
  });
}
