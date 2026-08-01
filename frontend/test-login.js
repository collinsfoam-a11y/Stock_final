const { chromium } = require('playwright');

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Navigating to http://localhost:8081...');
    await page.goto('http://localhost:8081', { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('Page loaded successfully. URL:', page.url());

    // Wait for the UI to settle (Expo router can redirect)
    await page.waitForTimeout(5000);
    console.log('Current URL after wait:', page.url());

    if (page.url().includes('welcome')) {
       console.log('On welcome screen. Attempting to navigate to login...');
       // Click the button that says "Login", "Sign In", or similar
       const toLoginBtn = await page.getByRole('button').filter({ hasText: /login|sign in|get started/i }).first();
       if (await toLoginBtn.isVisible()) {
          await toLoginBtn.click();
          await page.waitForTimeout(3000);
          console.log('Navigated to:', page.url());
       } else {
          console.log('Could not find a login button on welcome screen.');
       }
    }

    // Try to find login inputs if on the login page
    const content = await page.content();
    if (content.includes('Username') || page.url().includes('login')) {
      console.log('On login screen. Attempting to fill credentials...');
      // Wait for username field (assuming placeholder or label)
      const usernameInput = await page.getByPlaceholder(/username/i).first();
      const passwordInput = await page.getByPlaceholder(/password/i).first();
      
      if (await usernameInput.isVisible()) {
         await usernameInput.fill('staff1');
         console.log('Filled username.');
      }
      if (await passwordInput.isVisible()) {
         await passwordInput.fill('pass123');
         console.log('Filled password.');
      }
      
      const submitBtn = await page.getByRole('button', { name: /login|sign in/i }).first();
      if (await submitBtn.isVisible()) {
         await submitBtn.click();
         console.log('Clicked login button.');
         await page.waitForTimeout(5000);
         console.log('After login URL:', page.url());
      } else {
         console.log('Could not find login button.');
      }
    } else {
      console.log('Not on login screen, perhaps already logged in or stuck on splash screen.');
    }
    
    console.log('Test completed successfully.');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
})();
