# TheMathOnes.pdf — Parsing Test Results

Generated: Thu Nov 19 2026
Source: /wsl.localhost/Ubuntu-26.04/home/iangr/TEST/TheMathOnes.pdf
Total pages: 1001
Questions found: 995
Scanner: fast-scan.mjs (text-level pdf.js extraction, no rendering)

---

## 1. Hair-Space Artifacts (5 potential issues)

Words split across separate text items with a hair space between them. The
parser now handles cross-item splits via post-processing in `tokensFromLine()`,
but a few edge cases remain.

### Potential issues:
| Page | Question ID | Line (truncated) | Assessment |
|------|-------------|------------------|------------|
| 146 | 789975b7 | ...poundsofFer tilizerB? | "Fer tilizer" → "Fertilizer" (real hair space) |
| 225 | 029c2dc2 | ...consistofquestionswor | Likely line cut-off, not a hair space |
| 488 | 2683b5db | ...proper tytax? | "proper ty" → "property" (real hair space) |
| 608 | 8705ecba | ...shir tis$20... | Could be "shirt is" (correct) or "shir tis" (hair space) |
| 748 | a067c926 | Numberof students | Normal inter-word space, not a hair space |

### Likely real issues: 2 (pages 146, 488)

---

## 2. Table-Like Lines (681 potential false positives)

Lines with 2+ wide gaps between short tokens. Most are NOT actual tables —
they are math equations where variables and numbers are separated by wide gaps
(vector math rendered as separate text items).

### Examples (first 5):
| Page | Question ID | Line |
|------|-------------|------|
| 1 | ac472881 | Inthegivenequation,andareconstants,and.Iftheequationhasinfinitelymanysolutions,whatisthevalueof? |
| 2 | 002dba45 | Lineisdefinedby.Lineisperpendiculartolineinthexy-plane.Whatistheslopeofline? |
| 4 | 308084c5 | Thetablegivesthecoordinatesoftwopointsonalineinthexy-plane... |
| 7 | 9b7a1b67 | Thegraphoflineisshowninthexy-plane.Line(notshown)isdefinedby... |
| 8 | 3cdbf026 | Thegraphoftheequationisalineinthexy-plane,whereaandkareconstants... |

### Assessment:
False positives from the text-gap heuristic. Actual ruled tables need
pixel-level detection via `Cropper.detectTableRects()`. The existing
detector was tuned on `_5` and may need adjustment for this PDF's table
geometry.

---

## 3. Numbered-List Markers (0 found)

No lines matching `^\d+[.)]\s` indented past the left margin were found.
This PDF does not appear to contain numbered-list questions.

---

## 4. Wide Math Gaps (2,760 total)

Expected — vector math is rendered as separate text items with wide
horizontal gaps. These are correctly handled by the existing math-crop
logic in `tokensFromLine()`.

---

## Summary

| Check | Count | Status |
|-------|-------|--------|
| Total pages | 1,001 | ✅ |
| Questions parsed | 995 | ✅ |
| Hair-space artifacts | ~2 real | ⚠️ Minor (Fer tilizer, proper ty) |
| Table-like lines | 681 | Mostly false positives |
| Numbered lists | 0 | Not present |
| Wide math gaps | 2,760 | Expected (vector math) |

---

## Parser fixes already applied (src/parser.js)

1. **Cross-item hair-space merge**: `tokensFromLine()` now post-processes the
   token stream to merge text tokens separated by a single space where both
   sides are letter fragments and the left is not a standalone word. Fixes
   "cer tain", "shir ts", "transpor t", etc. across separate items.

2. **Table detection**: `Cropper.detectTableRects()` detects ruled table
   regions via pixel line analysis and emits `{type:'table', ...}` blocks.

3. **Numbered lists**: `buildPrompt()` detects `1.`/`2.`/`3.` marker lines
   and emits `{type:'list', ordered:true, items:[]}` blocks.

4. **Inline math spacing**: `.math-inline` left margin increased from
   `0.04em` to `0.14em`.

5. **Hair spaces**: `repairHairSpaces()` extended to handle one-letter right
   fragments ("bir th" → "birth"); applied in `cleanLineText` and
   `extractMetadata`.

---

## Recommended Next Steps

1. Run the full app against TheMathOnes.pdf and visually inspect output
   (especially pages 146, 488, 608 for hair spaces).

2. Tune `Cropper.detectTableRects()` parameters for this PDF's table
   geometry if actual tables are missed.

3. All changes are committed to `https://github.com/CarbonBased42/SAT-PDF-handler.git` (branch `main`).
