let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (_) {
  ({ chromium } = require('../frontend/node_modules/playwright'));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let hasError = false;

  page.on('console', (msg) => {
    const text = msg.text();
    if (
      msg.type() === 'warning' ||
      msg.type() === 'error' ||
      text.includes('shadow')
    ) {
      console.log(`[CONSOLE ISSUE] ${text}`);
      hasError = true;
    }
  });

  await page.goto('http://127.0.0.1:8081', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  await browser.close();

  if (hasError) {
    console.error("❌ Console issues detected");
    process.exit(1);
  }

  console.log("✅ Console clean");
})();
