import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
for (const width of [320, 390, 768]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  const home = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    dropW: document.querySelector('.dropzone').getBoundingClientRect().width,
    heroW: document.querySelector('.hero').getBoundingClientRect().width,
  }));
  await page.locator('#load-sample').click();
  await page.waitForSelector('.question-card');
  await page.locator('#review-btn').click();
  await page.waitForSelector('.review-grid');
  const dialog = await page.evaluate(() => {
    const m = document.querySelector('.modal').getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, modalW: m.width, modalH: m.height, gridCols: getComputedStyle(document.querySelector('.review-grid')).gridTemplateColumns.split(' ').length };
  });
  await page.locator('.modal-foot .btn.primary').click();
  await page.waitForFunction(() => document.querySelector('.modal h2')?.textContent.includes('unanswered'));
  await page.locator('.modal-foot .btn.primary').click();
  await page.waitForSelector('.review-list');
  const results = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    rowW: document.querySelector('.review-row').getBoundingClientRect().width,
    listW: document.querySelector('.review-list').getBoundingClientRect().width,
  }));
  console.log(width, JSON.stringify({ home, dialog, results }));
  await ctx.close();
}
await browser.close();
