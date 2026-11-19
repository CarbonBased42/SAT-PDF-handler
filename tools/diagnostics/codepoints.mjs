import { chromium } from 'playwright-core';
import fs from 'node:fs';
const PDF = process.argv[2];
const pageNo = Number(process.argv[3] || 1);
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
const b64 = Buffer.from(fs.readFileSync(PDF)).toString('base64');
const out = await page.evaluate(async ({ b64, pageNo }) => {
  const pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const pg = await doc.getPage(pageNo);
  const tc = await pg.getTextContent();
  return tc.items
    .filter((it) => it.str && /repor|bir|propor|andom|ver |four/.test(it.str))
    .map((it) => ({ s: it.str, codes: [...it.str].map((ch) => ch.codePointAt(0).toString(16)) }));
}, { b64, pageNo });
console.log(JSON.stringify(out, null, 1));
await browser.close();
