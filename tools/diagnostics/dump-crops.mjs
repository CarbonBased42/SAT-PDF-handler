import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const dir = '/tmp/opencode/crops';
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.locator('#load-sample').click();
await page.waitForSelector('.question-card');
await page.waitForTimeout(400);

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

const save = (name, dataUrl) => {
  const base64 = dataUrl.split(',')[1];
  const file = path.join(dir, name + '.png');
  fs.writeFileSync(file, Buffer.from(base64, 'base64'));
  return file;
};

const manifest = [];
for (const q of test.questions) {
  let mi = 0;
  const seen = new Set();
  const record = (label, crop) => {
    if (!crop || seen.has(crop.src)) return;
    seen.add(crop.src);
    const file = save(`${q.number}-${label}-${mi++}`, crop.src);
    manifest.push({ file, q: q.number, label, w: crop.w, h: crop.h });
  };
  for (const b of q.prompt) {
    if (b.type === 'para') {
      for (const t of b.tokens) if (t.t === 'math') record('prompt', t);
    } else if (b.type === 'math') {
      record('block', b);
    }
  }
  for (const c of q.choices) {
    for (const t of c.tokens) if (t.t === 'math') record(`choice-${c.label}`, t);
  }
}
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('wrote', manifest.length, 'crops');
for (const m of manifest) console.log(m.file.replace(dir + '/', ''), `${m.w.toFixed(1)}x${m.h.toFixed(1)}`, m.label);
await browser.close();
