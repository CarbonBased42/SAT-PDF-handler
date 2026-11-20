# TheMathOnes.pdf — App Testing Results

Generated: Thu Nov 19 2026
Source: /wsl.localhost/Ubuntu-26.04/home/iangr/TEST/TheMathOnes.pdf (1001 pages, ~54MB)
Scanner: app-scan-fast.mjs (reads parsed questions from the app's IndexedDB after PDF upload)

Total questions parsed: 995
Scan time: ~3m30s (through the actual app UI pipeline)

---

## 1. Missing Spaces Between Words (WIDESPREAD)

The most common issue: adjacent words are fused into a single token with no space
between them (e.g., "equationhas", "cargohelicopter", "tablegives",
"satisfiesthe", "systemof", "graphof", "resultis", "givensystem", "valueof").

This happens because the PDF text layer positions adjacent words with a gap
smaller than `SPACE_GAP_PT` (1.25pt), so `tokensFromLine()` concatenates them
without inserting a space token.

### Examples (first 20):
| Q | ID | Fused word | Context |
|---|----|------------|---------|
| 1 | ac472881 | equationhas | "If the equationhas infinitely many solutions" |
| 2 | 002dba45 | definedby | "Line is definedby" |
| 3 | f224df07 | cargohelicopter | "A cargohelicopter delivers" |
| 4 | 3008cfc3 | tablegives | "The tablegives the coordinates" |
| 5 | d1b66ae6 | satisfiesthe | "If satisfiesthe system" |
| 6 | cb8f449f | systemof | "The systemof equations" |
| 7 | 9b7a1b67 | graphof | "The graphof line" |
| 8 | 3cdbf026 | graphof | "The graphof the equation" |
| 9 | ff501705 | givensystem | "In the givensystem of equations" |
| 10 | 2937ef4f | binat | "cornfroma storagebinat" |
| 12 | 2b15d65f | productasa | "demandQ for a certain productasa linearfunction" |
| 13 | e25f0807 | linearequation | "The graph of the linearequation" |
| 15 | 608eeb6e | solutionto | "The solution to the givensystem" |
| 16 | be9cb6a2 | costof | "The cost of rentinga backhoefor" |
| 17 | 84664a7c | frontof | "The frontof a roller-coastercar" |

### Root cause:
In `tokensFromLine()` (src/parser.js), when two text items have a horizontal gap
< `SPACE_GAP_PT` (1.25pt), they're concatenated without a space token. The PDF
exporter positions some word pairs closer than this threshold.

### Fix needed:
Post-process text tokens in `tokensFromLine()` to split fused words using a
heuristic based on common short function words (has, by, the, of, is, to, as,
a, in, for, on) appearing at word boundaries.

---

## 2. Table Blocks (0 rendered)

No tables are rendered as table image blocks. The `Cropper.detectTableRects()`
pixel-based detection was tuned on `_5` and may not match this PDF's table
geometry. Questions like Q4 ("The table gives the coordinates...") reference
tables but render them as flattened text/math instead of image blocks.

---

## 3. Numbered Lists (2 rendered)

Questions 684 and 768 have numbered list blocks. No other numbered lists
detected in this PDF.

---

## 4. Parse Failures (3 questions)
| Q | ID | Issue |
|---|----|-------|
| 350 | p352q350 | Empty or near-empty prompt |
| 395 | p397q395 | Empty or near-empty prompt |
| 396 | p398q396 | Empty or near-empty prompt |

These questions have no recoverable prose content — possibly figure-only items
or parsing failures.

---

## 5. Hair Spaces (minimal)

The cross-item hair-space fix (`repor t` → `report`) is working. No significant
hair-space artifacts remain in the app output.

---

## Summary

| Check | Count | Status |
|-------|-------|--------|
| Total questions | 995 | ✅ |
| Missing space fusions | Many (widespread) | ⚠️ Needs fix |
| Table blocks | 0 | ⚠️ May need detector tuning |
| Numbered lists | 2 | ✅ |
| Parse failures | 3 | ⚠️ Q350, Q395, Q396 |

### Recommended Next Steps

1. **Fix missing spaces** in `tokensFromLine()` — split fused words using
   heuristic based on common short function words.
2. **Tune table detection** — adjust `Cropper.detectTableRects()` parameters
   for this PDF's table geometry.
3. **Investigate Q350, Q395, Q396** — determine if they're figure-only items
   or parsing failures.
4. All changes committed to `https://github.com/CarbonBased42/SAT-PDF-handler.git`
