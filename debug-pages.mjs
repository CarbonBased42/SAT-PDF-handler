/**
 * debug-pages.mjs — dump raw text from first few pages of TheMathOnes.pdf
 */

if (!Promise.withResolvers) {
  Promise.withResolvers = () => {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

const fs = await import('node:fs');
const pdfjsLib = await import('./vendor/pdfjs/pdf.min.mjs');

const PDF = '/wsl.localhost/Ubuntu-26.04/home/iangr/TEST/TheMathOnes.pdf';

async function main() {
  const data = fs.readFileSync(PDF);
  const bytes = new Uint8Array(data);
  const doc = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
  console.log(`Total pages: ${doc.numPages}`);

  for (let p = 1; p <= Math.min(5, doc.numPages); p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.filter((it) => it && typeof it.str === 'string' && it.transform && it.str.trim());
    console.log(`\n=== PAGE ${p} (${items.length} text items) ===`);
    // Sort by y (top to bottom), then x
    items.sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
    for (const it of items.slice(0, 30)) {
      const y = +it.transform[5].toFixed(0);
      const x = +it.transform[4].toFixed(0);
      console.log(`  y=${y} x=${x} "${it.str.trim().slice(0, 60)}"`);
    }
    if (items.length > 30) console.log(`  ... and ${items.length - 30} more items`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
