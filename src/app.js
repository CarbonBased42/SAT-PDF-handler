/**
 * app.js — the Bluebook-style practice test UI.
 */

import { parsePdf } from './parser.js';
import { MiniGrapher } from './grapher.js';
import {
  loadDesmosApi,
  createDesmosCalculator,
  createDesmosIframe,
  DESMOS_EMBED_URL,
} from './desmos.js';
import * as store from './store.js';

const MODULE_SECONDS = 35 * 60;
const KNOWN_KEYS = {};

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');

const state = {
  view: 'home',
  test: null,
  index: 0,
  answers: {},
  eliminated: {},
  flags: {},
  key: {},
  notes: '',
  timeLeft: MODULE_SECONDS,
  running: false,
  reviewing: false,
  submitted: false,
  tool: 'calc',
  calcMode: localStorage.getItem('sb:calcMode') || 'desmos',
  desmosKey: localStorage.getItem('sb:desmosKey') || '',
};

let timerId = null;
let currentModal = null;
let grapher = null;
let desmosCalc = null;

/* ==========================================================================
   Icons
   ========================================================================== */

const ICONS = {
  upload:
    '<path d="M12 16V4m0 0 4 4m-4-4-4 4"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  flag: '<path d="M6 21V4"/><path d="M6 4h11l-2.2 4L17 12H6"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  calculator:
    '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18h.01M12 18h.01M16 18h.01"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 4.5v15"/>',
  note: '<path d="M5 3h9l5 5v13H5z"/><path d="M14 3v5h5"/><path d="M8 13h8M8 17h5"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  arrowLeft: '<path d="m15 18-6-6 6-6"/>',
  arrowRight: '<path d="m9 18 6-6-6-6"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v5M14 11v5"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  file: '<path d="M6 2h8l5 5v15H6z"/><path d="M14 2v5h5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-.7.6-1.7 1.1-1.7 2.2"/><path d="M12 17h.01"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M20 14v6H4V4h6"/>',
  strike: '<path d="M4 12h16"/><path d="M8 7a4 4 0 0 1 8 0c0 1.5-1 2.3-2 3"/><path d="M16 17a4 4 0 0 1-8 0c0-1.5 1-2.3 2-3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  download: '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
};

function iconHTML(name, cls = '') {
  return `<span class="icon ${cls}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg></span>`;
}

/* ==========================================================================
   Small DOM / formatting helpers
   ========================================================================== */

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'disabled' || key === 'checked' || key === 'readOnly') {
      el[key] = !!value;
    } else {
      el.setAttribute(key, value === true ? '' : value);
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtTime(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function titleFromFilename(name) {
  return String(name || 'Practice Set')
    .replace(/\.pdf$/i, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 80);
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

let toastTimer = null;
function toast(message, ms = 3200) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => {
      toastEl.hidden = true;
    }, 200);
  }, ms);
}

/* ==========================================================================
   Modal helpers
   ========================================================================== */

function showModal({
  title,
  body,
  footer,
  wide = false,
  dismissible = true,
  className = '',
  onClose,
}) {
  closeModal();
  const backdrop = h('div', { class: 'modal-backdrop' });
  const modal = h('div', { class: `modal ${wide ? 'wide' : ''} ${className}`.trim() });

  if (title || dismissible) {
    const head = h(
      'div',
      { class: 'modal-head' },
      h('h2', { text: title || '' }),
      dismissible
        ? h(
            'button',
            {
              class: 'icon-btn',
              type: 'button',
              'aria-label': 'Close',
              onclick: () => closeModal(),
              html: iconHTML('close'),
            },
          )
        : null,
    );
    modal.append(head);
  }

  const bodyEl = h('div', { class: 'modal-body' });
  if (body instanceof Node) bodyEl.append(body);
  else bodyEl.innerHTML = body || '';
  modal.append(bodyEl);

  if (footer) {
    const foot = h('div', { class: 'modal-foot' });
    const items = Array.isArray(footer) ? footer : [footer];
    for (const item of items) if (item) foot.append(item instanceof Node ? item : h('span', { html: String(item) }));
    modal.append(foot);
  }

  backdrop.append(modal);
  if (dismissible) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });
  }

  document.body.append(backdrop);
  currentModal = {
    backdrop,
    modal,
    close: () => {
      backdrop.remove();
      currentModal = null;
      onClose?.();
    },
  };

  const focusable = modal.querySelector('button, input, select, textarea, a[href]');
  setTimeout(() => focusable?.focus(), 30);
  return { el: modal, body: bodyEl, close: currentModal.close, backdrop };
}

function closeModal() {
  if (!currentModal) return;
  const m = currentModal;
  currentModal = null;
  m.backdrop.remove();
}

function showParseModal(title) {
  const body = h(
    'div',
    { class: 'parse-modal-inner' },
    h('div', { class: 'parse-icon', html: iconHTML('file') }),
    h('h2', { text: title || 'Reading PDF' }),
    h('p', {
      text: 'Finding questions, rebuilding the text, and cropping the math from each page. This stays on your device.',
    }),
  );
  const track = h('div', { class: 'progress-track' });
  const bar = h('div', { class: 'progress-bar' });
  track.append(bar);
  const label = h('div', { class: 'progress-label', text: 'Starting…' });
  body.append(track, label);

  const modal = showModal({
    title: '',
    body,
    dismissible: false,
    className: 'parse-modal',
  });

  return {
    close: modal.close,
    update(done, total, message) {
      const pct = total ? Math.round((done / total) * 100) : 8;
      bar.style.width = `${pct}%`;
      label.textContent = message || `Page ${done} of ${total}`;
    },
  };
}

function showError(title, message, details = []) {
  const body = h('div');
  body.append(
    h('p', { text: message }),
    details.length
      ? h(
          'div',
          { class: 'reference-note', style: { marginTop: '14px' } },
          details.map((d) => h('div', { text: d })),
        )
      : null,
  );
  showModal({
    title,
    body,
    footer: h('button', {
      class: 'btn primary',
      type: 'button',
      text: 'Close',
      onclick: () => closeModal(),
    }),
  });
}

/* ==========================================================================
   Boot
   ========================================================================== */

async function init() {
  try {
    const res = await fetch('sample/key.json', { cache: 'no-store' });
    if (res.ok) {
      const known = await res.json();
      for (const [id, key] of Object.entries(known)) {
        if (key && !String(id).startsWith('_')) KNOWN_KEYS[id] = String(key);
      }
    }
  } catch {
    /* running without the sample key is fine */
  }
  document.addEventListener('keydown', onGlobalKeydown);
  window.addEventListener('beforeunload', () => {
    if (state.view === 'test' && state.test) saveSession();
  });
  renderHome();
}

/* ==========================================================================
   Home
   ========================================================================== */

function homeTopbar() {
  return `
    <header class="topbar">
      <div class="brand"><span class="brand-mark">S</span> SAT Bluebook Practice</div>
      <div class="topbar-spacer"></div>
      <div class="topbar-right">
        <button class="icon-btn wide" id="open-settings" type="button">
          ${iconHTML('settings')} <span class="label-text">Settings</span>
        </button>
      </div>
    </header>`;
}

async function renderHome() {
  stopTimer();
  state.view = 'home';
  state.running = false;
  const tests = await store.listTests();

  const recent = tests.length
    ? tests
        .map((t) => {
          const session = loadSession(t.id);
          const status = session?.submitted ? ' · Completed' : session ? ' · In progress' : '';
          const openLabel = session?.submitted ? 'Results' : session ? 'Resume' : 'Open';
          return `
      <div class="test-card" data-id="${escapeHtml(t.id)}">
        <div class="test-card-icon">${iconHTML('file')}</div>
        <div class="test-card-body">
          <div class="test-card-title">${escapeHtml(t.title)}</div>
          <div class="test-card-meta">${t.questionCount} question${t.questionCount === 1 ? '' : 's'} · ${
            t.domains?.length ? escapeHtml(t.domains.map((d) => d.name).join(', ')) : 'SAT Math'
          } · ${fmtDate(t.createdAt)}${status}</div>
        </div>
        <div class="test-card-actions">
          <button class="btn small primary" data-action="open" type="button">${openLabel}</button>
          <button class="btn small ghost" data-action="delete" type="button" aria-label="Delete test">${iconHTML(
            'trash',
          )}</button>
        </div>
      </div>`;
        })
        .join('')
    : `<div class="empty-state">No tests yet. Load a question-bank PDF above to get started.</div>`;

  app.innerHTML = `
    ${homeTopbar()}
    <section class="home">
      <div class="hero">
        <span class="eyebrow">${iconHTML('file')} SAT · Math</span>
        <h1>Turn question-bank PDFs into a <em>practice test</em>.</h1>
        <p>Drop in a College Board SAT question-bank export. We rebuild the prose, keep the math exactly as printed, and wrap it in a Bluebook-style test with Desmos, flagging, and review.</p>
      </div>

      <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="Upload a PDF">
        <div class="dropzone-icon">${iconHTML('upload')}</div>
        <h2>Drop a SAT question-bank PDF here</h2>
        <p>One question per page or a multi-question export both work. Everything is parsed locally in your browser.</p>
        <div class="drop-actions">
          <button class="btn primary" id="pick-pdf" type="button">${iconHTML('upload')} Choose PDF</button>
          <button class="btn" id="load-sample" type="button">${iconHTML('play')} Load sample set</button>
        </div>
        <input type="file" id="pdf-input" accept="application/pdf,.pdf" hidden />
      </div>
      <div class="privacy-note">${iconHTML('lock')} Parsed on your device — the PDF never leaves this browser.</div>

      <section class="home-section">
        <h2>Recent tests</h2>
        <div class="test-list" id="test-list">${recent}</div>
      </section>

      <div class="feature-grid">
        <div class="feature">${iconHTML('calculator')}<h3>Desmos built in</h3><p>The real Desmos calculator sits beside every question, with a compact grapher as backup.</p></div>
        <div class="feature">${iconHTML('flag')}<h3>Bluebook flow</h3><p>Flag questions, cross out choices, jump around with the navigator, and pause when you need to.</p></div>
        <div class="feature">${iconHTML('check')}<h3>Review &amp; grade</h3><p>Add an answer key (the PDFs don’t include one) and get a per-question breakdown.</p></div>
        <div class="feature">${iconHTML('book')}<h3>Reference sheet</h3><p>The SAT math formulas and a scratchpad are one click away while you work.</p></div>
      </div>

      <footer class="home-footer">
        <span>SAT Bluebook Practice · a local, lightweight study tool</span>
        <span>Not affiliated with the College Board or Desmos.</span>
      </footer>
    </section>`;

  document.title = 'SAT Bluebook Practice';

  document.getElementById('open-settings').addEventListener('click', openSettings);

  const input = document.getElementById('pdf-input');
  const dropzone = document.getElementById('dropzone');
  const pick = () => input.click();
  document.getElementById('pick-pdf').addEventListener('click', (e) => {
    e.stopPropagation();
    pick();
  });
  dropzone.addEventListener('click', pick);
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick();
    }
  });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (file) handlePdfFile(file);
  });

  for (const evt of ['dragenter', 'dragover']) {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragging');
    });
  }
  for (const evt of ['dragleave', 'drop']) {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragging');
    });
  }
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) handlePdfFile(file);
  });

  document.getElementById('load-sample').addEventListener('click', (e) => {
    e.stopPropagation();
    loadSample();
  });

  const list = document.getElementById('test-list');
  list.addEventListener('click', async (e) => {
    const card = e.target.closest('.test-card');
    if (!card) return;
    const id = card.dataset.id;
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'delete') {
      const meta = tests.find((t) => t.id === id);
      if (!meta) return;
      openDeleteConfirm(meta, () => renderHome());
      return;
    }
    const test = await store.getTest(id);
    if (!test) {
      showError('Test not found', 'The cached copy of this test is gone. Please re-import the PDF.');
      return;
    }
    openTest(test);
  });
}

function openDeleteConfirm(meta, after) {
  showModal({
    title: 'Delete this test?',
    body: h(
      'div',
      {},
      h('p', { text: `“${meta.title}” will be removed from this browser, along with its saved answers and notes.` }),
    ),
    footer: [
      h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => closeModal() }),
      h('button', {
        class: 'btn danger',
        type: 'button',
        text: 'Delete',
        onclick: async () => {
          await store.deleteTest(meta.id);
          clearTestLocalData(meta.id);
          closeModal();
          after?.();
        },
      }),
    ],
  });
}

async function handlePdfFile(file) {
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    showError('Not a PDF', 'Please choose a PDF exported from the SAT question bank.');
    return;
  }
  const modal = showParseModal('Reading your PDF');
  try {
    const buffer = await file.arrayBuffer();
    await parseAndOpen(buffer, titleFromFilename(file.name), { modal });
  } catch (err) {
    modal.close();
    showError(
      'Could not parse this PDF',
      'The file was read, but no SAT question blocks could be rebuilt. This parser expects the question-bank export layout (Question ID / Assessment / Question / Answer).',
      [err.message],
    );
  }
}

async function loadSample() {
  const modal = showParseModal('Loading sample test');
  try {
    const res = await fetch('sample/sat-math-sample.pdf');
    if (!res.ok) throw new Error('Sample PDF not found.');
    const buffer = await res.arrayBuffer();
    await parseAndOpen(buffer, 'SAT Math · Sample Set', { modal, isSample: true });
  } catch (err) {
    modal.close();
    showError('Could not load the sample', err.message);
  }
}

async function parseAndOpen(buffer, title, { modal, isSample = false } = {}) {
  try {
    const test = await parsePdf(buffer, {
      title,
      onProgress: (page, total) => modal?.update(page, total),
    });
    if (!test.questions.length) {
      throw new Error(
        'No “Question ID” blocks were found. This may not be a SAT question-bank export, or the text layer is image-only.',
      );
    }
    test.isSample = isSample;
    for (const q of test.questions) {
      if (!q.answerKey && KNOWN_KEYS[q.id]) q.answerKey = KNOWN_KEYS[q.id];
    }
    try {
      await store.saveTest(test);
    } catch (err) {
      console.warn('Could not cache the parsed test', err);
    }
    modal?.close();
    openTest(test);
  } catch (err) {
    modal?.close();
    throw err;
  }
}

/* ==========================================================================
   Test lifecycle
   ========================================================================== */

function openTest(test) {
  state.test = test;
  state.key = loadKey(test);
  state.notes = localStorage.getItem(notesKey(test.id)) || '';
  state.index = 0;
  state.answers = {};
  state.eliminated = {};
  state.flags = {};
  state.timeLeft = MODULE_SECONDS;
  state.reviewing = false;
  state.submitted = false;
  state.running = true;

  const session = loadSession(test.id);
  if (session) {
    state.answers = session.answers || {};
    state.eliminated = session.eliminated || {};
    state.flags = session.flags || {};
    state.index = Math.min(Math.max(0, session.index || 0), test.questions.length - 1);
    state.timeLeft = Number.isFinite(session.timeLeft) ? session.timeLeft : MODULE_SECONDS;
    state.submitted = !!session.submitted;
    if (state.submitted) {
      state.reviewing = false;
      state.running = false;
      renderResults();
      return;
    }
    toast('Previous session restored.');
  }

  renderTest();
  if (state.running) startTimer();
}

function renderTest() {
  stopTimer();
  const test = state.test;
  if (!test) {
    renderHome();
    return;
  }
  state.view = 'test';
  document.title = `${test.title} · SAT Bluebook Practice`;

  app.innerHTML = `
    <header class="topbar">
      <button class="brand brand-btn" id="go-home" type="button" title="Home">
        <span class="brand-mark">S</span> <span class="brand-text">SAT Practice</span>
      </button>
      <div class="module-title">
        <strong>${escapeHtml(test.test || 'Math')}</strong><span>·</span><span>Module 1</span>
      </div>
      <div class="topbar-spacer"></div>
      <div class="topbar-right">
        <div class="timer" id="timer">${fmtTime(state.timeLeft)}</div>
        ${
          state.reviewing
            ? `<button class="icon-btn wide" id="results-btn" type="button">${iconHTML(
                'list',
              )} <span class="label-text">Results</span></button>`
            : `<button class="icon-btn" id="pause-btn" type="button" title="Pause" aria-label="Pause">${iconHTML(
                'pause',
              )}</button>
               <button class="icon-btn wide" id="directions-btn" type="button">${iconHTML(
                 'help',
               )} <span class="label-text">Directions</span></button>
               <button class="icon-btn wide" id="review-btn" type="button">${iconHTML(
                 'list',
               )} <span class="label-text">Review</span></button>`
        }
        <button class="icon-btn mobile-tools-toggle" id="tools-toggle" type="button" title="Tools" aria-label="Tools">${iconHTML(
          'calculator',
        )}</button>
      </div>
    </header>

    <div class="test-shell">
      <main class="question-pane" id="question-pane" tabindex="-1"></main>
      <aside class="tools" id="tools">
        <div class="tool-tabs" role="tablist">
          <button class="tool-tab" data-tool="calc" role="tab" type="button">${iconHTML(
            'calculator',
          )} <span>Calculator</span></button>
          <button class="tool-tab" data-tool="ref" role="tab" type="button">${iconHTML(
            'book',
          )} <span>Reference</span></button>
          <button class="tool-tab" data-tool="notes" role="tab" type="button">${iconHTML(
            'note',
          )} <span>Notes</span></button>
        </div>
        <div class="tool-body">
          <div class="tool-panel" data-panel="calc" role="tabpanel">
            <div class="tool-head">
              <div class="segmented" id="calc-mode" role="group" aria-label="Calculator type">
                <button type="button" data-mode="desmos">Desmos</button>
                <button type="button" data-mode="local">Built-in</button>
              </div>
              <button type="button" id="calc-popout" title="Open Desmos in a separate window" aria-label="Open Desmos in a separate window">${iconHTML('external')}</button>
              <span class="spacer"></span>
              <span id="calc-status"></span>
            </div>
            <div class="calc-host" id="calc-host"></div>
            <div class="calc-footer">
              <a href="https://www.desmos.com/calculator" target="_blank" rel="noopener">Open Desmos ${iconHTML(
                'external',
              )}</a>
              <span class="spacer"></span>
              <span>Not loading? Try <button class="linklike" id="use-local" type="button">Built-in</button>.</span>
            </div>
          </div>
          <div class="tool-panel" data-panel="ref" role="tabpanel">${referenceHTML()}</div>
          <div class="tool-panel" data-panel="notes" role="tabpanel">
            <div class="notes-wrap">
              <textarea id="notes-input" placeholder="Scratch work, formulas, reminders…" spellcheck="true"></textarea>
              <div class="notes-hint">Saved automatically for this test in your browser.</div>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <footer class="bottombar">
      <button class="btn" id="back-btn" type="button">${iconHTML(
        'arrowLeft',
      )} <span class="label">Back</span></button>
      <div class="nav-strip" id="nav-strip" aria-label="Question navigator"></div>
      <span class="nav-summary" id="nav-summary"></span>
      <button class="btn primary" id="next-btn" type="button"><span class="label">Next</span> ${iconHTML(
        'arrowRight',
      )}</button>
    </footer>`;

  document.getElementById('go-home').addEventListener('click', confirmLeave);
  document.getElementById('results-btn')?.addEventListener('click', showResults);
  document.getElementById('pause-btn')?.addEventListener('click', pauseTest);
  document.getElementById('directions-btn')?.addEventListener('click', showDirections);
  document.getElementById('review-btn')?.addEventListener('click', openReviewDialog);
  document.getElementById('tools-toggle').addEventListener('click', () => {
    document.getElementById('tools').classList.toggle('open');
  });
  document.getElementById('back-btn').addEventListener('click', () => goTo(state.index - 1));
  document.getElementById('next-btn').addEventListener('click', () => {
    if (state.index < state.test.questions.length - 1) goTo(state.index + 1);
    else openReviewDialog();
  });

  mountTools();
  renderQuestion();
  updateTimerDisplay();
}

function confirmLeave() {
  if (state.reviewing) {
    renderHome();
    return;
  }
  const answered = Object.values(state.answers).filter(Boolean).length;
  showModal({
    title: 'Leave the test?',
    body: h(
      'p',
      {
        text:
          answered > 0
            ? 'Your answers and timer are saved in this browser. You can resume from the home screen.'
            : 'Your progress is saved in this browser.',
      },
    ),
    footer: [
      h('button', { class: 'btn', type: 'button', text: 'Keep working', onclick: () => closeModal() }),
      h('button', {
        class: 'btn primary',
        type: 'button',
        text: 'Leave test',
        onclick: () => {
          saveSession();
          closeModal();
          renderHome();
        },
      }),
    ],
  });
}

/* ==========================================================================
   Tools panel
   ========================================================================== */

function mountTools() {
  const tools = document.getElementById('tools');
  for (const tab of tools.querySelectorAll('.tool-tab')) {
    tab.addEventListener('click', () => setTool(tab.dataset.tool));
  }
  setTool(state.tool);

  const notes = document.getElementById('notes-input');
  notes.value = state.notes;
  notes.addEventListener('input', () => {
    state.notes = notes.value;
    localStorage.setItem(notesKey(state.test.id), state.notes);
  });

  for (const btn of document.querySelectorAll('#calc-mode button')) {
    btn.classList.toggle('active', btn.dataset.mode === state.calcMode);
    btn.addEventListener('click', () => setCalcMode(btn.dataset.mode));
  }
  document.getElementById('use-local').addEventListener('click', () => setCalcMode('local'));
  document.getElementById('calc-popout')?.addEventListener('click', openDesmosPopout);
  mountCalculator();
}

function setTool(tool) {
  state.tool = tool;
  for (const tab of document.querySelectorAll('.tool-tab')) {
    tab.classList.toggle('active', tab.dataset.tool === tool);
  }
  for (const panel of document.querySelectorAll('.tool-panel')) {
    panel.classList.toggle('active', panel.dataset.panel === tool);
  }
}

function setCalcMode(mode) {
  state.calcMode = mode;
  localStorage.setItem('sb:calcMode', mode);
  for (const btn of document.querySelectorAll('#calc-mode button')) {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  }
  mountCalculator();
}

async function mountCalculator() {
  const host = document.getElementById('calc-host');
  if (!host) return;
  grapher?.destroy();
  grapher = null;
  desmosCalc = null;

  const status = document.getElementById('calc-status');
  if (status) status.textContent = '';

  if (state.calcMode === 'local') {
    host.innerHTML = '';
    grapher = new MiniGrapher(host);
    if (status) status.textContent = 'Built-in';
    return;
  }

  host.innerHTML = '<div class="calc-loading">Loading Desmos…</div>';
  if (state.desmosKey) {
    try {
      const Desmos = await loadDesmosApi(state.desmosKey);
      host.innerHTML = '';
      desmosCalc = createDesmosCalculator(host, Desmos);
      if (status) status.textContent = 'Desmos API';
      return;
    } catch (err) {
      console.warn(err);
      toast('Desmos API unavailable — using the embed instead.');
    }
  }
  host.innerHTML = '';
  createDesmosIframe(host);
  if (status) status.textContent = 'Desmos embed';
}

function openDesmosPopout() {
  // Desmos collapses its expression input in a narrow docked panel, so open it
  // in a separate window where it has room to show the full calculator. Use the
  // un-embedded URL so the expression list is visible; ?embed hides it.
  const url = 'https://www.desmos.com/calculator';
  const width = 1100;
  const height = 760;
  const left = Math.max(0, Math.round((screen.width - width) / 2));
  const top = Math.max(0, Math.round((screen.height - height) / 2));
  const features = `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=yes,directories=no,status=no`;
  const win = window.open(url, 'desmos-popout', features);
  if (win) {
    try { win.focus(); } catch {}
  } else {
    toast('Pop-up blocked — allow pop-ups for this site, or use the “Open Desmos” link below.');
  }
}

function referenceHTML() {
  const formula = (name, expr) => `
    <div class="formula"><div class="fname">${name}</div><div class="fexpr">${expr}</div></div>`;
  return `
    <div class="reference">
      <h3>Circles</h3>
      <div class="formula-grid">
        ${formula('Area', 'A = π<i>r</i>²')}
        ${formula('Circumference', 'C = 2π<i>r</i>')}
      </div>
      <h3 style="margin-top:16px">Triangles</h3>
      <div class="formula-grid">
        ${formula('Area', 'A = ½<i>bh</i>')}
        ${formula('Pythagorean theorem', '<i>a</i>² + <i>b</i>² = <i>c</i>²')}
        ${formula('45°–45°–90°', 'sides <i>x</i>, <i>x</i>, <i>x</i>√2')}
        ${formula('30°–60°–90°', 'sides <i>x</i>, <i>x</i>√3, 2<i>x</i>')}
      </div>
      <h3 style="margin-top:16px">Solids</h3>
      <div class="formula-grid">
        ${formula('Rectangular prism', '<i>V</i> = <i>lwh</i>')}
        ${formula('Cylinder', '<i>V</i> = π<i>r</i>²<i>h</i>')}
        ${formula('Sphere', '<i>V</i> = ⁴⁄₃π<i>r</i>³')}
        ${formula('Cone', '<i>V</i> = ⅓π<i>r</i>²<i>h</i>')}
        ${formula('Pyramid', '<i>V</i> = ⅓<i>lwh</i>')}
      </div>
      <div class="reference-note">
        A circle has 360° of arc and 2π radians. The angles of a triangle sum to 180°.
      </div>
    </div>`;
}

/* ==========================================================================
   Question rendering
   ========================================================================== */

function renderQuestion() {
  const pane = document.getElementById('question-pane');
  if (!pane) return;
  const q = state.test.questions[state.index];
  if (!q) return;
  pane.innerHTML = '';

  const response = state.answers[q.id];
  const key = state.key[q.id];
  const flagged = !!state.flags[q.id];

  const top = h('div', { class: 'q-topline' });
  top.append(h('span', { class: 'q-number', text: `Question ${state.index + 1}` }));
  if (q.domain) top.append(h('span', { class: 'chip domain', text: q.domain }));
  if (q.skill) top.append(h('span', { class: 'chip', text: q.skill }));
  if (q.difficulty) {
    top.append(
      h('span', {
        class: `chip difficulty-${q.difficulty.toLowerCase()}`,
        text: q.difficulty,
      }),
    );
  }
  top.append(h('span', { class: 'spacer' }));
  if (!state.reviewing) {
    const flagBtn = h('button', {
      class: `flag-btn ${flagged ? 'active' : ''}`,
      type: 'button',
      'aria-pressed': flagged ? 'true' : 'false',
      onclick: () => toggleFlag(q.id),
      html: `${iconHTML('flag')} ${flagged ? 'Flagged' : 'Flag'}`,
    });
    top.append(flagBtn);
  } else if (flagged) {
    top.append(h('span', { class: 'chip difficulty-medium', text: 'Flagged' }));
  }
  pane.append(top);

  const card = h('div', { class: 'question-card' });

  const prompt = h('div', { class: 'prompt' });
  prompt.style.setProperty('--math-scale', String(1 / (q.baseFont || 9)));
  renderPrompt(prompt, q);
  card.append(prompt);

  if (q.type === 'mc' && q.choices.length) {
    card.append(renderChoices(q));
  } else {
    card.append(renderGridIn(q));
  }

  if (state.reviewing) card.append(renderFeedback(q, response, key));

  pane.append(card);

  if (state.reviewing) {
    const foot = h('div', { class: 'muted', style: { marginTop: '14px', fontSize: '12px' } });
    foot.textContent = `Question ID ${q.id} · Page ${q.page}`;
    pane.append(foot);
  }

  updateNav();
}

function renderPrompt(container, q) {
  for (const block of q.prompt) {
    if (block.type === 'para') {
      const p = document.createElement('p');
      renderTokens(p, block.tokens);
      container.append(p);
    } else if (block.type === 'math') {
      const figure = document.createElement('figure');
      figure.className = 'math-block';
      const img = document.createElement('img');
      img.src = block.src;
      img.alt = 'Math expression from the PDF';
      img.draggable = false;
      img.style.setProperty('--mh', String(block.h));
      img.style.setProperty('--mw', String(block.w));
      figure.append(img);
      container.append(figure);
    }
  }
}

function renderChoices(q) {
  const wrap = h('div', { class: 'choices' });
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Answer choices');
  const selected = state.answers[q.id];
  const key = state.key[q.id];
  const eliminated = new Set(state.eliminated[q.id] || []);

  for (const choice of q.choices) {
    const isSelected = selected === choice.label;
    const isEliminated = eliminated.has(choice.label);
    let extra = '';
    if (state.reviewing && key) {
      if (choice.label === key) extra = 'correct';
      else if (isSelected) extra = 'wrong';
    }

    const btn = h('button', {
      type: 'button',
      class: `choice ${isSelected ? 'selected' : ''} ${isEliminated ? 'eliminated' : ''} ${extra} ${
        state.reviewing ? 'readonly' : ''
      }`.trim(),
      'aria-pressed': isSelected ? 'true' : 'false',
      'aria-label': `Choice ${choice.label}`,
    });

    btn.append(h('span', { class: 'choice-label', text: choice.label }));
    const body = h('span', { class: `choice-body ${choice.standalone ? 'standalone' : ''}`.trim() });
    body.style.setProperty('--math-scale', String(1 / (q.baseFont || 9)));
    renderTokens(body, choice.tokens);
    btn.append(body);

    if (!state.reviewing) {
      const elim = h('button', {
        type: 'button',
        class: 'eliminate-btn',
        title: isEliminated ? 'Restore choice' : 'Cross out choice',
        'aria-label': isEliminated ? 'Restore choice' : 'Cross out choice',
        html: iconHTML('strike'),
        onclick: (e) => {
          e.stopPropagation();
          toggleEliminated(q.id, choice.label);
        },
      });
      btn.append(elim);
      btn.addEventListener('click', () => selectChoice(q.id, choice.label));
    }
    wrap.append(btn);
  }
  return wrap;
}

function renderGridIn(q) {
  const wrap = h('div', { class: 'gridin' });
  wrap.append(h('div', { class: 'gridin-label', text: 'Your answer' }));
  const input = h('input', {
    class: 'gridin-input',
    type: 'text',
    inputmode: 'text',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'Enter a number',
    value: state.answers[q.id] || '',
    readOnly: state.reviewing,
    'aria-label': 'Your answer',
  });
  input.addEventListener('input', () => {
    state.answers[q.id] = input.value;
    updateNav();
    saveSession();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (state.index < state.test.questions.length - 1) goTo(state.index + 1);
    }
  });
  wrap.append(input);

  if (!state.reviewing) {
    wrap.append(
      h('div', {
        class: 'gridin-note',
        text: 'Fractions (3/4), decimals, and negative values are accepted.',
      }),
    );
    const keypad = h('div', { class: 'keypad' });
    const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '/'];
    for (const k of keys) {
      keypad.append(
        h('button', {
          type: 'button',
          text: k,
          onclick: () => {
            insertAtCursor(input, k);
            state.answers[q.id] = input.value;
            updateNav();
            saveSession();
          },
        }),
      );
    }
    keypad.append(
      h('button', {
        type: 'button',
        text: '−',
        onclick: () => {
          insertAtCursor(input, '-');
          state.answers[q.id] = input.value;
          updateNav();
          saveSession();
        },
      }),
      h('button', {
        type: 'button',
        class: 'util',
        text: '⌫',
        'aria-label': 'Backspace',
        onclick: () => {
          backspaceAtCursor(input);
          state.answers[q.id] = input.value;
          updateNav();
          saveSession();
        },
      }),
      h('button', {
        type: 'button',
        class: 'util',
        text: 'Clear',
        onclick: () => {
          input.value = '';
          state.answers[q.id] = '';
          updateNav();
          saveSession();
        },
      }),
    );
    wrap.append(keypad);
  }
  return wrap;
}

function insertAtCursor(input, text) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const pos = start + text.length;
  input.setSelectionRange(pos, pos);
  input.focus();
}

function backspaceAtCursor(input) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  if (start !== end) {
    input.value = input.value.slice(0, start) + input.value.slice(end);
    input.setSelectionRange(start, start);
  } else if (start > 0) {
    input.value = input.value.slice(0, start - 1) + input.value.slice(start);
    input.setSelectionRange(start - 1, start - 1);
  }
  input.focus();
}

function renderFeedback(q, response, key) {
  if (!key) {
    return h('div', { class: 'feedback neutral' }, h('span', { html: iconHTML('info') }), h('div', {}, h('strong', { text: 'No answer key set for this question. ' }), 'Open Review → Edit answer key to add one.'));
  }
  const correct = isCorrect(q, response, key);
  const shown = q.type === 'mc' ? String(response || '').toUpperCase() : String(response || '').trim();
  if (correct) {
    return h(
      'div',
      { class: 'feedback correct' },
      h('span', { html: iconHTML('check') }),
      h('div', {}, h('strong', { text: 'Correct. ' }), `The answer is ${escapeHtml(key)}.`),
    );
  }
  return h(
    'div',
    { class: 'feedback wrong' },
    h('span', { html: iconHTML('help') }),
    h(
      'div',
      {},
      h('strong', { text: 'Not quite. ' }),
      `Your answer: ${escapeHtml(shown || 'blank')}. Correct answer: ${escapeHtml(key)}.`,
    ),
  );
}

function selectChoice(qid, label) {
  if (state.reviewing) return;
  const current = state.answers[qid];
  state.answers[qid] = current === label ? null : label;
  saveSession();
  renderQuestion();
}

function toggleEliminated(qid, label) {
  if (state.reviewing) return;
  const set = new Set(state.eliminated[qid] || []);
  if (set.has(label)) set.delete(label);
  else {
    set.add(label);
    if (state.answers[qid] === label) state.answers[qid] = null;
  }
  state.eliminated[qid] = [...set];
  saveSession();
  renderQuestion();
}

function toggleFlag(qid) {
  state.flags[qid] = !state.flags[qid];
  if (!state.flags[qid]) delete state.flags[qid];
  saveSession();
  renderQuestion();
}

function renderTokens(container, tokens) {
  let pendingSpace = false;
  let forceSpaceAfterMath = false;
  let last = '';

  const prevAllowsSpace = () => last && !/[\s([{\u2018\u201c]/.test(last);
  const nextAllowsSpace = (v) => !/^[.,;:?!)\]}%\u2019\u201d]/.test(v);

  for (const token of tokens) {
    if (token.t === 'space') {
      pendingSpace = true;
      continue;
    }
    if (token.t === 'text') {
      const v = String(token.v || '');
      if (!v) continue;
      if ((pendingSpace || forceSpaceAfterMath) && prevAllowsSpace() && nextAllowsSpace(v)) {
        container.append(' ');
      }
      pendingSpace = false;
      forceSpaceAfterMath = false;
      container.append(document.createTextNode(v));
      last = v[v.length - 1];
    } else if (token.t === 'math') {
      if (pendingSpace && prevAllowsSpace()) container.append(' ');
      const img = document.createElement('img');
      img.className = 'math-inline';
      img.src = token.src;
      img.alt = 'Math expression';
      img.draggable = false;
      img.loading = 'eager';
      img.style.setProperty('--mh', String(token.h));
      img.style.setProperty('--mw', String(token.w));
      container.appendChild(img);
      last = 'M';
      pendingSpace = false;
      forceSpaceAfterMath = true;
    }
  }
}

/* ==========================================================================
   Navigation & timer
   ========================================================================== */

function goTo(index) {
  if (!state.test) return;
  const bounded = Math.max(0, Math.min(index, state.test.questions.length - 1));
  if (bounded === state.index) {
    updateNav();
    return;
  }
  state.index = bounded;
  saveSession();
  renderQuestion();
  document.getElementById('tools')?.classList.remove('open');
}

function renderNavPills() {
  const strip = document.getElementById('nav-strip');
  if (!strip) return;
  strip.innerHTML = '';
  const questions = state.test.questions;
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const answered = isAnswered(q, state.answers[q.id]);
    const flagged = !!state.flags[q.id];
    let reviewClass = '';
    if (state.reviewing) {
      const key = state.key[q.id];
      if (key) reviewClass = isCorrect(q, state.answers[q.id], key) ? 'correct' : 'incorrect';
    }
    const pill = h('button', {
      type: 'button',
      class: `nav-pill ${answered ? 'answered' : ''} ${i === state.index ? 'current' : ''} ${
        flagged ? 'flagged' : ''
      } ${reviewClass}`.trim(),
      text: String(i + 1),
      'aria-label': `Question ${i + 1}`,
      onclick: () => goTo(i),
    });
    strip.append(pill);
  }
  const current = strip.querySelector('.nav-pill.current');
  if (current) {
    const target = current.offsetLeft - strip.clientWidth / 2 + current.offsetWidth / 2;
    strip.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }
}

function updateNav() {
  renderNavPills();
  const summary = document.getElementById('nav-summary');
  if (summary) {
    const total = state.test.questions.length;
    const answered = state.test.questions.filter((q) => isAnswered(q, state.answers[q.id])).length;
    const flagged = Object.values(state.flags).filter(Boolean).length;
    summary.textContent = `${answered}/${total} answered${flagged ? ` · ${flagged} flagged` : ''}`;
  }
  const back = document.getElementById('back-btn');
  const next = document.getElementById('next-btn');
  if (back) back.disabled = state.index === 0;
  if (next) {
    const last = state.index >= state.test.questions.length - 1;
    const label = next.querySelector('.label');
    if (label) label.textContent = last ? 'Review' : 'Next';
    next.classList.toggle('primary', true);
  }
  updateTimerDisplay();
}

function startTimer() {
  stopTimer();
  if (!state.running) return;
  state.tickBase = Date.now();
  state.tickRemaining = state.timeLeft;
  timerId = setInterval(tickTimer, 250);
  tickTimer();
}

function syncTimer() {
  if (!state.running || !Number.isFinite(state.tickBase)) return;
  const elapsed = Math.floor((Date.now() - state.tickBase) / 1000);
  state.timeLeft = Math.max(0, state.tickRemaining - elapsed);
}

function tickTimer() {
  if (!state.running) return;
  syncTimer();
  updateTimerDisplay();

  const now = Date.now();
  if (!state.lastSaveAt || now - state.lastSaveAt > 5000) {
    state.lastSaveAt = now;
    saveSession();
  }

  if (state.timeLeft <= 0) {
    stopTimer();
    state.running = false;
    toast("Time's up — here are your results.");
    showResults();
  }
}

function stopTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
}

function updateTimerDisplay() {
  const el = document.getElementById('timer');
  if (!el) return;
  el.textContent = fmtTime(state.timeLeft);
  el.classList.toggle('warning', state.timeLeft <= 5 * 60);
}

function pauseTest() {
  if (state.reviewing) return;
  syncTimer();
  state.running = false;
  stopTimer();
  saveSession();
  const body = h('div', { class: 'pause-screen-inner' }, [
    h('div', { class: 'parse-icon', html: iconHTML('pause') }),
    h('h2', { text: 'Paused' }),
    h('p', {
      text: "The timer is stopped. Your answers are saved — resume whenever you're ready.",
    }),
  ]);
  const modal = showModal({
    title: '',
    body,
    dismissible: false,
    className: 'pause-screen',
    footer: [
      h('button', {
        class: 'btn',
        type: 'button',
        text: 'Review',
        onclick: () => {
          closeModal();
          openReviewDialog();
        },
      }),
      h('button', {
        class: 'btn primary',
        type: 'button',
        text: 'Resume',
        onclick: () => {
          closeModal();
          state.running = true;
          startTimer();
        },
      }),
    ],
  });
  modal.el.classList.add('pause-screen');
}

/* ==========================================================================
   Keyboard
   ========================================================================== */

function onGlobalKeydown(e) {
  if (currentModal) {
    if (e.key === 'Escape') {
      const closeBtn = currentModal.modal.querySelector('.modal-head .icon-btn');
      if (closeBtn) closeBtn.click();
    }
    return;
  }
  if (state.view !== 'test' || !state.test || state.reviewing) return;
  const target = e.target;
  if (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  ) {
    return;
  }
  const q = state.test.questions[state.index];
  if (!q) return;

  if (q.type === 'mc' && /^[a-h]$/i.test(e.key)) {
    const label = e.key.toUpperCase();
    if (q.choices.some((c) => c.label === label)) {
      e.preventDefault();
      selectChoice(q.id, label);
    }
    return;
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    goTo(state.index - 1);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    goTo(state.index + 1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (state.index < state.test.questions.length - 1) goTo(state.index + 1);
    else openReviewDialog();
  } else if (e.key.toLowerCase() === 'f') {
    e.preventDefault();
    toggleFlag(q.id);
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    state.answers[q.id] = q.type === 'mc' ? null : '';
    saveSession();
    renderQuestion();
  }
}

/* ==========================================================================
   Results & review
   ========================================================================== */

function openReviewDialog() {
  if (!state.test) return;
  const questions = state.test.questions;
  const answered = questions.filter((q) => isAnswered(q, state.answers[q.id])).length;
  const flagged = questions.filter((q) => state.flags[q.id]).length;

  const body = h('div');
  body.append(
    h('p', {
      text: `${answered} of ${questions.length} answered${flagged ? ` · ${flagged} flagged` : ''}. Click a number to jump to that question.`,
      style: { marginTop: 0 },
    }),
  );

  const grid = h('div', { class: 'review-grid' });
  questions.forEach((q, i) => {
    const isAns = isAnswered(q, state.answers[q.id]);
    grid.append(
      h('button', {
        type: 'button',
        class: `review-jump ${isAns ? 'answered' : ''} ${state.flags[q.id] ? 'flagged' : ''} ${
          i === state.index ? 'current' : ''
        }`.trim(),
        text: String(i + 1),
        'aria-label': `Question ${i + 1}${isAns ? ', answered' : ', blank'}${
          state.flags[q.id] ? ', flagged' : ''
        }`,
        onclick: () => {
          closeModal();
          goTo(i);
        },
      }),
    );
  });
  body.append(grid);
  body.append(
    h(
      'div',
      { class: 'review-legend' },
      h('span', {}, h('i', { class: 'sw-answered' }), 'Answered'),
      h('span', {}, h('i', { class: 'sw-blank' }), 'Blank'),
      h('span', {}, h('i', { class: 'sw-flagged' }), 'Flagged'),
    ),
  );

  showModal({
    title: 'Review your answers',
    body,
    wide: true,
    footer: [
      h('button', { class: 'btn', type: 'button', text: 'Keep working', onclick: () => closeModal() }),
      h('button', {
        class: 'btn primary',
        type: 'button',
        text: 'Submit test',
        onclick: () => {
          closeModal();
          confirmSubmit();
        },
      }),
    ],
  });
}

function confirmSubmit() {
  if (!state.test) return;
  const stats = computeStats();
  const unanswered = stats.total - stats.answered;
  if (!unanswered) {
    showResults();
    return;
  }
  showModal({
    title: 'Submit with unanswered questions?',
    body: h('p', {
      text: `You still have ${unanswered} unanswered question${
        unanswered === 1 ? '' : 's'
      }. You can keep working or submit now.`,
      style: { marginTop: 0 },
    }),
    footer: [
      h('button', { class: 'btn', type: 'button', text: 'Keep working', onclick: () => closeModal() }),
      h('button', {
        class: 'btn primary',
        type: 'button',
        text: 'Submit anyway',
        onclick: () => {
          closeModal();
          showResults();
        },
      }),
    ],
  });
}

function showResults() {
  if (!state.test) return;
  closeModal();
  stopTimer();
  state.running = false;
  state.reviewing = false;
  state.submitted = true;
  state.view = 'review';
  saveSession();
  renderResults();
}

function computeStats() {
  const questions = state.test.questions;
  let answered = 0;
  let flagged = 0;
  let keyed = 0;
  let correct = 0;
  for (const q of questions) {
    const response = state.answers[q.id];
    if (isAnswered(q, response)) answered++;
    if (state.flags[q.id]) flagged++;
    const key = state.key[q.id];
    if (key) {
      keyed++;
      if (isCorrect(q, response, key)) correct++;
    }
  }
  return { total: questions.length, answered, flagged, keyed, correct };
}

function renderResults() {
  const test = state.test;
  if (!test) {
    renderHome();
    return;
  }
  state.view = 'review';
  document.title = `Results · ${test.title}`;
  const stats = computeStats();
  const usedSeconds = Math.max(0, MODULE_SECONDS - state.timeLeft);
  const keyedAll = stats.keyed === stats.total;

  const rows = test.questions
    .map((q, i) => {
      const response = state.answers[q.id];
      const key = state.key[q.id];
      const answered = isAnswered(q, response);
      let status = 'blank';
      let statusText = 'Blank';
      if (!key) {
        status = 'unkeyed';
        statusText = 'Not keyed';
      } else if (isCorrect(q, response, key)) {
        status = 'correct';
        statusText = 'Correct';
      } else if (answered) {
        status = 'wrong';
        statusText = 'Incorrect';
      }
      const your = q.type === 'mc' ? response || '—' : response || '—';
      return `
        <button class="review-row" type="button" data-index="${i}">
          <span class="rn">${i + 1}</span>
          <span class="rskill">${escapeHtml(q.skill || q.domain || 'Question')}</span>
          <span class="ranswer">Your: ${escapeHtml(your)}</span>
          <span class="ranswer">Key: ${escapeHtml(key || '—')}</span>
          <span class="status-pill ${status}">${statusText}</span>
        </button>`;
    })
    .join('');

  app.innerHTML = `
    ${homeTopbar()}
    <section class="review">
      <div class="review-head">
        <div>
          <h1>Results</h1>
          <p>${escapeHtml(test.title)} · ${fmtDate(test.createdAt)} · ${fmtTime(usedSeconds)} used</p>
        </div>
        <span class="spacer"></span>
        <button class="btn" id="back-to-test" type="button">${iconHTML('arrowLeft')} Back to questions</button>
      </div>

      <div class="summary-grid">
        <div class="summary-card ${stats.keyed && stats.correct === stats.keyed ? 'good' : ''}">
          <div class="label">Correct</div>
          <div class="value">${stats.keyed ? `${stats.correct}<small> / ${stats.keyed}</small>` : '—'}</div>
        </div>
        <div class="summary-card">
          <div class="label">Answered</div>
          <div class="value">${stats.answered}<small> / ${stats.total}</small></div>
        </div>
        <div class="summary-card">
          <div class="label">Flagged</div>
          <div class="value">${stats.flagged}</div>
        </div>
        <div class="summary-card">
          <div class="label">Time used</div>
          <div class="value">${fmtTime(usedSeconds)}</div>
        </div>
      </div>

      ${
        keyedAll
          ? ''
          : `<div class="key-warning">
               ${iconHTML('info')}
               <div>${stats.keyed} of ${stats.total} questions have an answer key. These PDFs do not include one, so add the rest to get a full score.</div>
               <span class="spacer"></span>
               <button class="btn small" id="edit-key" type="button">Edit answer key</button>
             </div>`
      }

      <div class="review-list">${rows}</div>

      <div class="review-actions">
        <button class="btn primary" id="retake" type="button">${iconHTML('refresh')} Retake</button>
        <button class="btn" id="edit-key-2" type="button">Edit answer key</button>
        <button class="btn" id="export-results" type="button">${iconHTML('download')} Export results</button>
        <button class="btn" id="new-pdf" type="button">${iconHTML('upload')} Open another PDF</button>
      </div>
    </section>`;

  document.getElementById('open-settings').addEventListener('click', openSettings);
  document.getElementById('back-to-test').addEventListener('click', () => {
    state.reviewing = true;
    state.index = 0;
    renderTest();
  });
  document.getElementById('edit-key')?.addEventListener('click', openKeyEditor);
  document.getElementById('edit-key-2').addEventListener('click', openKeyEditor);
  document.getElementById('retake').addEventListener('click', retakeTest);
  document.getElementById('export-results').addEventListener('click', exportResults);
  document.getElementById('new-pdf').addEventListener('click', renderHome);
  document.querySelector('.review-list').addEventListener('click', (e) => {
    const row = e.target.closest('.review-row');
    if (!row) return;
    state.reviewing = true;
    state.index = Number(row.dataset.index);
    renderTest();
  });
}

function retakeTest() {
  if (!state.test) return;
  clearSession(state.test.id);
  state.answers = {};
  state.eliminated = {};
  state.flags = {};
  state.index = 0;
  state.timeLeft = MODULE_SECONDS;
  state.reviewing = false;
  state.submitted = false;
  state.running = true;
  renderTest();
  startTimer();
}

function exportResults() {
  const test = state.test;
  const stats = computeStats();
  const rows = test.questions.map((q, i) => {
    const response = state.answers[q.id];
    const key = state.key[q.id] || null;
    return {
      number: i + 1,
      id: q.id,
      domain: q.domain,
      skill: q.skill,
      difficulty: q.difficulty,
      type: q.type,
      response: response || null,
      key,
      correct: key ? isCorrect(q, response, key) : null,
      flagged: !!state.flags[q.id],
    };
  });
  downloadJson(`sat-results-${test.id}.json`, {
    test: test.title,
    exportedAt: new Date().toISOString(),
    timeUsedSeconds: Math.max(0, MODULE_SECONDS - state.timeLeft),
    stats,
    questions: rows,
  });
  toast('Results exported.');
}

/* ==========================================================================
   Answer key editor
   ========================================================================== */

function openKeyEditor() {
  if (!state.test) return;
  const rows = state.test.questions.map((q, i) => {
    const row = h('div', { class: 'key-row' });
    row.append(h('span', { class: 'kq', text: String(i + 1) }));
    const info = h('div', { class: 'kinfo' });
    info.append(
      h('strong', { text: q.skill || q.domain || `Question ${i + 1}` }),
      h('span', { text: `${q.type === 'mc' ? 'Multiple choice' : 'Grid-in'} · ${q.id}` }),
    );
    row.append(info);

    let control;
    if (q.type === 'mc') {
      control = h('select', { 'aria-label': `Answer key for question ${i + 1}` });
      control.append(h('option', { value: '', text: 'Not set' }));
      for (const c of q.choices) {
        control.append(
          h('option', { value: c.label, text: `Choice ${c.label}` }),
        );
      }
      control.value = state.key[q.id] || '';
    } else {
      control = h('input', {
        type: 'text',
        placeholder: 'e.g. 2.5 or 3/4',
        'aria-label': `Answer key for question ${i + 1}`,
        value: state.key[q.id] || '',
      });
    }
    control.dataset.qid = q.id;
    row.append(control);
    return row;
  });

  const container = h('div', { class: 'key-editor' }, rows);
  const body = h('div');
  body.append(
    h('p', {
      text: 'The question-bank PDFs do not include answer keys. Set them here (or correct the derived sample key). Keys are saved for this test in your browser.',
      style: { marginTop: 0 },
    }),
    container,
  );

  showModal({
    title: 'Answer key',
    wide: true,
    body,
    footer: [
      h('button', {
        class: 'btn',
        type: 'button',
        text: 'Clear all',
        onclick: () => {
          for (const control of container.querySelectorAll('select, input')) {
            control.value = '';
          }
        },
      }),
      h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => closeModal() }),
      h('button', {
        class: 'btn primary',
        type: 'button',
        text: 'Save key',
        onclick: () => {
          const next = {};
          for (const control of container.querySelectorAll('select, input')) {
            next[control.dataset.qid] = control.value.trim();
          }
          state.key = next;
          saveKey(state.test.id, state.key);
          closeModal();
          if (state.view === 'review') renderResults();
          else if (state.view === 'test') renderQuestion();
          toast('Answer key saved.');
        },
      }),
    ],
  });
}

/* ==========================================================================
   Settings / directions
   ========================================================================== */

function openSettings() {
  const body = h('div');
  const field = h('div', { class: 'field' });
  const input = h('input', {
    type: 'text',
    placeholder: 'Desmos API key (optional)',
    value: state.desmosKey,
    autocomplete: 'off',
    spellcheck: 'false',
  });
  field.append(
    h('label', { text: 'Desmos API key' }),
    input,
    h('div', {
      class: 'hint',
      text: 'Without a key the app embeds the public Desmos calculator in an iframe. With a key it uses the full Desmos JS API. Get one at desmos.com/api.',
    }),
  );

  body.append(
    h('p', {
      text: 'Everything runs on this device. Parsed tests, answers, notes, and keys are stored in your browser.',
      style: { marginTop: 0 },
    }),
    field,
    h('h3', { text: 'Tips' }),
    h(
      'ul',
      {},
      h('li', { text: 'Answer keys are not present in College Board PDF exports — add them under Review → Edit answer key.' }),
      h('li', { text: 'Math is cropped from the rendered page, so it stays faithful even when the text layer hides it.' }),
      h('li', { text: 'Use the Built-in calculator if the Desmos embed is blocked by your network.' }),
    ),
  );

  showModal({
    title: 'Settings',
    body,
    footer: [
      h('button', {
        class: 'btn danger',
        type: 'button',
        text: 'Clear all cached tests',
        onclick: async () => {
          const tests = await store.listTests();
          for (const t of tests) {
            await store.deleteTest(t.id);
            clearTestLocalData(t.id);
          }
          closeModal();
          toast('Cached tests cleared.');
          renderHome();
        },
      }),
      h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => closeModal() }),
      h('button', {
        class: 'btn primary',
        type: 'button',
        text: 'Save',
        onclick: () => {
          state.desmosKey = input.value.trim();
          if (state.desmosKey) localStorage.setItem('sb:desmosKey', state.desmosKey);
          else localStorage.removeItem('sb:desmosKey');
          closeModal();
          mountCalculator();
          toast('Settings saved.');
        },
      }),
    ],
  });
}

function showDirections() {
  showModal({
    title: 'Math — Module 1',
    body: `
      <p><strong>Time: 35 minutes.</strong> The timer starts when you open the test and can be paused.</p>
      <h3>Directions</h3>
      <p>For each question, choose the best answer. You may use a calculator on all questions.</p>
      <h3>Grid-ins</h3>
      <ul>
        <li>Enter a number, decimal, or fraction (for example <code>3/4</code>).</li>
        <li>Negative answers are allowed.</li>
        <li>Do not include units or symbols in the answer box.</li>
      </ul>
      <h3>Tools</h3>
      <p>The Calculator, Reference, and Notes panels are available on every question. Flag any question to come back to it, and use the navigator at the bottom to jump around.</p>
      <p class="muted">This is an unofficial practice tool. It is not affiliated with the College Board.</p>`,
    footer: h('button', { class: 'btn primary', type: 'button', text: 'Got it', onclick: () => closeModal() }),
  });
}

/* ==========================================================================
   Storage helpers
   ========================================================================== */

function sessionKey(id) {
  return `sb:session:${id}`;
}
function keyKey(id) {
  return `sb:key:${id}`;
}
function notesKey(id) {
  return `sb:notes:${id}`;
}

function saveSession() {
  if (!state.test) return;
  syncTimer();
  try {
    localStorage.setItem(
      sessionKey(state.test.id),
      JSON.stringify({
        answers: state.answers,
        eliminated: state.eliminated,
        flags: state.flags,
        index: state.index,
        timeLeft: state.timeLeft,
        submitted: state.submitted,
        savedAt: Date.now(),
      }),
    );
  } catch {
    /* storage may be unavailable */
  }
}

function loadSession(id) {
  try {
    const raw = localStorage.getItem(sessionKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSession(id) {
  try {
    localStorage.removeItem(sessionKey(id));
  } catch {
    /* ignore */
  }
}

function clearTestLocalData(id) {
  clearSession(id);
  try {
    localStorage.removeItem(keyKey(id));
    localStorage.removeItem(notesKey(id));
  } catch {
    /* ignore */
  }
}

function loadKey(test) {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(keyKey(test.id)) || '{}') || {};
  } catch {
    stored = {};
  }
  const out = {};
  for (const q of test.questions) {
    const hasOverride = Object.prototype.hasOwnProperty.call(stored, q.id);
    out[q.id] = hasOverride
      ? stored[q.id] || ''
      : q.answerKey || KNOWN_KEYS[q.id] || '';
  }
  return out;
}

function saveKey(testId, key) {
  try {
    localStorage.setItem(keyKey(testId), JSON.stringify(key));
  } catch {
    /* ignore */
  }
}

/* ==========================================================================
   Grading helpers
   ========================================================================== */

function isAnswered(q, response) {
  if (response === null || response === undefined) return false;
  const value = String(response).trim();
  if (!value) return false;
  if (q.type === 'mc') return /^[A-H]$/i.test(value);
  return true;
}

function numericValue(value) {
  if (value === null || value === undefined) return NaN;
  const text = String(value).trim().replace(/,/g, '');
  if (!text) return NaN;
  if (/^-?\d+\s*\/\s*-?\d+$/.test(text)) {
    const [a, b] = text.split('/').map((x) => Number(x.trim()));
    return b === 0 ? NaN : a / b;
  }
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)) return Number(text);
  return NaN;
}

function isCorrect(q, response, key) {
  if (key === null || key === undefined || key === '') return null;
  if (q.type === 'mc') {
    return String(response || '').trim().toUpperCase() === String(key).trim().toUpperCase();
  }
  const a = numericValue(response);
  const b = numericValue(key);
  if (Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) < 1e-6;
  return String(response || '').trim().toLowerCase() === String(key).trim().toLowerCase();
}

/* ==========================================================================
   Start
   ========================================================================== */

init();
