import { chromium } from '@playwright/test';

async function debugPage() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Enable console logging
  page.on('console', msg => {
    console.log('Browser console:', msg.type(), msg.text());
  });
  
  page.on('pageerror', err => {
    console.log('Page error:', err.message);
  });
  
  await page.goto('http://localhost:3000/auth/login', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(5000);
  
  // Get the body HTML
  const bodyHTML = await page.evaluate(() => document.body.innerHTML);
  console.log('\n=== Body HTML (first 2000 chars) ===');
  console.log(bodyHTML.substring(0, 2000));
  
  // Check for specific elements
  const elements = await page.evaluate(() => {
    return {
      form: document.querySelector('form')?.outerHTML?.substring(0, 200) || 'NOT FOUND',
      emailInput: document.querySelector('#email')?.outerHTML || 'NOT FOUND',
      passwordInput: document.querySelector('#password')?.outerHTML || 'NOT FOUND',
      buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).slice(0, 5),
      links: Array.from(document.querySelectorAll('a')).map(a => a.href).slice(0, 5),
    };
  });
  
  console.log('\n=== Elements found ===');
  console.log('Form:', elements.form);
  console.log('Email input:', elements.emailInput);
  console.log('Password input:', elements.passwordInput);
  console.log('Buttons:', elements.buttons);
  console.log('Links:', elements.links);
  
  await browser.close();
}

debugPage().catch(console.error);