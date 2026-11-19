import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });

const out = await page.evaluate(async () => {
  const pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  const buf = await (await fetch('/sample/sat-math-sample.pdf')).arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
  const page1 = await doc.getPage(1);
  const tc = await page1.getTextContent();
  const items = tc.items
    .filter((it) => it.str && it.transform)
    .map((it) => ({
      str: it.str,
      x: +it.transform[4].toFixed(2),
      y: +it.transform[5].toFixed(2),
      w: +it.width.toFixed(2),
      h: +it.height.toFixed(2),
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  // Print lines with gaps
  const lines = [];
  for (const it of items) {
    let line = lines.find((l) => Math.abs(l.y - it.y) < 2.4);
    if (!line) {
      line = { y: it.y, items: [] };
      lines.push(line);
    }
    line.items.push(it);
  }
  return lines.sort((a, b) => b.y - a.y).map((l) => {
    const its = l.items.sort((a, b) => a.x - b.x);
    let prevEnd = null;
    const parts = its.map((it) => {
      const gap = prevEnd === null ? null : +(it.x - prevEnd).toFixed(2);
      prevEnd = it.x + it.w;
      return { s: it.str, x: it.x, w: it.w, gap };
    });
    return { y: +l.y.toFixed(2), parts };
  });
});

for (const line of out) {
  const text = line.parts.map((p) => p.s).join('');
  if (!text.trim()) continue;
  console.log('LINE y=' + line.y + ' :: ' + JSON.stringify(text));
  if (/ver|tex|where|intercept/i.test(text)) {
    for (const p of line.parts) console.log('   ', JSON.stringify(p));
  }
}
await browser.close();
