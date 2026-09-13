// Premium UI verification shots: landing (desktop+mobile) + legal page.
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.resolve(__dirname, 'ui');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, 'landing-desktop.png'), fullPage: true });

  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mpage = await mctx.newPage();
  await mpage.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
  await mpage.waitForTimeout(1200);
  await mpage.screenshot({ path: path.join(OUT, 'landing-mobile.png'), fullPage: true });

  await page.goto('http://127.0.0.1:3000/terms', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'legal-desktop.png'), fullPage: false });

  console.log('Console/page errors:', errors.length ? errors.slice(0, 6) : 'none');
  await browser.close();
})();
