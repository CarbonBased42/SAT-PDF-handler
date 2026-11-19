import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
for (const width of [320, 360, 390, 768, 1024]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.locator('#load-sample').click();
  await page.waitForSelector('.question-card');
  await page.waitForTimeout(400);
  const out = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.topbar > *, .topbar-right > *')];
    const boxes = els.map((e) => {
      const r = e.getBoundingClientRect();
      return { tag: e.id || e.className || e.tagName, l: +r.left.toFixed(0), r: +r.right.toFixed(0), w: +r.width.toFixed(0) };
    });
    const overlaps = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.l < b.r && b.l < a.r) overlaps.push(`${a.tag} <> ${b.tag}`);
      }
    }
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      topbarOverflow: document.querySelector('.topbar').scrollWidth - document.querySelector('.topbar').clientWidth,
      boxes,
      overlaps,
      toolsToggleVisible: getComputedStyle(document.querySelector('#tools-toggle')).display !== 'none',
    };
  });
  console.log(width, JSON.stringify(out));
  await ctx.close();
}
await browser.close();
