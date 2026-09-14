// Signed-in UI smoke: create account, screenshot the redesigned app shell
// (overview, characters, studio) and capture console errors.
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.resolve(__dirname, 'ui');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  // Create a fresh account through the real auth form
  const stamp = Date.now();
  await page.getByRole('tab', { name: /create account/i }).click();
  await page.fill('#signup-name', 'Ada Preview');
  await page.fill('#signup-email', `ada.preview.${stamp}@example.com`);
  await page.fill('#signup-password', 'PreviewPass123');
  await page.getByRole('button', { name: /create account/i }).last().click();
  await page.waitForURL('http://127.0.0.1:3000/', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500); // session redirect + shell mount

  await page.screenshot({ path: path.join(OUT, 'app-overview.png'), fullPage: true });

  await page.getByRole('tab', { name: /characters/i }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, 'app-characters.png'), fullPage: true });

  await page.getByRole('tab', { name: /live studio/i }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, 'app-studio.png'), fullPage: true });

  await page.getByRole('tab', { name: /settings/i }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, 'app-settings.png'), fullPage: true });

  console.log('Signed-in smoke complete. Console/page errors:', errors.length ? errors.slice(0, 8) : 'none');
  await browser.close();
})();
