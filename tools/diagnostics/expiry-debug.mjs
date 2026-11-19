import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.locator('#load-sample').click();
await page.waitForSelector('.question-card');
await page.waitForTimeout(800);
console.log('keys before:', await page.evaluate(() => Object.keys(localStorage)));
console.log('session:', await page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('sb:session:'));
  return { key, raw: key && localStorage.getItem(key) };
}));
await page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('sb:session:'));
  const s = JSON.parse(localStorage.getItem(key));
  s.timeLeft = 2;
  localStorage.setItem(key, JSON.stringify(s));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);
console.log('cards:', await page.locator('.test-card').count());
console.log('card buttons:', await page.locator('.test-card .btn.primary').allInnerTexts());
await page.locator('.test-card .btn.primary').first().click();
await page.waitForSelector('.question-card');
console.log('timer after open:', await page.locator('#timer').innerText());
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(1000);
  console.log(
    't+' + (i + 1),
    'timer=', await page.locator('#timer').innerText(),
    'reviewList=', await page.locator('.review-list').count(),
    'testCard=', await page.locator('.question-card').count(),
  );
}
await browser.close();
