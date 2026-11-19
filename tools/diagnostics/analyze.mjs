import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.locator('#load-sample').click();
await page.waitForSelector('.question-card');
await page.waitForTimeout(500);

const test = await page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('sat-bluebook', 1);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return await new Promise((res, rej) => {
    const r = db.transaction('tests', 'readonly').objectStore('tests').getAll();
    r.onsuccess = () => res(r.result[0]);
    r.onerror = () => rej(r.error);
  });
});

const compact = (tokens) =>
  tokens
    .map((t) => (t.t === 'text' ? t.v : t.t === 'space' ? '␠' : `[MATH ${t.w.toFixed(1)}x${t.h.toFixed(1)}]`))
    .join('');

console.log('TEST', test.title, 'pages', test.pageCount, 'questions', test.questions.length, 'warnings', test.warnings);
for (const q of test.questions) {
  console.log('\n=== Q' + q.number, q.id, q.type, q.domain, '/', q.skill, '/', q.difficulty, 'baseFont', q.baseFont?.toFixed?.(2));
  for (const b of q.prompt) {
    if (b.type === 'para') console.log('  P:', compact(b.tokens));
    else console.log(`  MATH BLOCK: ${b.w.toFixed(1)}x${b.h.toFixed(1)} data=${(b.src.length / 1024).toFixed(0)}kb`);
  }
  for (const c of q.choices) console.log(`  ${c.label}: ${compact(c.tokens)}${c.standalone ? ' (standalone)' : ''}`);
}

// Layout checks on the first question.
const layout = await page.evaluate(() => {
  const out = {};
  out.docOverflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  out.pane = (() => { const e = document.querySelector('.question-pane'); const r = e.getBoundingClientRect(); return { w: r.width, scrollW: e.scrollWidth, scrollH: e.scrollHeight, clientH: e.clientHeight }; })();
  out.tools = (() => { const e = document.querySelector('.tools'); const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; })();
  out.iframe = (() => { const f = document.querySelector('#calc-host iframe'); if (!f) return null; const r = f.getBoundingClientRect(); return { w: r.width, h: r.height, src: f.src }; })();
  out.card = (() => { const e = document.querySelector('.question-card'); const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; })();
  out.math = [...document.querySelectorAll('.prompt img, .choice img')].map((img) => {
    const r = img.getBoundingClientRect();
    return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), naturalW: img.naturalWidth, naturalH: img.naturalHeight, complete: img.complete };
  });
  return out;
});
console.log('\nLAYOUT', JSON.stringify(layout, null, 2));

await page.locator('#review-btn').click();
await page.waitForSelector('.review-list');
const resultsLayout = await page.evaluate(() => {
  const out = {};
  out.docOverflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  out.rows = [...document.querySelectorAll('.review-row')].map((r) => {
    const b = r.getBoundingClientRect();
    return { w: +b.width.toFixed(0), scrollW: r.scrollWidth };
  });
  out.pageScrollW = document.documentElement.scrollWidth;
  out.pageClientW = document.documentElement.clientWidth;
  return out;
});
console.log('\nRESULTS LAYOUT', JSON.stringify(resultsLayout));
console.log('ERRORS', errors.length ? errors : 'none');
await browser.close();
