import { chromium } from 'playwright-core';
import fs from 'node:fs';
const PDF = process.argv[2];
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
const b64 = Buffer.from(fs.readFileSync(PDF)).toString('base64');
const out = await page.evaluate(async ({ b64 }) => {
  const pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const res = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pg = await doc.getPage(p);
    const tc = await pg.getTextContent();
    for (const it of tc.items) if (it.str && /\s/.test(it.str)) res.push({ p, s: it.str });
  }
  return res;
}, { b64 });
const counts = new Map();
for (const r of out) counts.set(r.s, (counts.get(r.s) || 0) + 1);
console.log('distinct spaced items:', counts.size, 'total:', out.length);
for (const [s, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(n, JSON.stringify(s));
await browser.close();
