import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
console.log('title:', await page.title());
console.log('home h1:', (await page.locator('.hero h1').innerText()).replace(/\n/g, ' '));
await page.screenshot({ path: '/tmp/opencode/home.png', fullPage: true });

await page.locator('#load-sample').click();
await page.waitForSelector('.question-card', { timeout: 60000 });
await page.waitForTimeout(1200);

console.log('questions:', await page.locator('.nav-pill').count());
console.log('q1 prompt text:', (await page.locator('.prompt').innerText()).slice(0, 220).replace(/\n/g, ' | '));
console.log('q1 inline math images:', await page.locator('.prompt .math-inline').count());
console.log('q1 block math images:', await page.locator('.prompt .math-block img').count());
console.log('q1 choices:', await page.locator('.choice').count());
console.log('q1 choice labels:', await page.locator('.choice-label').allInnerTexts());
console.log('q1 choice body lengths:', await page.locator('.choice-body').evaluateAll((els) => els.map((e) => e.textContent.trim().length)));
console.log('q1 choice image counts:', await page.locator('.choice-body').evaluateAll((els) => els.map((e) => e.querySelectorAll('img').length)));
await page.screenshot({ path: '/tmp/opencode/q1.png', fullPage: false });

// Dump each question summary.
const summary = await page.evaluate(() => {
  const app = document.querySelector('#app');
  void app;
  return null;
});
void summary;

// Walk all questions, capturing structure + timer.
for (let i = 1; i <= 7; i++) {
  await page.locator(`.nav-pill >> nth=${i - 1}`).click();
  await page.waitForTimeout(250);
  const info = await page.evaluate(() => {
    const qn = document.querySelector('.q-number')?.textContent;
    const prompt = document.querySelector('.prompt');
    const blocks = [...(prompt?.children || [])].map((el) => el.tagName + (el.className ? '.' + el.className : ''));
    const math = prompt?.querySelectorAll('.math-inline, .math-block img').length || 0;
    const text = (prompt?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    const choices = document.querySelectorAll('.choice').length;
    const grid = !!document.querySelector('.gridin');
    return { qn, blocks, math, text, choices, grid };
  });
  console.log('Q' + i, JSON.stringify(info));
}

// Answer Q1 with the first choice, then check footer state.
await page.locator('.nav-pill >> nth=0').click();
await page.waitForTimeout(200);
await page.locator('.choice >> nth=0').click();
console.log('answered summary:', await page.locator('#nav-summary').innerText());
await page.locator('.nav-pill >> nth=2').click();
await page.waitForTimeout(200);
console.log('Q3 choice images:', await page.locator('.choice-body').evaluateAll((els) => els.map((e) => e.querySelectorAll('img').length)));

// Grid-in handling on Q3 if needed: type something.
if (await page.locator('.gridin-input').count()) {
  await page.locator('.gridin-input').fill('2.5');
  console.log('grid-in accepted 2.5');
}

// Flag a question.
await page.locator('.flag-btn').click();
console.log('flag text:', await page.locator('.flag-btn').innerText());

// Open results.
await page.locator('#review-btn').click();
await page.waitForSelector('.review-list');
console.log('review rows:', await page.locator('.review-row').count());
console.log('summary values:', await page.locator('.summary-card .value').allInnerTexts());
await page.screenshot({ path: '/tmp/opencode/results.png', fullPage: true });

// Back to questions, ensure review mode renders feedback.
await page.locator('#back-to-test').click();
await page.waitForSelector('.question-card');
console.log('feedback:', await page.locator('.feedback').count());
await page.screenshot({ path: '/tmp/opencode/review-q1.png' });

// Check answer key editor open/close.
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.locator('.test-card .btn.primary').first().click();
await page.waitForSelector('.question-card');
await page.locator('#review-btn').click();
await page.waitForSelector('#edit-key-2');
await page.locator('#edit-key-2').click();
await page.waitForSelector('.key-editor');
console.log('key rows:', await page.locator('.key-row').count());
console.log('key selects:', await page.locator('.key-row select').count(), 'key inputs:', await page.locator('.key-row input').count());
await page.screenshot({ path: '/tmp/opencode/keyeditor.png' });

console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
