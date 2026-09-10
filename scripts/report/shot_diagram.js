// Screenshot the architecture diagram HTML to PNG at 2x device scale (300dpi print quality).
// This is the sanctioned diagram pipeline (PNG sub-element embedding), NOT document PDF generation.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1000, height: 900 },
    deviceScaleFactor: 2,
  });
  await page.goto('file://' + path.resolve(__dirname, 'diagram.html'));
  await page.waitForTimeout(300);
  const body = await page.locator('body');
  await body.screenshot({ path: path.resolve(__dirname, 'diagram.png') });
  const box = await body.boundingBox();
  console.log('Diagram PNG saved. Logical size:', box.width, 'x', box.height);
  await browser.close();
})();
