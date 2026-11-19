import { chromium } from 'playwright-core';
import fs from 'node:fs';
const PDF = process.argv[2];
const pages = (process.argv[3] || '1').split(',').map(Number);
const outDir = process.argv[4] || '/tmp/opencode/render';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
const b64 = Buffer.from(fs.readFileSync(PDF)).toString('base64');
const urls = await page.evaluate(async ({ b64, pages }) => {
  const pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const out = [];
  for (const p of pages) {
    const pg = await doc.getPage(p);
    const vp = pg.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    await pg.render({ canvasContext: ctx, viewport: vp, background: '#fff' }).promise;
    out.push(canvas.toDataURL('image/png'));
  }
  return out;
}, { b64, pages });
urls.forEach((u, i) => fs.writeFileSync(`${outDir}/page${pages[i]}.png`, Buffer.from(u.split(',')[1], 'base64')));
console.log('wrote', urls.length, 'pages to', outDir);
await browser.close();
