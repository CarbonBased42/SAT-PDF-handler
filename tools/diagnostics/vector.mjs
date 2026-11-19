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
  const res = {};
  for (const p of pages) {
    const pg = await doc.getPage(p);
    const vp = pg.getViewport({ scale: 1 });
    const ops = await pg.getOperatorList();
    const segs = [];
    let path = null;
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];
      if (fn === pdfjs.OPS.constructPath) {
        // args: [opsArray, coordsArray, minMax?]
        const [opList, coords] = args;
        let k = 0;
        let cx = 0, cy = 0;
        const pts = [];
        for (const op of opList) {
          if (op === pdfjs.OPS.rectangle) {
            const [x, y, w, h] = coords.slice(k, k + 4);
            k += 4;
            pts.push([x, y], [x + w, y], [x + w, y + h], [x, y + h]);
          } else if (op === pdfjs.OPS.moveTo) {
            cx = coords[k]; cy = coords[k + 1]; k += 2;
            pts.push([cx, cy]);
          } else if (op === pdfjs.OPS.lineTo) {
            cx = coords[k]; cy = coords[k + 1]; k += 2;
            pts.push([cx, cy]);
          } else if (op === pdfjs.OPS.curveTo) {
            k += 6;
          } else if (op === pdfjs.OPS.curveTo2 || op === pdfjs.OPS.curveTo3) {
            k += 4;
          } else if (op === pdfjs.OPS.closePath) {
            // ignore
          }
        }
        if (pts.length) segs.push(pts);
      }
    }
    // Flatten segments and find axis-aligned long lines.
    const h = [];
    const v = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pts of segs) {
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        minX = Math.min(minX, x1, x2); maxX = Math.max(maxX, x1, x2);
        minY = Math.min(minY, y1, y2); maxY = Math.max(maxY, y1, y2);
        if (Math.abs(y1 - y2) < 0.5 && Math.abs(x1 - x2) > 30) h.push({ y: +vp.height - (y1 + y2) / 2, x1: Math.min(x1, x2), x2: Math.max(x1, x2) });
        if (Math.abs(x1 - x2) < 0.5 && Math.abs(y1 - y2) > 8) v.push({ x: +((x1 + x2) / 2), y1: Math.min(y1, y2), y2: Math.max(y1, y2) });
      }
    }
    res[p] = { paths: segs.length, hLines: h.length, vLines: v.length, h: h.slice(0, 80), v: v.slice(0, 40) };
  }
  return res;
}, { b64, pages });

for (const [p, r] of Object.entries(out)) {
  console.log(`PAGE ${p}: paths=${r.paths} h=${r.hLines} v=${r.vLines}`);
  console.log('  H:', r.h.map((l) => `y${l.y.toFixed(0)}(${l.x1.toFixed(0)}-${l.x2.toFixed(0)})`).join(' '));
  console.log('  V:', r.v.map((l) => `x${l.x.toFixed(0)}(${l.y1.toFixed(0)}-${l.y2.toFixed(0)})`).join(' '));
}
await browser.close();
