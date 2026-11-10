// Shared setup for the browser journeys (npm run test:e2e). They run against
// a deployed or locally served web build — E2E_BASE, default the live site —
// and only look: no counted items are opened beyond what a visitor would, and
// Talk is never started. Logins come from the environment, never the repo.
import { chromium } from 'playwright-core';

export const BASE = (process.env.E2E_BASE ?? 'https://learn-tunisian.expo.app').replace(/\/$/, '');

const login = (prefix) => {
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  return email && password ? { email, password } : null;
};

/** Signed-in journeys run only when their logins are set (E2E_FREE_* / E2E_PREMIUM_*). */
export const ACCOUNTS = { free: login('E2E_FREE'), premium: login('E2E_PREMIUM') };

/**
 * A phone-sized page that records console errors, crashes and failed
 * requests. E2E_BROWSER_CHANNEL picks an installed browser ("msedge",
 * "chrome"); without it, the Chromium installed by
 * `npx playwright-core install chromium` is used.
 */
export async function openPage({ colorScheme = 'light', width = 390, height = 844 } = {}) {
  const browser = await chromium.launch({ headless: true, channel: process.env.E2E_BROWSER_CHANNEL || undefined });
  const page = await browser.newPage({ viewport: { width, height }, colorScheme });
  const problems = [];
  page.on('pageerror', (e) => problems.push(`crash: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url().split('?')[0]}`));
  page.on('dialog', (d) => d.accept());
  return { browser, page, problems };
}

export async function startGuest(page) {
  await page.goto(`${BASE}/welcome`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/welcome`);
  await page.getByRole('button', { name: 'Try a free lesson' }).click();
  await page.getByRole('button', { name: "Yes, I'm 18 or older" }).click();
  await page.waitForURL('**/home');
}

export async function signIn(page, { email, password }) {
  await page.goto(`${BASE}/auth/sign-in`);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 20000 });
}

export const bodyText = (page) => page.locator('body').innerText();

/**
 * Waits (up to `timeout`) until `read()` returns `expected` — screens settle
 * after access and data load, so a single early read can be wrong.
 */
export async function eventually(read, expected, { timeout = 10000, interval = 250 } = {}) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    last = await read();
    if (last === expected) return last;
    await new Promise((r) => setTimeout(r, interval));
  }
  return last;
}
