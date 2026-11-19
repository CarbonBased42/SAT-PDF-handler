import { chromium } from 'playwright-core';
import fs from 'node:fs';

const PDF = process.argv[2];
const pages = (process.argv[3] || '1').split(',').map(Number);
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });

const data = Buffer.from(fs.readFileSync(PDF)).toString('base64');
const out = await page.evaluate(async ({ data, pages }) => {
  const pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const result = {};
  for (const p of pages) {
    const pdfPage = await doc.getPage(p);
    const tc = await pdfPage.getTextContent();
    const items = tc.items.filter((it) => it.str && it.transform && it.str.trim());
    const lines = [];
    for (const it of items) {
      const y = it.transform[5];
      let line = lines.find((l) => Math.abs(l.y - y) <= 2.4);
      if (!line) {
        line = { y, items: [] };
        lines.push(line);
      }
      line.items.push({ s: it.str, x: +it.transform[4].toFixed(1), w: +it.width.toFixed(1) });
    }
    lines.sort((a, b) => b.y - a.y);
    for (const l of lines) l.items.sort((a, b) => a.x - b.x);
    result[p] = lines.map((l) => {
      let cursor = null;
      const parts = l.items.map((it) => {
        const gap = cursor === null ? null : +(it.x - cursor).toFixed(1);
        cursor = it.x + it.w;
        return { ...it, gap };
      });
      return { y: +l.y.toFixed(1), x0: parts[0]?.x, x1: +(parts.at(-1).x + parts.at(-1).w).toFixed(1), gapCount: parts.filter((p) => p.gap >= 10).length, parts };
    });
  }
  return result;
}, { data, pages });

for (const [p, lines] of Object.entries(out)) {
  console.log(`\n##### PAGE ${p}`);
  for (const l of lines) {
    console.log(`y=${l.y} x0=${l.x0} x1=${l.x1} wideGaps=${l.gapCount}`);
    console.log('   ' + l.parts.map((p) => `${JSON.stringify(p.s)}@${p.x}${p.gap !== null ? `(g${p.gap})` : ''}`).join('  '));
  }
}
await browser.close();
