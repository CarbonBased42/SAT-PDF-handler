/**
 * parser.js — turns SAT question-bank PDFs into structured questions.
 *
 * The College Board "question bank" PDF exports store prose in the text layer but
 * draw nearly all math (and sometimes entire answer choices) as vector paths.
 * There is therefore no OCR here. Instead we:
 *   1. read text items with pdf.js and rebuild lines,
 *   2. treat unusually wide horizontal gaps inside a line as inline math,
 *   3. treat unusually tall vertical gaps as display equations/figures,
 *   4. render the page once and crop those regions to tightly-trimmed images.
 *
 * That keeps the math pixel-perfect and the exercise fully client-side.
 */

import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  '../vendor/pdfjs/pdf.worker.min.mjs',
  import.meta.url,
).href;

const RENDER_SCALE = 3; // 216 dpi — enough to crop crisp math at 2x display
const MATH_GAP_PT = 5.4; // horizontal gap that signals a vector math run
const SPACE_GAP_PT = 1.25; // ordinary word gap
const INK_THRESHOLD = 245; // luminance below this counts as ink
const TRIM_PAD = 2; // pixels of breathing room around trimmed ink
const LINE_TOLERANCE = 2.4; // baseline tolerance when grouping text items

export async function parsePdf(input, { onProgress, title } = {}) {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  const questions = [];
  const pageWarnings = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    let items = [];
    try {
      const textContent = await page.getTextContent();
      items = textContent.items.filter((it) => it && typeof it.str === 'string' && it.transform);
    } catch (err) {
      pageWarnings.push(`Page ${pageNum}: could not read text layer (${err.message})`);
    }

    const cropper = new Cropper(page, viewport);
    const bands = splitQuestionBands(items);

    for (const band of bands) {
      try {
        const q = await parseQuestionBand({
          page,
          viewport,
          cropper,
          band,
          pageNum,
          number: questions.length + 1,
        });
        if (q) questions.push(q);
      } catch (err) {
        console.warn(`Failed to parse question on page ${pageNum}`, err);
        pageWarnings.push(`Page ${pageNum}: ${err.message}`);
      }
    }

    cropper.dispose();
    page.cleanup();
    onProgress?.(pageNum, doc.numPages);
  }

  const resolvedTitle = title || 'SAT Practice Set';
  const fingerprint = questions.map((q) => q.id).join('|') || resolvedTitle;
  const test = {
    id: 'test-' + hashString(fingerprint + '|' + doc.numPages + '|' + resolvedTitle),
    title: resolvedTitle,
    createdAt: Date.now(),
    pageCount: doc.numPages,
    questions,
    domains: summarizeDomains(questions),
    warnings: pageWarnings,
  };
  return test;
}

/* --------------------------------------------------------------------------
   Page / question segmentation
   -------------------------------------------------------------------------- */

function splitQuestionBands(items) {
  const lines = groupLines(items);
  const idLines = lines.filter((l) => /Question\s*ID/i.test(l.text));
  if (!idLines.length) {
    return [{ items, top: Infinity, bottom: -Infinity, idLine: null }];
  }
  idLines.sort((a, b) => b.y - a.y);
  return idLines.map((idLine, i) => {
    const next = idLines[i + 1];
    const top = idLine.y + 24;
    const bottom = next ? next.y + 18 : -Infinity;
    return {
      items: items.filter((it) => {
        const y = it.transform[5];
        return y <= top && y >= bottom;
      }),
      top,
      bottom,
      idLine,
    };
  });
}

async function parseQuestionBand({ page, viewport, cropper, band, pageNum, number }) {
  const lines = groupLines(band.items);
  if (!lines.length) return null;

  const idLine = band.idLine || lines.find((l) => /Question\s*ID/i.test(l.text)) || null;
  const id = extractQuestionId(idLine) || `p${pageNum}q${number}`;

  const headingLine =
    lines
      .filter((l) => cleanLineText(l) === 'Question' && (!idLine || l.y < idLine.y - 4))
      .sort((a, b) => b.y - a.y)[0] || null;

  const headerLine =
    lines.find(
      (l) => /Assessment/i.test(l.text) && /Difficulty/i.test(l.text),
    ) || null;

  const answerLine =
    lines
      .filter((l) => cleanLineText(l) === 'Answer' && (!headingLine || l.y < headingLine.y - 2))
      .sort((a, b) => b.y - a.y)[0] || null;

  const metadata = extractMetadata(lines, headerLine, headingLine, band);

  const labels = findChoiceLabels(lines, answerLine, headingLine);

  // Content above the answer choices.
  let contentBottom = band.bottom + 2;
  if (answerLine) contentBottom = Math.max(contentBottom, answerLine.y + 8);
  else if (labels.length) contentBottom = Math.max(contentBottom, labels[0].line.y + 9);

  const contentLines = lines
    .filter((l) => {
      if (!headingLine) return l !== idLine && l !== headerLine && l !== answerLine;
      if (l.y >= headingLine.y - 3) return false;
      if (l.y <= contentBottom) return false;
      return true;
    })
    .filter((l) => l !== answerLine && l !== idLine)
    .sort((a, b) => b.y - a.y);

  const pageWidth = viewport.width;
  const left = Math.min(
    ...[...contentLines.flatMap((l) => l.items), ...(labels[0]?.line.items || [])]
      .map((it) => it.transform[4])
      .filter((x) => Number.isFinite(x)),
    18,
  );
  const contentLeft = Number.isFinite(left) ? Math.max(12, left) : 18;
  const contentRight = pageWidth - 18;

  const baseFont = median(
    contentLines
      .flatMap((l) => l.items)
      .filter((it) => it.str.trim() && it.height > 2)
      .map((it) => it.height),
  ) || 9;

  const prompt = await buildPrompt({
    lines: contentLines,
    headingLine,
    contentBottom,
    cropper,
    left: contentLeft,
    right: contentRight,
  });

  const choices = await buildChoices({
    labels,
    lines,
    cropper,
    left: contentLeft,
    right: contentRight,
    contentBottom: band.bottom + 2,
  });

  // A question with no recoverable prose and no choices is probably a figure-only
  // item; fall back to a crop of the whole content area.
  if (!prompt.length && !choices.length && headingLine) {
    const crop = await cropper.crop({
      x0: contentLeft,
      x1: contentRight,
      yTop: headingLine.y - 4,
      yBottom: Math.max(contentBottom, band.bottom + 2),
    });
    if (crop) prompt.push({ type: 'math', ...crop });
  }

  if (!prompt.length && !choices.length) return null;

  const answerKey = extractAnswerKey(lines);

  return {
    id,
    number,
    page: pageNum,
    type: choices.length >= 2 ? 'mc' : 'grid',
    assessment: metadata.Assessment || 'SAT',
    test: metadata.Test || 'Math',
    domain: metadata.Domain || '',
    skill: metadata.Skill || '',
    difficulty: metadata.Difficulty || '',
    prompt,
    choices,
    answerKey,
    baseFont,
    plainText: contentLines.map(cleanLineText).join(' ').replace(/\s+/g, ' ').trim(),
  };
}

/* --------------------------------------------------------------------------
   Prompt & choice construction
   -------------------------------------------------------------------------- */

async function buildPrompt({ lines, headingLine, contentBottom, cropper, left, right }) {
  const blocks = [];
  let para = [];
  const flush = () => {
    if (para.length) {
      const tokens = trimTokens(para);
      if (tokens.length) blocks.push({ type: 'para', tokens });
      para = [];
    }
  };

  const gaps = [];
  for (let i = 1; i < lines.length; i++) {
    const g = lines[i - 1].y - lines[i].y;
    if (g > 3 && g < 60) gaps.push(g);
  }
  const medGap = median(gaps) || 13.8;
  const displayGap = Math.max(23, medGap * 1.72);
  const paraGap = Math.max(medGap * 1.34, 17);

  let prev = headingLine;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] || null;

    if (prev) {
      const gap = prev.y - line.y;
      if (gap > displayGap) {
        flush();
        const crop = await cropper.crop({
          x0: left,
          x1: right,
          yTop: prev.y - 4,
          yBottom: line.y + 10,
        });
        if (crop) blocks.push({ type: 'math', ...crop });
      } else if (gap > paraGap && para.length) {
        flush();
      }
    }

    const tokens = await tokensFromLine({
      line,
      prevLine: prev,
      nextLine: next,
      cropper,
      left,
      right,
    });
    if (tokens.length) {
      if (para.length) para.push({ t: 'space' });
      para.push(...tokens);
    }
    prev = line;
  }
  flush();

  // A figure or equation may sit below the final prose line.
  if (prev && contentBottom < prev.y - 26) {
    const scanBottom = Math.max(contentBottom, prev.y - 300);
    const crop = await cropper.crop({
      x0: left,
      x1: right,
      yTop: prev.y - 6,
      yBottom: scanBottom,
    });
    if (crop) blocks.push({ type: 'math', ...crop });
  }

  return blocks;
}

async function buildChoices({ labels, lines, cropper, left, right }) {
  if (labels.length < 2) return [];
  const choices = [];

  for (let i = 0; i < labels.length; i++) {
    const { label, line, labelEndX } = labels[i];
    const next = labels[i + 1];
    const nextY = next ? next.line.y : line.y - 220;
    const bandLines = lines
      .filter((l) => l.y <= line.y + 2 && l.y > nextY + 2)
      .sort((a, b) => b.y - a.y);

    const tokens = [];
    let anyText = false;
    for (let j = 0; j < bandLines.length; j++) {
      const bl = bandLines[j];
      const lineTokens = await tokensFromLine({
        line: bl,
        prevLine: null,
        nextLine: null,
        cropper,
        left: j === 0 ? labelEndX + 1.5 : left,
        right,
      });
      if (lineTokens.some((t) => t.t === 'text' && t.v.trim())) anyText = true;
      if (j > 0 && tokens.length) tokens.push({ t: 'space' });
      tokens.push(...lineTokens);
    }

    let standalone = false;
    if (!tokens.length || (!anyText && tokens.every((t) => t.t !== 'math'))) {
      const crop = await cropper.crop({
        x0: labelEndX + 2,
        x1: right,
        yTop: line.y + 10,
        yBottom: next ? next.line.y + 9.5 : line.y - 90,
      });
      if (crop) {
        tokens.length = 0;
        tokens.push({ t: 'math', ...crop });
        standalone = true;
      }
    } else if (!anyText && tokens.filter((t) => t.t === 'math').length === 1) {
      standalone = true;
    }

    choices.push({
      label,
      tokens: trimTokens(tokens),
      standalone,
    });
  }

  return choices;
}

async function tokensFromLine({ line, prevLine, nextLine, cropper, left, right }) {
  const tokens = [];
  const items = [...line.items].sort((a, b) => a.transform[4] - b.transform[4]);
  let cursor = left;

  for (const it of items) {
    const x0 = it.transform[4];
    const x1 = x0 + it.width;
    if (x1 < left - 1) continue;

    if (!it.str.trim()) {
      // Do not advance the cursor: the next real item's x position tells us how
      // wide the gap (word space or vector math) actually is.
      continue;
    }

    const gap = x0 - cursor;
    if (gap >= MATH_GAP_PT) {
      const crop = await cropper.crop(
        inlineRect(cursor + 0.6, x0 - 0.6, line, prevLine, nextLine),
      );
      if (crop) tokens.push({ t: 'math', ...crop });
      else tokens.push({ t: 'space' });
    } else if (gap >= SPACE_GAP_PT) {
      tokens.push({ t: 'space' });
    }

    const text = repairHairSpaces(it.str);
    if (text) {
      const last = tokens[tokens.length - 1];
      if (last && last.t === 'text') last.v += text;
      else tokens.push({ t: 'text', v: text });
    }
    cursor = Math.max(cursor, x1);
  }

  return trimTokens(tokens);
}

// The question-bank exporter sometimes writes a hair-space glyph between two
// letters ("ver tex", "four th"); pdf.js faithfully reports it as a space. Text
// items are otherwise one word each, so collapse these micro-spaces unless the
// left-hand fragment is a common standalone word.
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
  return text.replace(/([A-Za-z]{2,}) +([A-Za-z]{2,})/g, (match, left, right) => {
    if (STANDALONE_WORDS.has(left.toLowerCase())) return match;
    return left + right;
  });
}

function inlineRect(x0, x1, line, prevLine, nextLine) {
  const y = line.y;
  let yTop = y + 10;
  let yBottom = y - 13.5;
  if (prevLine && prevLine.y > y) yTop = Math.min(yTop, prevLine.y - 3.5);
  if (nextLine && nextLine.y < y) yBottom = Math.max(yBottom, nextLine.y + 9.5);
  return {
    x0: Math.max(0, x0),
    x1: Math.max(x0 + 2, x1),
    yTop,
    yBottom,
  };
}

/* --------------------------------------------------------------------------
   Metadata / labels / answer key
   -------------------------------------------------------------------------- */

function extractMetadata(lines, headerLine, headingLine, band) {
  if (!headerLine) return {};
  const names = ['Assessment', 'Test', 'Domain', 'Skill', 'Difficulty'];
  const cols = [];
  for (const name of names) {
    const item = headerLine.items.find((it) => it.str.trim() === name);
    if (item) cols.push({ name, x: item.transform[4] });
  }
  if (!cols.length) return {};
  cols.sort((a, b) => a.x - b.x);

  const dataItems = lines
    .filter((l) => l.y < headerLine.y - 4)
    .filter((l) => (headingLine ? l.y > headingLine.y + 1 : l.y > (band.bottom ?? -Infinity)))
    .flatMap((l) => l.items)
    .filter((it) => it.str.trim());

  const out = {};
  for (let i = 0; i < cols.length; i++) {
    const start = cols[i].x - 4;
    const end = cols[i + 1] ? cols[i + 1].x - 4 : Infinity;
    const items = dataItems.filter((it) => {
      const x = it.transform[4];
      return x >= start && x < end;
    });
    if (!items.length) continue;
    items.sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
    let text = '';
    let lastY = null;
    let cursor = null;
    for (const it of items) {
      const x = it.transform[4];
      const y = it.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > LINE_TOLERANCE) {
        text += ' ';
        cursor = null;
      } else if (cursor !== null && x - cursor > 1.6) {
        text += ' ';
      }
      text += it.str;
      cursor = x + it.width;
      lastY = y;
    }
    out[cols[i].name] = text.replace(/\s+/g, ' ').trim();
  }
  return out;
}

function findChoiceLabels(lines, answerLine, headingLine) {
  const candidates = [];
  for (const line of lines) {
    const text = cleanLineText(line);
    const m = text.match(/^([A-H])[.)]\s*/);
    if (!m) continue;
    if (line.x0 > 110) continue;
    if (headingLine && line.y >= headingLine.y - 2) continue;
    if (answerLine && line.y >= answerLine.y - 2) continue;
    const labelEndX = labelEnd(line, m[1]);
    candidates.push({ label: m[1], line, labelEndX });
  }
  candidates.sort((a, b) => b.line.y - a.line.y);

  // Find the longest run that starts at A and increments alphabetically.
  let best = [];
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].label !== 'A') continue;
    const run = [candidates[i]];
    for (let j = i + 1; j < candidates.length; j++) {
      const expected = String.fromCharCode(run[run.length - 1].label.charCodeAt(0) + 1);
      if (candidates[j].label === expected) run.push(candidates[j]);
      else if (candidates[j].label === 'A') break;
    }
    if (run.length > best.length) best = run;
  }
  return best.length >= 2 ? best : [];
}

function labelEnd(line, label) {
  let text = '';
  let end = line.x0;
  const sorted = [...line.items].sort((a, b) => a.transform[4] - b.transform[4]);
  for (const it of sorted) {
    text += it.str;
    end = it.transform[4] + it.width;
    if (new RegExp(`^\\s*${label}\\s*[.)]\\s*$`, 'i').test(text)) break;
    if (text.trim().length > 3) break;
  }
  return end;
}

function extractQuestionId(line) {
  if (!line) return null;
  const text = cleanLineText(line);
  const m = text.match(/Question\s*ID\s*:?\s*([A-Za-z0-9_-]{4,})/i);
  return m ? m[1] : null;
}

function extractAnswerKey(lines) {
  for (const line of lines) {
    const text = cleanLineText(line);
    const m = text.match(/(?:correct\s+answer|answer\s+key)\s*[:\-–]?\s*([A-H])\b/i);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

/* --------------------------------------------------------------------------
   Line grouping helpers
   -------------------------------------------------------------------------- */

function groupLines(items) {
  const sorted = [...items]
    .filter((it) => it && it.transform && typeof it.str === 'string')
    .sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);

  const lines = [];
  for (const it of sorted) {
    const y = it.transform[5];
    let line = lines.find((l) => Math.abs(l.y - y) <= LINE_TOLERANCE);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push(it);
  }

  for (const line of lines) {
    line.items.sort((a, b) => a.transform[4] - b.transform[4]);
    line.text = line.items.map((it) => it.str).join('');
    const xs = line.items
      .filter((it) => it.str.trim())
      .map((it) => it.transform[4]);
    const xe = line.items
      .filter((it) => it.str.trim())
      .map((it) => it.transform[4] + it.width);
    line.x0 = xs.length ? Math.min(...xs) : 0;
    line.x1 = xe.length ? Math.max(...xe) : 0;
  }

  lines.sort((a, b) => b.y - a.y);
  return lines;
}

function cleanLineText(line) {
  return (line.text || '').replace(/\s+/g, ' ').trim();
}

function trimTokens(tokens) {
  const out = [];
  let pendingSpace = false;
  for (const t of tokens) {
    if (!t) continue;
    if (t.t === 'space') {
      pendingSpace = true;
      continue;
    }
    if (t.t === 'text') {
      const v = String(t.v ?? '');
      if (!v.length) continue;
      if (pendingSpace && out.length) out.push({ t: 'space' });
      const last = out[out.length - 1];
      if (last && last.t === 'text') last.v += v;
      else out.push({ t: 'text', v });
      pendingSpace = false;
    } else {
      if (pendingSpace && out.length) out.push({ t: 'space' });
      out.push(t);
      pendingSpace = false;
    }
  }
  // Drop leading/trailing spaces.
  while (out.length && out[0].t === 'space') out.shift();
  while (out.length && out[out.length - 1].t === 'space') out.pop();
  if (out.length && out[0].t === 'text') out[0].v = out[0].v.replace(/^\s+/, '');
  if (out.length && out[out.length - 1].t === 'text') {
    out[out.length - 1].v = out[out.length - 1].v.replace(/\s+$/, '');
  }
  return out.filter((t) => t.t !== 'text' || t.v.length);
}

/* --------------------------------------------------------------------------
   Canvas cropping
   -------------------------------------------------------------------------- */

class Cropper {
  constructor(page, viewport) {
    this.page = page;
    this.pageWidth = viewport.width;
    this.pageHeight = viewport.height;
    this.scale = RENDER_SCALE;
    this.canvas = null;
    this.ctx = null;
    this.renderPromise = null;
  }

  async ensure() {
    if (this.canvas) return;
    if (this.renderPromise) return this.renderPromise;
    this.renderPromise = (async () => {
      const vp = this.page.getViewport({ scale: this.scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await this.page.render({ canvasContext: ctx, viewport: vp, background: '#ffffff' })
        .promise;
      this.canvas = canvas;
      this.ctx = ctx;
    })();
    return this.renderPromise;
  }

  async crop(rect) {
    if (!rect) return null;
    if (rect.x1 - rect.x0 < 1.5 || rect.yTop - rect.yBottom < 1.5) return null;
    await this.ensure();

    let x = Math.floor(rect.x0 * this.scale);
    let y = Math.floor((this.pageHeight - rect.yTop) * this.scale);
    let w = Math.ceil((rect.x1 - rect.x0) * this.scale);
    let h = Math.ceil((rect.yTop - rect.yBottom) * this.scale);

    // Clamp to the rendered canvas.
    if (x < 0) {
      w += x;
      x = 0;
    }
    if (y < 0) {
      h += y;
      y = 0;
    }
    w = Math.min(w, this.canvas.width - x);
    h = Math.min(h, this.canvas.height - y);
    if (w < 3 || h < 3) return null;

    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    tctx.fillStyle = '#ffffff';
    tctx.fillRect(0, 0, w, h);
    tctx.drawImage(this.canvas, x, y, w, h, 0, 0, w, h);

    const image = tctx.getImageData(0, 0, w, h).data;
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let yy = 0; yy < h; yy++) {
      const row = yy * w * 4;
      for (let xx = 0; xx < w; xx++) {
        const i = row + xx * 4;
        const lum =
          0.299 * image[i] + 0.587 * image[i + 1] + 0.114 * image[i + 2];
        if (lum < INK_THRESHOLD) {
          if (xx < minX) minX = xx;
          if (xx > maxX) maxX = xx;
          if (yy < minY) minY = yy;
          if (yy > maxY) maxY = yy;
        }
      }
    }
    if (maxX < 0) return null;

    minX = Math.max(0, minX - TRIM_PAD);
    minY = Math.max(0, minY - TRIM_PAD);
    maxX = Math.min(w - 1, maxX + TRIM_PAD);
    maxY = Math.min(h - 1, maxY + TRIM_PAD);

    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;
    const out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    const octx = out.getContext('2d');
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, cw, ch);
    octx.drawImage(tmp, minX, minY, cw, ch, 0, 0, cw, ch);

    return {
      src: out.toDataURL('image/png'),
      w: cw / this.scale,
      h: ch / this.scale,
    };
  }

  dispose() {
    if (this.canvas) {
      this.canvas.width = 0;
      this.canvas.height = 0;
    }
    this.canvas = null;
    this.ctx = null;
  }
}

/* --------------------------------------------------------------------------
   Small utils
   -------------------------------------------------------------------------- */

function median(values) {
  const arr = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!arr.length) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function summarizeDomains(questions) {
  const counts = new Map();
  for (const q of questions) {
    if (!q.domain) continue;
    counts.set(q.domain, (counts.get(q.domain) || 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}
