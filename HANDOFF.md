# Session handoff — SAT Bluebook practice app

_Last updated: 2026-11-14. Written so a fresh session can resume without re-diagnosing._

## Where things stand

The app is fully working for the bundled sample and is **live** at
<http://localhost:4173> (host) / <http://127.0.0.1:4173> (sandbox). The server is
already running bound to `0.0.0.0:4173`.

| Area | State |
| --- | --- |
| Sample PDF / `_4` (same file) | Good — 7 questions, all 38 interaction checks pass |
| `TheMathOnes_2_extracted_pages.pdf` | Parses to 7 questions; only cosmetic issues (inline math spacing, hair-space words) |
| `TheMathOnes_5_extracted_pages.pdf` | Parses to 12 questions; **tables are flattened into prose** on Q1, Q2, Q4, Q5, Q11; Q7 numbered statements flattened |
| Desmos | **Done** — pop-out window added (`openDesmosPopout` + `#calc-popout` button in the calc tool-head). The `?embed` URL shows only a bare graph with no expression input, so the pop-out uses the un-embedded `https://www.desmos.com/calculator` URL where the expression list is visible. Verified via Playwright: popup opens, loads the full calculator with the left-hand expression input at 1100×760. The built-in grapher remains the fallback; the panel dock still loads the iframe for the in-app Desmos tab. |
| Host access | Fixed: bind `0.0.0.0`, publish `4173:4173` |

Changes made in this session:

- `server.js` now defaults to `HOST=0.0.0.0`, prints every reachable URL, and
  prints a friendly `EADDRINUSE` message instead of a stack trace (`PORT=…` and
  `HOST=…` still override).
- `README.md` quick-start updated to match.
- Diagnostics scripts are archived in `tools/diagnostics/` (see its README).
- `test2.mjs` re-run after the server change: **all checks pass, no console errors**.

## Run / restart

```bash
cd sat-bluebook
node server.js            # → http://localhost:4173 and the container IP
pkill -f 'node server.js' # stop
```

From the host, the port must be published once:

```bash
sbx ports opencode-TEST --publish 4173:4173
```

Then open <http://localhost:4173>. If the page is unreachable, confirm the
process is listening on `0.0.0.0:4173` (not `127.0.0.1`).

## Resume checklist (in order)

1. **Table detection** — implement and integrate (details below). This is the
   big visible defect.
2. **Hair spaces** — `repor t`, `bir th`, `propor tional`, `ar ticle`, …
3. **Numbered lists** — `_5` Q7 statements 1./2./3.
4. **Inline math spacing** — `.math-inline` left margin.
5. **Desmos** — expand control + verify expression input once the network
   approval is granted.
6. Re-run `tools/diagnostics/test2.mjs`, `expiry.mjs`, `responsive.mjs` and the
   parse inspection for both new PDFs.

## Issue 1 — tables are flattened into prose (highest priority)

### Symptom (parsed output)

`_5` Q1 is typical: header cell text and row values are emitted as tiny inline
math crops inside a paragraph, e.g.

```
P: ⟦MATH 45x8⟧Subscriptions Year ⟦MATH 72x15⟧sold
P: ⟦MATH 8x22⟧2012⟦MATH 32x22⟧5,600
P: ⟦MATH 8x18⟧2013⟦MATH 32x18⟧5,880 The manager of an online news service received
   the repor t above …
```

Affected: `_5` Q1, Q2, Q4, Q5, Q11 (`_2` has no ruled tables).

### Decision

Do **not** reconstruct table cells. Detect the ruled table region and crop the
whole thing to one image block, exactly like a figure. Faithful and robust.
Skip the table's text lines when rebuilding paragraphs so nothing is duplicated.

### Detection: what was tried

- `vector.mjs` / `vector2.mjs` (PDF operator list + CTM) — **unreliable**;
  coordinates come back in unexpected spaces and the header rules on every page
  dominate. Abandoned.
- `pix.mjs` (render at scale 3, find long dark runs) — works, but the raw output
  includes glyph strokes.
- `tables.mjs` (merged pixel rules) — detects the right **bottoms**, but merges
  the assessment header block into the table because the grouping only checks
  overlap and vertical gap.

Current `tables.mjs` output for `_5`:

```
PAGE 1:  y 727.8..571.3  x 17..595  (7 rows, ~36 cols)   ← false top (header)
PAGE 2:  y 727.8..517.3  x 17..595  (9 rows, ~38 cols)   ← false top
PAGE 4:  y 727.8..577.3  x 17..595  (7 rows, ~37 cols)   ← false top
PAGE 5:  y 727.8..529.3  x 17..595  (8 rows)             ← false top
         y 178.2..13.5   x 247..343 (4 rows)             ← false positive (graphic)
         y 154.5..22.2   x 440..511 (3 rows)             ← false positive (graphic)
PAGE 11: y 727.8..447.7  x 17..595  (11 rows)            ← false top
```

Known-good geometry for page 1 (render scale 3): rules at pixel y = 429, 535,
598, 661 spanning x 63..432 → in PDF points **y 649..571.7, x 21..144**.
Rule of thumb: real table bottoms are `571.3 / 517.3 / 577.3 / 529.3 / 447.7`
for pages 1/2/4/5/11; tops must be recomputed once grouping is fixed (roughly
just above each table's header row; do not trust the 727.8 values).

### Fix plan (concrete)

Put detection in `Cropper` (`src/parser.js`), because it already renders the page
once at `RENDER_SCALE = 3`:

```js
async detectTableRects(textItems) {
  await this.ensure();
  const { width: W, height: H } = this.canvas;
  const image = this.ctx.getImageData(0, 0, W, H).data;
  // dark[] = luminance < 225
  // hRuns: horizontal dark runs >= 120 px
  // vRuns: vertical dark runs >= 45 px
  // merge runs within 2.5 px into rules (rules are 2–3 px thick)
  // group ONLY rules with similar x extents:
  //   gap 8..300 px
  //   overlap >= 0.90 * min(w1, w2)
  //   |w1 - w2| <= max(8, 0.06 * max(w1, w2))
  // keep groups with >= 3 rules, height >= 25 pt, width >= 55 pt
  // require >= 1 vertical rule inside [x1+4, x2-4] spanning >= 70% of height
  // require >= 2 non-space text items with baseline inside the rect
  //   (this kills the page-5 bottom graphic and other figure false positives)
  // return rects in points: yTop = 792 - y1/S, yBottom = 792 - y2/S
}
```

The x-extent-similarity requirement is the key: the assessment header rules are
full-width (x 18..594 pt), real table rules are ~123 pt wide.

Integration:

- Call `detectTableRects` once per page in `parseQuestionBand` (pass the page
  text items) and give the result to `buildPrompt`.
- In `buildPrompt` (`src/parser.js:236`):
  - sort table rects top→bottom;
  - when a line's baseline is inside a table band (y between `yBottom-2` and
    `yTop+2`), flush the current paragraph, emit the table block once, and skip
    that line's tokens;
  - when emitting display-math crops for tall vertical gaps, skip any crop whose
    rect intersects a table band (otherwise the table is cropped twice).
- Block shape: `{ type: 'table', src, w, h }` (same fields as `math`).
- `plainText` (`src/parser.js:218`) should exclude lines inside table bands.
- `src/app.js` `renderPrompt` (line 940): add a `type === 'table'` branch that
  renders `<figure class="math-block table-block">` with `alt="Table from the PDF"`.
- `styles.css`: add

  ```css
  .table-block img {
    width: calc(var(--mw, 200) * 1em * var(--math-scale, 0.115) * 1.25);
  }
  ```

  The `1.25` upscale is safe: crops come from a 3× (216 dpi) render. Keep
  `max-width: 100%` for narrow screens.

Validation:

```bash
cd /tmp/sat-diag   # see diagnostics setup below
node inspect-pdf.mjs /path/TheMathOnes_5_extracted_pages.pdf t5
# expect: TABLE blocks for Q1/Q2/Q4/Q5/Q11, no ⟦MATH ...⟧ sequences that are
# really table cells, and no duplicate header text in paragraphs
```

## Issue 2 — hair spaces inside words

Evidence from `codepoints.mjs` / `spaced-items.mjs`: the PDF text layer puts a
plain ASCII space inside a single text item. Across `_5`, every non-blank spaced
item is a split word (1040 items are just `" "`):

```
"repor t" ×4   "repor ted" ×4   "par ticipants" ×3   "cer tain" ×2
"bir th"       "propor tional"  "par ticular"
```

`_2`: `"ar ticle"`, `"ar ticle,"`.

`repairHairSpaces` (`src/parser.js:408`) requires **two or more** letters on both
sides, so `repor t` survives. Extend it with a one-letter right fragment:

```js
function repairHairSpaces(text) {
  let out = text.replace(/([A-Za-z]{2,}) +([A-Za-z]{2,})/g, (m, left, right) =>
    STANDALONE_WORDS.has(left.toLowerCase()) ? m : left + right,
  );
  out = out.replace(/([A-Za-z]{3,}) +([A-Za-z])\b/g, (m, left, right) =>
    STANDALONE_WORDS.has(left.toLowerCase()) ? m : left + right,
  );
  return out;
}
```

Also apply it where raw strings bypass `tokensFromLine`:

- `cleanLineText` (`src/parser.js:576`) → `repairHairSpaces(line.text || '')`;
- `extractMetadata` (`src/parser.js:433`) when appending `it.str` (fixes
  `propor tional` in the skill label and `repor t` in `plainText`).

`random` is already safe: it is two items `"r"` + `"andom"` with a negative gap,
so it concatenates without a space.

Verify with `spaced-items.mjs` (no split words remain in parsed output) and
`inspect-pdf.mjs`.

## Issue 3 — numbered statements render inline (`_5` Q7)

Page 7 lines:

```
y=579.0 x0=38.4  "1." Of all adults …
y=564.0 x0=38.4  "2." If another …
y=549.8 x0=48.0  "quality of air …"      ← continuation
y=535.5 x0=38.4  "3." If 1,000 adults …
y=521.3 x0=48.0  "of air …"               ← continuation
```

They currently end up in one paragraph because the vertical gaps are ordinary
line gaps. Plan:

- In `buildPrompt`, pre-detect ≥2 lines whose text matches `/^\d+[.)]\s/` and
  `x0 > left + 6`.
- Build items: each starts at a marker line and includes following lines until
  the next marker (continuation lines are indented further, `x0 > left + 6`).
- Emit `{ type: 'list', ordered: true, items: [tokens, …] }` in place of those
  paragraph lines, keeping the surrounding intro/outro paragraphs in order.
- `renderPrompt` (`src/app.js:940`): render `block.type === 'list'` as
  `<ol>`/`<ul>` with `<li>` + `renderTokens`. `.prompt ol/ul/li` styles already
  exist (`styles.css:639`).

Use the same machinery later for bulleted lists if another PDF needs it.

## Issue 4 — inline math is cramped

`styles.css:649`:

```css
.math-inline { margin: 0 0.04em; }
```

Math sits flush against the preceding word (`the⟦MATH⟧report`). Increase the
left side only, e.g. `margin: 0 0.06em 0 0.14em;`. Keep right side small so
punctuation still hugs the expression. Re-run `metrics.mjs` and
`responsive.mjs` afterwards — the extra width must not create overflow at
320 px (`.math-inline` already has `max-width: 100%`).

## Issue 5 — Desmos has no visible input field

The tools column is 380 px wide (330 px at ≤1200 px), and Desmos collapses its
expression list at that width. Two-part fix:

1. **Expand control.** Add a button in the calculator panel header
   (`src/app.js`, the `#calc-mode` row around line 671) that toggles a
   `calc-expanded` class on `.tools` (or opens a modal). Expanded state:
   `position: fixed; top/topbar; right: 12px; bottom: 12px;`
   `width: min(1100px, 92vw); z-index` above the pane, with a close button/Esc.
   Give `.calc-host` a usable height (e.g. `min-height: 60vh`).
2. **Verify after approval** that the expression input is visible at both
   380 px and expanded widths. The iframe is cross-origin, so DOM inspection is
   impossible — validate with screenshots (headless Chromium at 1440×1000 and
   390×844), or open <https://www.desmos.com/calculator?embed> directly.

Network status: requests still return
`Approval required for www.desmos.com:443`. Complete the pending approval **on
the host** (the `sbx` CLI is not available inside this sandbox):

```bash
sbx policy approval ls
sbx policy approval inspect <approval-id>
sbx policy approval respond <approval-id> --option <option-id>
```

The app must keep working without Desmos: the "Built-in" tab mounts
`grapher.js` and is covered by tests ("built-in grapher mounts/accepts
expression"). Do not remove that fallback.

## Diagnostics setup

The project directory cannot be used for Playwright deps (its `node_modules` is
corrupt on this mount). Scripts live in `tools/diagnostics/` and run from a
scratch dir:

```bash
mkdir -p /tmp/sat-diag && cd /tmp/sat-diag
npm init -y >/dev/null
npm i playwright-core
cp /wsl.localhost/Ubuntu-26.04/home/iangr/TEST/sat-bluebook/tools/diagnostics/*.mjs .
```

Chromium is at `/usr/bin/chromium`; all scripts already launch with
`--no-sandbox` and talk to `http://127.0.0.1:4173` (server must be running).

| Script | Purpose |
| --- | --- |
| `test2.mjs` | 38-check interaction suite (sample + upload + mobile) |
| `expiry.mjs` | timer expiry auto-submit (~2.3 s with a short timer) |
| `responsive.mjs` | 320–1440 px overflow/layout checks |
| `metrics.mjs` | math-crop aspect/scale checks |
| `inspect-pdf.mjs <pdf> <tag>` | parses a PDF, dumps questions/blocks, screenshots each question to `/tmp/opencode/<tag>/` |
| `lines.mjs <pdf> <pages>` | text lines/items with x gaps (table/list diagnosis) |
| `spaced-items.mjs <pdf>` | lists every text item containing whitespace |
| `codepoints.mjs <pdf> <page>` | character codes for suspicious items |
| `pix.mjs`, `tables.mjs`, `region.mjs` | pixel-rule/table prototypes |
| `render.mjs <pdf> <pages> <dir>` | renders pages to PNG |

Current baselines: `test2` all pass, `expiry` ~2.3 s, responsive clean
320–1440 px, sample = 7 questions, `_2` = 7, `_5` = 12.

## Environment gotchas

- The project mount (`/wsl.localhost/…/TEST`) frequently returns
  `Input/output error` from `ls`/`git`, but reads and writes still work.
  `sat-bluebook/node_modules` is corrupt and undeletable; it is gitignored and
  the app has **no runtime dependencies**, so don't run `npm install` there.
- There is no git repository in the workspace.
- `sbx` is not installed inside the sandbox; host-side port publishing and
  network approvals must be done by the user.
- `_5` page 5 contains a large no-text vector graphic **below the answer
  choices** (≈ x 57..600 pt, y 2..272 pt). It is unrelated to Q5 and is
  correctly ignored because it falls below the answer band. Don't let table
  detection pick it up — the "≥2 text items inside" rule prevents it.
- `TheMathOnes_4_extracted_pages.pdf` is identical to the bundled
  `sample/sat-math-sample.pdf`.

## File map

| Path | Role |
| --- | --- |
| `sat-bluebook/src/parser.js` | PDF → questions; line rebuilding, math/table cropping, prompt/choice building |
| `sat-bluebook/src/app.js` | rendering, calculator mounting, tools panel, dialogs |
| `sat-bluebook/src/desmos.js` | Desmos iframe URL + optional JS API loader |
| `sat-bluebook/src/grapher.js` | built-in fallback grapher |
| `sat-bluebook/styles.css` | layout; `.tools` width, `.math-inline`, `.prompt` lists |
| `sat-bluebook/server.js` | static server (now defaults to `0.0.0.0:4173`) |
| `sat-bluebook/tools/diagnostics/` | archived Playwright diagnostics (see its README) |
| `/tmp/opencode/pdf2.txt`, `pdf5.txt` | last full parse dumps for `_2` / `_5` |
| `/tmp/opencode/lines5-*.txt` | raw line dumps used for table/list work |
| `/tmp/opencode/sattest/` | live harness with `node_modules` |
