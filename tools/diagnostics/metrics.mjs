import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });

async function run(width, height, label) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.locator('#load-sample').click();
  await page.waitForSelector('.question-card');
  await page.waitForTimeout(600);
  const report = await page.evaluate(() => {
    const math = [...document.querySelectorAll('.prompt img, .choice img')].map((img) => {
      const r = img.getBoundingClientRect();
      return {
        w: +r.width.toFixed(1),
        h: +r.height.toFixed(1),
        nw: img.naturalWidth,
        nh: img.naturalHeight,
        ratioErr: Math.abs(r.width / r.height - img.naturalWidth / img.naturalHeight) / (img.naturalWidth / img.naturalHeight),
      };
    });
    const card = document.querySelector('.question-card').getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      maxRatioErr: Math.max(...math.map((m) => m.ratioErr)),
      widest: Math.max(...math.map((m) => m.w)),
      cardW: +card.width.toFixed(0),
      math: math.length,
    };
  });
  // Q4 display equation
  await page.locator('.nav-pill >> nth=3').click();
  await page.waitForTimeout(300);
  const q4 = await page.evaluate(() => {
    const img = document.querySelector('.math-block img');
    if (!img) return null;
    const r = img.getBoundingClientRect();
    const card = document.querySelector('.question-card').getBoundingClientRect();
    return {
      w: +r.width.toFixed(1),
      h: +r.height.toFixed(1),
      nw: img.naturalWidth,
      nh: img.naturalHeight,
      ratioErr: Math.abs(r.width / r.height - img.naturalWidth / img.naturalHeight) / (img.naturalWidth / img.naturalHeight),
      fits: r.right <= window.innerWidth && r.left >= 0,
      cardW: +card.width.toFixed(0),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  console.log(label, JSON.stringify({ report, q4 }));
  await ctx.close();
}

await run(1440, 960, 'desktop');
await run(390, 844, 'mobile');
await browser.close();
