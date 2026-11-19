import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.locator('#load-sample').click();
await page.waitForSelector('.question-card');
await page.waitForTimeout(600);

// Leave to the home screen so the running timer stops overwriting the session.
await page.locator('#go-home').click();
await page.locator('.modal-foot .btn.primary').click();
await page.waitForSelector('.test-card');

// Rewrite the saved session to leave 2 seconds on the clock.
await page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('sb:session:'));
  const s = JSON.parse(localStorage.getItem(key));
  s.timeLeft = 2;
  localStorage.setItem(key, JSON.stringify(s));
});

await page.locator('.test-card .btn.primary').first().click();
await page.waitForSelector('.question-card');
const start = Date.now();
await page.waitForSelector('.review-list', { timeout: 15000 });
const elapsed = ((Date.now() - start) / 1000).toFixed(1);
const summary = await page.locator('.summary-card .value').allInnerTexts();
console.log(`PASS  timer expiry submits results after ~${elapsed}s`, JSON.stringify(summary));
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
