/**
 * grapher.js — a small, dependency-free fallback grapher.
 *
 * This is only used if Desmos cannot be embedded. It supports up to three
 * functions of x, zoom/pan, and the usual operators and functions.
 */

const COLORS = ['#1c5fb8', '#0d7a4f', '#b42318'];

export class MiniGrapher {
  constructor(host) {
    this.host = host;
    this.functions = [
      { expr: 'x^2', color: COLORS[0], enabled: true },
      { expr: '', color: COLORS[1], enabled: true },
      { expr: '', color: COLORS[2], enabled: true },
    ];
    this.view = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
    this.drag = null;
    this.compiled = new Map();
    this.resizeObserver = null;
    this.build();
    this.bind();
    this.resize();
  }

  build() {
    this.host.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'grapher';

    const wrap = document.createElement('div');
    wrap.className = 'grapher-canvas-wrap';
    this.canvas = document.createElement('canvas');
    wrap.appendChild(this.canvas);

    const controls = document.createElement('div');
    controls.className = 'grapher-controls';
    this.inputs = [];
    for (let i = 0; i < 3; i++) {
      const row = document.createElement('div');
      row.className = 'grapher-row';
      const swatch = document.createElement('span');
      swatch.className = 'grapher-swatch';
      swatch.style.background = COLORS[i];
      const input = document.createElement('input');
      input.type = 'text';
      input.value = this.functions[i].expr;
      input.placeholder = i === 0 ? 'x^2' : 'f(x)';
      input.setAttribute('aria-label', `Function ${i + 1}`);
      input.spellcheck = false;
      const clear = document.createElement('button');
      clear.className = 'btn small ghost';
      clear.type = 'button';
      clear.textContent = 'Clear';
      clear.addEventListener('click', () => {
        input.value = '';
        this.updateFunction(i, '');
      });
      input.addEventListener('input', () => this.updateFunction(i, input.value));
      row.append(swatch, input, clear);
      controls.appendChild(row);
      this.inputs.push(input);
    }

    const zoom = document.createElement('div');
    zoom.className = 'grapher-zoom';
    const mk = (label, title, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', fn);
      return b;
    };
    zoom.append(
      mk('+', 'Zoom in', () => this.zoom(0.8)),
      mk('−', 'Zoom out', () => this.zoom(1.25)),
      mk('⟲', 'Reset view', () => this.reset()),
    );
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = 'Scroll to zoom · drag to pan';
    zoom.appendChild(hint);

    root.append(wrap, controls, zoom);
    this.host.appendChild(root);
    this.ctx = this.canvas.getContext('2d');
  }

  bind() {
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        const gx = this.view.xMin + px * (this.view.xMax - this.view.xMin);
        const gy = this.view.yMax - py * (this.view.yMax - this.view.yMin);
        const factor = e.deltaY < 0 ? 0.88 : 1.14;
        this.view.xMin = gx - (gx - this.view.xMin) * factor;
        this.view.xMax = gx + (this.view.xMax - gx) * factor;
        this.view.yMin = gy - (gy - this.view.yMin) * factor;
        this.view.yMax = gy + (this.view.yMax - gy) * factor;
        this.draw();
      },
      { passive: false },
    );

    this.canvas.addEventListener('dblclick', () => this.reset());

    this.canvas.addEventListener('pointerdown', (e) => {
      this.drag = {
        x: e.clientX,
        y: e.clientY,
        view: { ...this.view },
        pointerId: e.pointerId,
      };
      this.canvas.setPointerCapture(e.pointerId);
      this.canvas.style.cursor = 'grabbing';
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const rect = this.canvas.getBoundingClientRect();
      const dx = ((e.clientX - this.drag.x) / rect.width) * (this.drag.view.xMax - this.drag.view.xMin);
      const dy = ((e.clientY - this.drag.y) / rect.height) * (this.drag.view.yMax - this.drag.view.yMin);
      this.view.xMin = this.drag.view.xMin - dx;
      this.view.xMax = this.drag.view.xMax - dx;
      this.view.yMin = this.drag.view.yMin + dy;
      this.view.yMax = this.drag.view.yMax + dy;
      this.draw();
    });
    const endDrag = (e) => {
      if (!this.drag) return;
      this.drag = null;
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.canvas.style.cursor = 'crosshair';
    };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas.parentElement);
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;
    this.draw();
  }

  reset() {
    const aspect = this.width / this.height || 1;
    this.view = { xMin: -10, xMax: 10, yMin: -10 / aspect, yMax: 10 / aspect };
    this.draw();
  }

  zoom(factor) {
    const cx = (this.view.xMin + this.view.xMax) / 2;
    const cy = (this.view.yMin + this.view.yMax) / 2;
    const hx = ((this.view.xMax - this.view.xMin) / 2) * factor;
    const hy = ((this.view.yMax - this.view.yMin) / 2) * factor;
    this.view = { xMin: cx - hx, xMax: cx + hx, yMin: cy - hy, yMax: cy + hy };
    this.draw();
  }

  updateFunction(index, expr) {
    this.functions[index].expr = expr;
    this.compiled.delete(index);
    const input = this.inputs[index];
    try {
      this.compile(index, expr);
      input.style.borderColor = '';
    } catch {
      input.style.borderColor = '#b42318';
    }
    this.draw();
  }

  compile(index, expr) {
    if (!expr.trim()) return null;
    if (this.compiled.has(index)) return this.compiled.get(index);
    const fn = compileExpression(expr);
    this.compiled.set(index, fn);
    return fn;
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    const W = this.width || 1;
    const H = this.height || 1;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const { xMin, xMax, yMin, yMax } = this.view;
    const xToPx = (x) => ((x - xMin) / (xMax - xMin)) * W;
    const yToPx = (y) => ((yMax - y) / (yMax - yMin)) * H;

    const xStep = niceStep((xMax - xMin) / 8);
    const yStep = niceStep((yMax - yMin) / 8);

    // Grid
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#e7ebf1';
    ctx.beginPath();
    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
      const px = Math.round(xToPx(x)) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, H);
    }
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
      const py = Math.round(yToPx(y)) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(W, py);
    }
    ctx.stroke();

    // Axes
    const xAxis = yToPx(0);
    const yAxis = xToPx(0);
    ctx.strokeStyle = '#98a2b3';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    if (xAxis >= 0 && xAxis <= H) {
      ctx.moveTo(0, xAxis);
      ctx.lineTo(W, xAxis);
    }
    if (yAxis >= 0 && yAxis <= W) {
      ctx.moveTo(yAxis, 0);
      ctx.lineTo(yAxis, H);
    }
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = '#667085';
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
      if (Math.abs(x) < 1e-9) continue;
      const px = xToPx(x);
      const py = Math.min(H - 13, Math.max(2, xAxis + 4));
      ctx.fillText(formatTick(x), px, py);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
      if (Math.abs(y) < 1e-9) continue;
      const py = yToPx(y);
      const px = Math.max(18, Math.min(W - 4, yAxis - 5));
      ctx.fillText(formatTick(y), px, py);
    }

    // Functions
    for (let i = 0; i < 3; i++) {
      const expr = this.functions[i].expr;
      if (!expr.trim()) continue;
      let fn;
      try {
        fn = this.compile(i, expr);
      } catch {
        continue;
      }
      if (!fn) continue;
      ctx.strokeStyle = this.functions[i].color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      let started = false;
      let prevY = null;
      for (let px = 0; px <= W; px += 1) {
        const x = xMin + (px / W) * (xMax - xMin);
        let y;
        try {
          y = fn(x);
        } catch {
          y = NaN;
        }
        if (!Number.isFinite(y)) {
          started = false;
          prevY = null;
          continue;
        }
        const py = yToPx(y);
        if (!Number.isFinite(py) || py < -H * 2 || py > H * 3) {
          started = false;
          prevY = null;
          continue;
        }
        if (!started || (prevY !== null && Math.abs(py - prevY) > H * 1.4)) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
        prevY = py;
      }
      ctx.stroke();
    }

    // Empty state
    if (!this.functions.some((f) => f.expr.trim())) {
      ctx.fillStyle = '#98a2b3';
      ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Type a function of x below', W / 2, H / 2);
    }
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.host.innerHTML = '';
  }
}

function compileExpression(expr) {
  if (!/^[0-9a-zA-Z+\-*/().,\s^]+$/.test(expr)) {
    throw new Error('Unsupported characters');
  }
  let src = expr.replace(/\s+/g, '').replace(/\^/g, '**');
  // implicit multiplication: 2x, 2(x+1), )(, x(
  src = src
    .replace(/(\d)(x|\()/g, '$1*$2')
    .replace(/\)(\()/g, ')*(')
    .replace(/([x)])(\d)/g, '$1*$2');

  const ids = src.match(/[a-zA-Z]+/g) || [];
  const allowed = new Set([
    'x',
    'pi',
    'e',
    'sin',
    'cos',
    'tan',
    'asin',
    'acos',
    'atan',
    'sqrt',
    'abs',
    'log',
    'ln',
    'exp',
    'floor',
    'ceil',
    'round',
    'pow',
  ]);
  for (const id of ids) {
    if (!allowed.has(id)) throw new Error(`Unknown symbol: ${id}`);
  }

  src = src
    .replace(/\bpi\b/g, 'Math.PI')
    .replace(/\be\b/g, 'Math.E')
    .replace(/\bln\b/g, 'Math.log')
    .replace(
      /\b(sin|cos|tan|asin|acos|atan|sqrt|abs|log|exp|floor|ceil|round|pow)\b/g,
      'Math.$1',
    );

  // eslint-disable-next-line no-new-func
  const fn = new Function('x', `"use strict"; return (${src});`);
  fn(0); // surface syntax/runtime errors early
  return fn;
}

function niceStep(raw) {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / power;
  let step;
  if (norm < 1.5) step = 1;
  else if (norm < 3.5) step = 2;
  else if (norm < 7.5) step = 5;
  else step = 10;
  return step * power;
}

function formatTick(v) {
  const rounded = Math.round(v * 1e6) / 1e6;
  if (Math.abs(rounded) >= 10000 || (Math.abs(rounded) < 0.001 && rounded !== 0)) {
    return rounded.toExponential(0);
  }
  return String(rounded);
}
