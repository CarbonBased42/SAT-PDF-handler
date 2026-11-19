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
  const S = 3;
  const results = {};
  for (const p of pages) {
    const pg = await doc.getPage(p);
    const vp = pg.getViewport({ scale: S });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvasContext: ctx, viewport: vp, background: '#fff' }).promise;
    const W = canvas.width, H = canvas.height;
    const data = ctx.getImageData(0, 0, W, H).data;
    const dark = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      dark[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < 225 ? 1 : 0;
    }
    // horizontal runs
    const hRuns = [];
    for (let y = 0; y < H; y++) {
      let run = 0, start = 0;
      for (let x = 0; x <= W; x++) {
        const on = x < W && dark[y * W + x];
        if (on) { if (!run) start = x; run++; }
        else {
          if (run >= 120) hRuns.push({ y, x1: start, x2: start + run, len: run });
          run = 0;
        }
      }
    }
    // vertical runs
    const vRuns = [];
    for (let x = 0; x < W; x++) {
      let run = 0, start = 0;
      for (let y = 0; y <= H; y++) {
        const on = y < H && dark[y * W + x];
        if (on) { if (!run) start = y; run++; }
        else {
          if (run >= 45) vRuns.push({ x, y1: start, y2: start + run, len: run });
          run = 0;
        }
      }
    }
    // merge adjacent rows into one rule (borders are 1-3 px thick)
    const mergeH = (runs, tol, key, a, b) => {
      runs.sort((p, q) => p[key] - q[key]);
      const out = [];
      for (const r of runs) {
        const g = out.find((g) => Math.abs(g[key] - r[key]) <= tol && Math.min(g[b], r[b]) - Math.max(g[a], r[a]) > -8);
        if (!g) out.push({ ...r, n: 1 });
        else {
          g[a] = Math.min(g[a], r[a]);
          g[b] = Math.max(g[b], r[b]);
          g.n++;
          g[key] = (g[key] * (g.n - 1) + r[key]) / g.n;
        }
      }
      return out;
    };
    const hs = mergeH(hRuns, 2.5, 'y', 'x1', 'x2').filter((r) => r.n <= 4);
    const vs = mergeH(vRuns, 2.5, 'x', 'y1', 'y2').filter((r) => r.n <= 4);

    // candidate tables: >=3 horizontal rules, stacked, overlapping x, with vertical rules inside
    hs.sort((a, b) => a.y - b.y);
    const groups = [];
    for (const h of hs) {
      let placed = false;
      for (const g of groups) {
        const last = g.rules[g.rules.length - 1];
        const vgap = h.y - last.y;
        const overlap = Math.min(g.x2, h.x2) - Math.max(g.x1, h.x1);
        if (vgap >= 8 && vgap <= 420 && overlap >= 100) {
          g.rules.push(h);
          g.x1 = Math.min(g.x1, h.x1);
          g.x2 = Math.max(g.x2, h.x2);
          g.y1 = Math.min(g.y1, h.y);
          g.y2 = Math.max(g.y2, h.y);
          placed = true;
          break;
        }
      }
      if (!placed) groups.push({ rules: [h], x1: h.x1, x2: h.x2, y1: h.y, y2: h.y });
    }
    const tables = [];
    for (const g of groups) {
      if (g.rules.length < 3) continue;
      if (g.y2 - g.y1 < 25 * S) continue;
      if (g.x2 - g.x1 < 55 * S) continue;
      const innerV = vs.filter((v) => v.x >= g.x1 - 5 && v.x <= g.x2 + 5 && v.y1 <= g.y2 + 5 && v.y2 >= g.y1 - 5);
      if (!innerV.length) continue;
      const topPt = +(792 - g.y1 / S).toFixed(1);
      const bottomPt = +(792 - g.y2 / S).toFixed(1);
      tables.push({ x0: +(g.x1 / S - 1).toFixed(1), x1: +(g.x2 / S + 1).toFixed(1), yTop: topPt, yBottom: bottomPt, rows: g.rules.length, cols: innerV.length + 1 });
    }
    // merge overlapping tables
    const merged = [];
    for (const t of tables.sort((a, b) => b.yTop - a.yTop)) {
      const m = merged.find((m) => t.yTop <= m.yTop + 3 && t.yBottom >= m.yBottom - 3 && t.x0 >= m.x0 - 5 && t.x1 <= m.x1 + 5);
      if (m) {
        m.yTop = Math.max(m.yTop, t.yTop);
        m.yBottom = Math.min(m.yBottom, t.yBottom);
        m.x0 = Math.min(m.x0, t.x0);
        m.x1 = Math.max(m.x1, t.x1);
      } else merged.push({ ...t });
    }
    results[p] = merged;
  }
  return results;
}, { b64, pages });

for (const [p, tables] of Object.entries(out)) {
  console.log(`PAGE ${p}: ${tables.length} table(s)`);
  for (const t of tables) console.log(`   y ${t.yTop}..${t.yBottom}  x ${t.x0}..${t.x1}  (${t.rows} rows, ~${t.cols} cols)`);
}
await browser.close();
