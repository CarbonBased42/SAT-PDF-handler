import { chromium } from 'playwright-core';
import fs from 'node:fs';

const docs = '/wsl.localhost/Ubuntu-26.04/home/iangr/TEST/sat-bluebook/docs';
fs.mkdirSync(docs, { recursive: true });

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.locator('#load-sample').click();
await page.waitForSelector('.question-card');
await page.waitForTimeout(700);
await page.locator('#go-home').click();
await page.locator('.modal-foot .btn.primary').click();
await page.waitForSelector('.test-card');
await page.waitForTimeout(300);
await page.screenshot({ path: docs + '/home.png' });
await page.screenshot({ path: '/tmp/opencode/home-card.png' });
console.log('saved docs/home.png');
await browser.close();
