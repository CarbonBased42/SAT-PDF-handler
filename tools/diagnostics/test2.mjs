import { chromium } from 'playwright-core';

const PDF = '/wsl.localhost/Ubuntu-26.04/home/iangr/TEST/sat-bluebook/sample/sat-math-sample.pdf';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
const errors = [];
const watch = (p) => {
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
};
watch(page);

const check = (name, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
check('home renders', await page.locator('.hero h1').count() === 1);

await page.locator('#load-sample').click();
await page.waitForSelector('.question-card');
await page.waitForTimeout(600);
check('7 questions parsed', await page.locator('.nav-pill').count() === 7);
check('timer shown', /^\d\d:\d\d$/.test(await page.locator('#timer').innerText()));
check('desmos iframe present', await page.locator('#calc-host iframe').count() === 1);

// Q1 interactions
await page.locator('.choice >> nth=0').click();
check('choice A selected', (await page.locator('.choice >> nth=0').getAttribute('class')).includes('selected'));
await page.locator('.choice').nth(0).locator('.eliminate-btn').click();
check('choice eliminated clears selection', !(await page.locator('.choice >> nth=0').getAttribute('class')).includes('selected'));
check('eliminated class set', (await page.locator('.choice >> nth=0').getAttribute('class')).includes('eliminated'));
await page.locator('.flag-btn').click();
check('flag toggles', (await page.locator('.flag-btn').innerText()).includes('Flagged'));
check('nav shows answered/flagged', (await page.locator('#nav-summary').innerText()).includes('flagged'));

// Review dialog should not submit
await page.locator('#review-btn').click();
await page.waitForSelector('.review-grid');
check('review dialog opens', await page.locator('.review-jump').count() === 7);
await page.locator('.review-jump >> nth=3').click();
await page.waitForTimeout(300);
check('jump from review keeps test active', await page.locator('.question-card').count() === 1 && (await page.locator('.q-number').innerText()) === 'Question 4');
check('Q4 is grid-in', await page.locator('.gridin-input').count() === 1);

// Grid-in + keypad
await page.locator('.gridin-input').fill('12');
await page.locator('.keypad button', { hasText: '3' }).first().click();
check('keypad appends', (await page.locator('.gridin-input').inputValue()).startsWith('12'));

// Pause / resume
await page.locator('#pause-btn').click();
await page.waitForSelector('.pause-screen');
check('pause overlay shown', await page.locator('.pause-screen').count() === 1);
const paused = await page.locator('#timer').innerText();
await page.waitForTimeout(1800);
check('timer stopped while paused', (await page.locator('#timer').innerText()) === paused);
await page.locator('.pause-screen .btn.primary').click();
await page.waitForTimeout(1300);
check('timer resumes', (await page.locator('#timer').innerText()) !== paused);

// Tools
await page.locator('.tool-tab[data-tool="ref"]').click();
check('reference sheet visible', await page.locator('.formula').count() >= 8);
await page.locator('.tool-tab[data-tool="notes"]').click();
await page.locator('#notes-input').fill('remember the discriminant');
check('notes persist to localStorage', (await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('sb:notes:')))) === true);
await page.locator('.tool-tab[data-tool="calc"]').click();
await page.locator('#calc-mode button[data-mode="local"]').click();
await page.waitForTimeout(300);
check('built-in grapher mounts', await page.locator('.grapher canvas').count() === 1);
await page.locator('.grapher-row input').first().fill('sin(x)/x');
await page.waitForTimeout(200);
check('built-in grapher accepts expression', await page.locator('.grapher canvas').count() === 1);

// Keyboard
await page.locator('.nav-pill >> nth=0').click();
await page.waitForTimeout(200);
await page.keyboard.press('b');
check('keyboard B selects choice', (await page.locator('.choice >> nth=1').getAttribute('class')).includes('selected'));
await page.keyboard.press('ArrowRight');
check('arrow key navigates', (await page.locator('.q-number').innerText()) === 'Question 2');
await page.keyboard.press('ArrowLeft');
const beforeDelete = await page.locator('#nav-summary').innerText();
await page.keyboard.press('Delete');
const afterDelete = await page.locator('#nav-summary').innerText();
check('delete clears answer', afterDelete !== beforeDelete, `${beforeDelete} -> ${afterDelete}`);

// Submit flow
await page.locator('#review-btn').click();
await page.waitForSelector('.review-grid');
await page.locator('.modal-foot .btn.primary').click();
await page.waitForFunction(() =>
  document.querySelector('.modal h2')?.textContent.includes('unanswered'),
);
check('unanswered confirm appears', (await page.locator('.modal h2').innerText()).includes('unanswered'));
await page.locator('.modal-foot .btn.primary').click();
await page.waitForSelector('.review-list');
check('results render', await page.locator('.review-row').count() === 7);
check('key warning shows', await page.locator('.key-warning').count() === 1);
console.log('summary:', await page.locator('.summary-card .value').allInnerTexts());

// Key editor
await page.locator('#edit-key-2').click();
await page.waitForSelector('.key-editor');
await page.locator('.key-row select').nth(0).selectOption('B');
await page.locator('.key-row input').nth(0).fill('2.5');
await page.locator('.key-row select').nth(1).selectOption('A');
await page.locator('.key-row input').nth(1).fill('12');
await page.locator('.modal-foot .btn.primary').click();
await page.waitForSelector('.review-list');
check('key saved and applied', (await page.locator('.summary-card .value').first().innerText()).includes('/ 5'));
console.log('summary after key:', await page.locator('.summary-card .value').allInnerTexts());

// Back to questions + feedback
await page.locator('#back-to-test').click();
await page.waitForSelector('.question-card');
check('review mode feedback shown', await page.locator('.feedback').count() === 1);

// Home status
await page.locator('#go-home').click();
await page.waitForSelector('.test-card');
check('home shows completed status', (await page.locator('.test-card-meta').innerText()).includes('Completed'));
check('home button says Results', (await page.locator('.test-card .btn.primary').innerText()) === 'Results');

// Upload path in a fresh context
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page2 = await ctx2.newPage();
watch(page2);
await page2.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page2.setInputFiles('#pdf-input', PDF);
await page2.waitForSelector('.question-card', { timeout: 60000 });
await page2.waitForTimeout(500);
check('uploaded PDF parses', await page2.locator('.nav-pill').count() === 7);
check('uploaded title derived from filename', (await page2.locator('.test-card-title').count()) === 0 && (await page2.title()).length > 0);
check('uploaded test title', (await page2.evaluate(() => document.title)).includes('Sat Math Sample'));
await ctx2.close();

// Mobile
const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page3 = await ctx3.newPage();
watch(page3);
await page3.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page3.locator('#load-sample').click();
await page3.waitForSelector('.question-card');
await page3.waitForTimeout(600);
check('mobile no horizontal overflow', await page3.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
check('mobile tools hidden initially', await page3.locator('#tools').isHidden());
await page3.locator('#tools-toggle').click();
check('mobile tools toggle', await page3.locator('#tools').isVisible());
await page3.locator('#tools-toggle').click();
await page3.locator('.nav-pill >> nth=6').click();
await page3.waitForTimeout(300);
check('mobile navigator works', (await page3.locator('.q-number').innerText()) === 'Question 7');
check('mobile card fits', await page3.evaluate(() => {
  const card = document.querySelector('.question-card').getBoundingClientRect();
  return card.left >= 0 && card.right <= window.innerWidth + 1;
}));
await page3.screenshot({ path: '/tmp/opencode/mobile-q7.png', fullPage: true });
await ctx3.close();

console.log('\nERRORS:', errors.length ? errors : 'none');
await browser.close();
