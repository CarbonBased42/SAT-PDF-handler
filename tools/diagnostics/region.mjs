import { chromium } from 'playwright-core';
import fs from 'node:fs';
const PDF = process.argv[2];
const pageNo = Number(process.argv[3] || 1);
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
const b64 = Buffer.from(fs.readFileSync(PDF)).toString('base64');
const rows = await page.evaluate(async ({ b64, pageNo }) => {
  const pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const pg = await doc.getPage(pageNo);
  const S = 2;
  const vp = pg.getViewport({ scale: S });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
  await pg.render({ canvasContext: ctx, viewport: vp, background: '#fff' }).promise;
  const W = canvas.width, H = canvas.height;
  const d = ctx.getImageData(0,0,W,H).data;
  const out = [];
  for (let band = 0; band < H; band += 20) {
    let n = 0, x1 = Infinity, x2 = -Infinity;
    for (let y = band; y < Math.min(H, band+20); y++) {
      for (let x = 0; x < W; x++) {
        const i = (y*W+x)*4;
        const lum = 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
        if (lum < 225) { n++; if (x<x1) x1=x; if (x>x2) x2=x; }
      }
    }
    if (n) out.push({ y1: band, y2: Math.min(H,band+20), yPt: +(792 - band/S).toFixed(0), n, x1, x2 });
  }
  return out;
}, { b64, pageNo });
for (const r of rows) console.log(`py ${r.y1}-${r.y2} (~${r.yPt}pt) dark=${r.n} x=${r.x1}..${r.x2}`);
await browser.close();
