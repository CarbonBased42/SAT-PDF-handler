import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const PDF = process.argv[2];
const tag = process.argv[3] || 'pdf';
if (!PDF) throw new Error('usage: node inspect-pdf.mjs <pdf> <tag>');

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.setInputFiles('#pdf-input', PDF);
await page.waitForSelector('.question-card', { timeout: 120000 });
await page.waitForTimeout(800);

const test = await page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('sat-bluebook', 1);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const all = await new Promise((res, rej) => {
    const r = db.transaction('tests', 'readonly').objectStore('tests').getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return all.sort((a, b) => b.createdAt - a.createdAt)[0];
});

const compact = (tokens) =>
  tokens
    .map((t) => (t.t === 'text' ? t.v : t.t === 'space' ? ' ' : `⟦MATH ${t.w.toFixed(0)}x${t.h.toFixed(0)}⟧`))
    .join('');

console.log('TEST', test.title, '| questions', test.questions.length, '| warnings', JSON.stringify(test.warnings));
for (const q of test.questions) {
  console.log(`\n=== Q${q.number} ${q.id} ${q.type} | ${q.domain} / ${q.skill} / ${q.difficulty}`);
  for (const b of q.prompt) {
    if (b.type === 'para') console.log('  P:', compact(b.tokens));
    else if (b.type === 'table') console.log('  TABLE:', JSON.stringify(b.rows || b));
    else console.log(`  BLOCK ${b.type}: ${b.w ? b.w.toFixed(0) + 'x' + b.h.toFixed(0) : ''} ${b.src ? '(img)' : ''}`);
  }
  for (const c of q.choices) console.log(`  ${c.label}: ${compact(c.tokens)}${c.standalone ? ' [standalone]' : ''}`);
  if (!q.choices.length) console.log('  (grid-in)');
}

// Screenshots of each question.
const dir = `/tmp/opencode/${tag}`;
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
for (let i = 0; i < test.questions.length; i++) {
  await page.locator(`.nav-pill >> nth=${i}`).click();
  await page.waitForTimeout(250);
  await page.locator('.question-pane').screenshot({ path: path.join(dir, `q${i + 1}.png`) });
  const info = await page.evaluate(() => {
    const pane = document.querySelector('.question-pane');
    const card = document.querySelector('.question-card');
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      paneScrollX: pane ? pane.scrollWidth - pane.clientWidth : 0,
      cardW: card ? Math.round(card.getBoundingClientRect().width) : 0,
      imgs: [...document.querySelectorAll('.question-card img')].map((img) => ({
        w: Math.round(img.getBoundingClientRect().width),
        h: Math.round(img.getBoundingClientRect().height),
        nw: img.naturalWidth,
        nh: img.naturalHeight,
      })),
    };
  });
  console.log(`  Q${i + 1} layout:`, JSON.stringify(info));
}
await page.screenshot({ path: `/tmp/opencode/${tag}-page.png`, fullPage: true });
console.log('\nERRORS:', errors.length ? errors : 'none');
console.log('shots in', dir);
await browser.close();
