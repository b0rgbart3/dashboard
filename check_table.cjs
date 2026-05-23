const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/dashboard_table.png' });
  const headers = await page.evaluate(() => 
    Array.from(document.querySelectorAll('table thead th')).map(el => el.textContent.trim())
  );
  console.log('Headers:', JSON.stringify(headers));
  await browser.close();
})();
