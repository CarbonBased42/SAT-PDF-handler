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

  const mul = (m1, m2) => [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  const res = {};
  for (const p of pages) {
    const pg = await doc.getPage(p);
    const vp = pg.getViewport({ scale: 1 });
    const ops = await pg.getOperatorList();
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    const hs = [];
    const vs = [];
    const boxes = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];
      if (fn === pdfjs.OPS.save) stack.push(ctm);
      else if (fn === pdfjs.OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === pdfjs.OPS.transform) ctm = mul(ctm, args);
      else if (fn === pdfjs.OPS.constructPath) {
        const [opList, coords] = args;
        let k = 0;
        let cur = null;
        const pts = [];
        for (const op of opList) {
          if (op === pdfjs.OPS.rectangle) {
            const [x, y, w, h] = coords.slice(k, k + 4);
            k += 4;
            const c = [apply(ctm, x, y), apply(ctm, x + w, y), apply(ctm, x + w, y + h), apply(ctm, x, y + h)];
            boxes.push(c);
          } else if (op === pdfjs.OPS.moveTo) {
            const [x, y] = coords.slice(k, k + 2); k += 2;
            cur = apply(ctm, x, y);
            pts.push(cur);
          } else if (op === pdfjs.OPS.lineTo) {
            const [x, y] = coords.slice(k, k + 2); k += 2;
            cur = apply(ctm, x, y);
            pts.push(cur);
          } else if (op === pdfjs.OPS.curveTo) k += 6;
          else if (op === pdfjs.OPS.curveTo2 || op === pdfjs.OPS.curveTo3) k += 4;
        }
        for (let j = 0; j + 1 < pts.length; j++) {
          const [x1, y1] = pts[j];
          const [x2, y2] = pts[j + 1];
          if (Math.abs(y1 - y2) < 0.4 && Math.abs(x1 - x2) > 40) {
            hs.push({ y: +(vp.height - (y1 + y2) / 2).toFixed(1), x1: Math.min(x1, x2), x2: Math.max(x1, x2) });
          }
          if (Math.abs(x1 - x2) < 0.4 && Math.abs(y1 - y2) > 10) {
            vs.push({ x: +((x1 + x2) / 2).toFixed(1), y1: Math.min(y1, y2), y2: Math.max(y1, y2) });
          }
        }
        for (const c of boxes) {
          const xs = c.map((q) => q[0]); const ys = c.map((q) => q[1]);
          const x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys);
          if (x2 - x1 > 40 && y2 - y1 > 8) hs.push({ y: +(vp.height - y2).toFixed(1), x1, x2, h: y2 - y1 });
        }
      }
    }
    // Cluster h lines by y
    const hGroups = [];
    for (const l of hs) {
      let g = hGroups.find((g) => Math.abs(g.y - l.y) < 1.2 && Math.abs(g.x1 - l.x1) < 6 && Math.abs(g.x2 - l.x2) < 6);
      if (!g) { g = { y: l.y, x1: l.x1, x2: l.x2 }; hGroups.push(g); }
    }
    // Candidate tables: groups of >=2 horizontal rules with similar width and overlapping x
    const cands = [];
    const sorted = hGroups.sort((a, b) => b.y - a.y);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i], b = sorted[j];
        const span = a.y - b.y;
        if (span < 8) continue;
        if (span > 400) break;
        const overlap = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
        if (overlap < 60) continue;
        const width = overlap;
        cands.push({ yTop: a.y, yBottom: b.y, x1: Math.max(a.x1, b.x1), x2: Math.min(a.x2, b.x2), width });
      }
    }
    // merge overlapping candidates
    const merged = [];
    for (const c of cands.sort((a, b) => b.yTop - a.yTop)) {
      const m = merged.find((m) => c.yTop <= m.yTop + 2 && c.yBottom >= m.yBottom - 2 && c.x1 >= m.x1 - 6 && c.x2 <= m.x2 + 6);
      if (m) { m.yTop = Math.max(m.yTop, c.yTop); m.yBottom = Math.min(m.yBottom, c.yBottom); m.x1 = Math.min(m.x1, c.x1); m.x2 = Math.max(m.x2, c.x2); }
      else merged.push({ ...c });
    }
    res[p] = merged.slice(0, 20);
  }
  return res;
}, { b64, pages });

for (const [p, rects] of Object.entries(out)) {
  console.log(`PAGE ${p}: ${rects.length} candidates`);
  for (const r of rects) console.log(`   y ${r.yTop.toFixed(1)}..${r.yBottom.toFixed(1)}  x ${r.x1.toFixed(1)}..${r.x2.toFixed(1)}  w=${r.width.toFixed(1)}`);
}
await browser.close();
