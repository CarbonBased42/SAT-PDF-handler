import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
const out = await page.evaluate(async () => {
  const pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  const buf = await (await fetch('/sample/sat-math-sample.pdf')).arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
  const found = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    tc.items.forEach((it) => {
      if (typeof it.str === 'string' && /\S\s+\S/.test(it.str) && it.transform[5] > 200) {
        found.push({ p, str: it.str, x: +it.transform[4].toFixed(1), y: +it.transform[5].toFixed(1), w: +it.width.toFixed(2) });
      }
    });
  }
  return found;
});
for (const f of out) console.log(JSON.stringify(f));
await browser.close();
