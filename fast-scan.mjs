/**
 * fast-scan.mjs — fast text-level scan of all pages in a question-bank PDF.
 * No rendering/browser needed: uses pdf.js directly to extract text content.
 * Reports: question count, hair-space artifacts, table-like text blocks,
 * numbered-list lines, wide math gaps, and metadata issues.
 */

// Polyfill Promise.withResolvers (Node 20 doesn't have it; pdf.js needs it).
if (!Promise.withResolvers) {
  Promise.withResolvers = () => {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

const fs = await import('node:fs');
const pdfjsLib = await import('./vendor/pdfjs/pdf.min.mjs');

const PDF = process.argv[2] || '/wsl.localhost/Ubuntu-26.04/home/iangr/TEST/TheMathOnes.pdf';

const STANDALONE_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'could',
  'did', 'do', 'does', 'each', 'every', 'for', 'from', 'had', 'has', 'have', 'he',
  'her', 'here', 'his', 'how', 'if', 'in', 'is', 'it', 'its', 'may', 'me', 'more',
  'most', 'must', 'my', 'no', 'not', 'of', 'on', 'one', 'only', 'or', 'other',
  'our', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their',
  'them', 'then', 'there', 'these', 'they', 'this', 'those', 'to', 'two', 'up',
  'us', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who',
  'why', 'will', 'with', 'would', 'you', 'your',
]);

function repairHairSpaces(text) {
  let out = text.replace(/([A-Za-z]{2,}) +([A-Za-z]{2,})/g, (m, l, r) =>
    STANDALONE_WORDS.has(l.toLowerCase()) ? m : l + r,
  );
  out = out.replace(/([A-Za-z]{3,}) +([A-Za-z])\b/g, (m, l, r) =>
    STANDALONE_WORDS.has(l.toLowerCase()) ? m : l + r,
  );
  return out;
}

function hasUnrepairedHairSpace(text) {
  // Within-word hair-space splits typically have a short right fragment
  // (1-8 chars). Normal inter-word spaces usually have longer right words.
  return /\b[A-Za-z]{2,} [A-Za-z]{1,8}\b/.test(text);
}

function cleanLineText(text) {
  return repairHairSpaces(text.replace(/\s+/g, ' ').trim());
}

const MATH_GAP_PT = 5.4;

async function main() {
  const data = fs.readFileSync(PDF);
  const bytes = new Uint8Array(data);
  const doc = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const totalPages = doc.numPages;
  console.log(`Total pages: ${totalPages}`);

  const questions = [];
  const hairSpaceIssues = [];
  const tableLikeLines = [];
  const numberedListLines = [];
  const wideGapIssues = [];
  let totalMathGaps = 0;

  for (let p = 1; p <= totalPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.filter((it) => it && typeof it.str === 'string' && it.transform && it.str.trim());
    if (!items.length) continue;

    // Group into lines by y baseline.
    const lines = [];
    for (const it of items) {
      const y = it.transform[5];
      let line = lines.find((l) => Math.abs(l.y - y) <= 2.4);
      if (!line) { line = { y, items: [] }; lines.push(line); }
      line.items.push(it);
    }
    for (const line of lines) {
      line.items.sort((a, b) => a.transform[4] - b.transform[4]);
      line.text = line.items.map((it) => it.str).join('');
      line.x0 = Math.min(...line.items.map((it) => it.transform[4]));
      line.x1 = Math.max(...line.items.map((it) => it.transform[4] + it.width));
    }
    lines.sort((a, b) => b.y - a.y);

    // Find Question ID line to segment questions.
    const idLineIdx = lines.findIndex((l) => /Question\s*ID/i.test(l.text));
    if (idLineIdx === -1) continue;

    const idLine = lines[idLineIdx];
    const idText = cleanLineText(idLine.text || '');
    const idMatch = idText.match(/Question\s*ID\s*:?\s*([A-Za-z0-9_-]{4,})/i);
    const qid = idMatch ? idMatch[1] : `p${p}`;

    // Find Question heading and Answer heading.
    const headingIdx = lines.findIndex((l) => cleanLineText(l.text || '') === 'Question' && l.y < idLine.y - 4);
    const answerIdx = lines.findIndex((l) => cleanLineText(l.text || '') === 'Answer' && (!headingIdx || l.y < lines[headingIdx].y - 2));

    // Content lines between heading and answer.
    const contentLines = [];
    const startY = headingIdx !== -1 ? lines[headingIdx].y - 3 : idLine.y + 24;
    const endY = answerIdx !== -1 ? lines[answerIdx].y + 8 : -Infinity;
    for (const l of lines) {
      if (l === idLine) continue;
      if (l.y >= startY) continue;
      if (l.y <= endY) continue;
      contentLines.push(l);
    }
    contentLines.sort((a, b) => b.y - a.y);

    // Scan content lines for issues.
    for (const l of contentLines) {
      const text = l.text || '';
      const cleaned = cleanLineText(text);

      // Hair-space artifacts that survived repair (check cleaned text).
      if (hasUnrepairedHairSpace(cleaned)) {
        hairSpaceIssues.push({ page: p, qid, line: cleaned.trim().slice(0, 80) });
      }

      // Table-like: line with multiple wide-separated short tokens (cells).
      const parts = l.items.filter((it) => it.str.trim());
      if (parts.length >= 3) {
        let wideGaps = 0;
        for (let k = 1; k < parts.length; k++) {
          const gap = parts[k].transform[4] - (parts[k - 1].transform[4] + parts[k - 1].width);
          if (gap >= MATH_GAP_PT) wideGaps++;
        }
        if (wideGaps >= 2 && cleaned.length < 120) {
          tableLikeLines.push({ page: p, qid, line: cleaned.slice(0, 100) });
        }
      }

      // Numbered list marker.
      if (/^\d+[.)]\s/.test(cleaned) && l.x0 > 24) {
        numberedListLines.push({ page: p, qid, line: cleaned.slice(0, 100) });
      }

      // Wide math gaps inside content.
      for (let k = 1; k < parts.length; k++) {
        const gap = parts[k].transform[4] - (parts[k - 1].transform[4] + parts[k - 1].width);
        if (gap >= MATH_GAP_PT) {
          totalMathGaps++;
          if (wideGapIssues.length < 10) {
            wideGapIssues.push({ page: p, qid, gap: +gap.toFixed(1) });
          }
        }
      }
    }

    questions.push({ page: p, qid, numContentLines: contentLines.length });
    if (p % 200 === 0) console.log(`  scanned ${p}/${totalPages} pages...`);
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Questions found: ${questions.length}`);
  console.log(`Total wide math gaps: ${totalMathGaps}`);
  console.log(`\n--- Hair-space artifacts (unrepaired): ${hairSpaceIssues.length} ---`);
  for (const h of hairSpaceIssues.slice(0, 30)) {
    console.log(`  p${h.page} ${h.qid}: "${h.line}"`);
  }
  console.log(`\n--- Table-like lines (possible missed tables): ${tableLikeLines.length} ---`);
  for (const t of tableLikeLines.slice(0, 30)) {
    console.log(`  p${t.page} ${t.qid}: "${t.line}"`);
  }
  console.log(`\n--- Numbered-list markers: ${numberedListLines.length} ---`);
  for (const n of numberedListLines.slice(0, 30)) {
    console.log(`  p${n.page} ${n.qid}: "${n.line}"`);
  }
  console.log(`\n--- Wide math gap samples: ${wideGapIssues.length} ---`);
  for (const w of wideGapIssues) {
    console.log(`  p${w.page} ${w.qid}: gap=${w.gap}pt`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
