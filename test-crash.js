const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));

  await page.goto('http://localhost:3001/');
  console.log("Navigated to home");
  
  // Wait for the quick match button and click it
  await page.waitForSelector('a[href="#new-game"]');
  await page.click('a[href="#new-game"]');
  console.log("Clicked Quick match anchor");
  
  // Click a time control like "1 + 0"
  await page.waitForSelector('button:has-text("1 + 0")');
  await page.click('button:has-text("1 + 0")');
  console.log("Clicked 1+0");

  await page.waitForTimeout(5000);
  console.log("Current URL:", page.url());

  await browser.close();
})();
