import { chromium } from 'playwright-core';
import fs from 'node:fs';

const PDF = process.argv[2];
const pages = (process.argv[3] || '1').split(',').map(Number);
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
const b64 = Buffer.from(fs.readFileSync(PDF)).toString('base64');

const out = await page.evaluate(async ({ b64, pages }) => {
  const pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const results = {};
  for (const p of pages) {
    const pg = await doc.getPage(p);
    const vp = pg.getViewport({ scale: 3 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvasContext: ctx, viewport: vp, background: '#fff' }).promise;
    const { width: W, height: H } = canvas;
    const data = ctx.getImageData(0, 0, W, H).data;
    const lum = (x, y) => {
      const i = (y * W + x) * 4;
      return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    };
    const TH = 220;
    const MIN_RUN = 90 * 3; // 90pt wide
    const hRows = [];
    for (let y = 0; y < H; y++) {
      let run = 0, best = 0, bestX = 0, curX = 0;
      for (let x = 0; x < W; x++) {
        if (lum(x, y) < TH) {
          if (run === 0) curX = x;
          run++;
          if (run > best) { best = run; bestX = curX; }
        } else run = 0;
      }
      if (best >= MIN_RUN) hRows.push({ y, x1: bestX, x2: bestX + best, len: best });
    }
    const MIN_V_RUN = 12 * 3;
    const vCols = [];
    for (let x = 0; x < W; x++) {
      let run = 0, best = 0, bestY = 0, curY = 0;
      for (let y = 0; y < H; y++) {
        if (lum(x, y) < TH) {
          if (run === 0) curY = y;
          run++;
          if (run > best) { best = run; bestY = curY; }
        } else run = 0;
      }
      if (best >= MIN_V_RUN) vCols.push({ x, y1: bestY, y2: bestY + best, len: best });
    }
    const group = (arr, key, tol) => {
      const gs = [];
      for (const r of arr) {
        let g = gs.find((g) => Math.abs(g[key] - r[key]) <= tol);
        if (!g) gs.push({ ...r, n: 1, y1: r.y1 ?? r.x1, y2: r.y2 ?? r.x2 });
        else {
          g.n++;
          g.y1 = Math.min(g.y1, r.y1 ?? r.x1);
          g.y2 = Math.max(g.y2, r.y2 ?? r.x2);
        }
      }
      return gs;
    };
    results[p] = {
      h: group(hRows, 'y', 2).filter((g) => g.n <= 4).map((g) => ({ y: g.y, x1: g.y1, x2: g.y2, n: g.n })),
      v: group(vCols, 'x', 2).filter((g) => g.n <= 4).map((g) => ({ x: g.x, y1: g.y1, y2: g.y2, n: g.n })),
      size: { W, H },
    };
  }
  return results;
}, { b64, pages });

for (const [p, r] of Object.entries(out)) {
  console.log(`\nPAGE ${p} (${r.size.W}x${r.size.H})`);
  console.log('H lines:', r.h.length);
  for (const l of r.h.slice(0, 60)) console.log(`  y=${l.y} x=${l.x1}..${l.x2} n=${l.n}`);
  console.log('V lines:', r.v.length);
  for (const l of r.v.slice(0, 40)) console.log(`  x=${l.x} y=${l.y1}..${l.y2} n=${l.n}`);
}
await browser.close();
