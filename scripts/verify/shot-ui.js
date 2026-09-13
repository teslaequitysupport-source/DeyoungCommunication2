// Premium UI verification shots: landing (desktop+mobile) + legal page.
// Also asserts: no horizontal overflow, mobile menu works, FAQ opens.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.resolve(__dirname, 'ui');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(OUT, 'landing-desktop.png'), fullPage: true });

  // Desktop overflow check
  const deskOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  console.log('desktop horizontal overflow px:', deskOverflow);

  // FAQ accordion opens
  await page.getByRole('button', { name: 'What does it cost?' }).click().catch((e) => errors.push('FAQ: ' + e.message));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'landing-faq-open.png'), fullPage: false });

  // Mobile
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mpage = await mctx.newPage();
  const merrors = [];
  mpage.on('pageerror', (e) => merrors.push(String(e)));
  mpage.on('console', (m) => { if (m.type() === 'error') merrors.push(m.text()); });

  await mpage.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
  await mpage.waitForTimeout(1400);
  const mobOverflow = await mpage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  console.log('mobile horizontal overflow px:', mobOverflow);
  await mpage.screenshot({ path: path.join(OUT, 'landing-mobile.png'), fullPage: true });

  // Mobile menu disclosure
  await mpage.getByRole('button', { name: 'Open menu' }).click();
  await mpage.waitForTimeout(300);
  const menuVisible = await mpage.getByRole('button', { name: 'Close menu' }).isVisible();
  console.log('mobile menu opens:', menuVisible);
  await mpage.screenshot({ path: path.join(OUT, 'landing-mobile-menu.png'), fullPage: false });
  await mpage.getByRole('button', { name: 'Close menu' }).click();
  await mpage.waitForTimeout(200);

  // Legal page
  await page.goto('http://127.0.0.1:3000/terms', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'legal-desktop.png'), fullPage: false });

  const all = [...errors, ...merrors];
  console.log('Console/page errors:', all.length ? all.slice(0, 6) : 'none');
  await browser.close();
  if (deskOverflow > 1 || mobOverflow > 1 || !menuVisible || all.length) process.exit(1);
})();
