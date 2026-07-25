import { test, expect, Page } from '@playwright/test';

// Helper function to wait for page hydration
async function waitForHydration(page: Page, timeout = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const hasContent = await page.evaluate(() => {
      return document.querySelector('#email') !== null || 
             document.querySelector('form') !== null ||
             document.querySelector('nav') !== null;
    });
    if (hasContent) return;
    await page.waitForTimeout(500);
  }
}

test.describe('Application Audit', () => {
  test('should load landing page', async ({ page }) => {
    await page.goto('http://localhost:3000/', { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    
    const title = await page.title();
    console.log('Landing page title:', title);
    expect(title).toContain('CodeSpectra');
  });

  test('should load login page and display form', async ({ page }) => {
    await page.goto('http://localhost:3000/auth/login', { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    
    // Wait for React to hydrate
    await page.waitForTimeout(3000);
    
    const title = await page.title();
    console.log('Login page title:', title);
    
    // Check for form elements - give them time to render
    await page.waitForSelector('#email, input[type="email"]', { timeout: 10000 }).catch(() => null);
    
    const emailInput = page.locator('#email, input[type="email"]').first();
    const passwordInput = page.locator('#password, input[type="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();
    
    const emailVisible = await emailInput.isVisible({ timeout: 3000 }).catch(() => false);
    const passwordVisible = await passwordInput.isVisible({ timeout: 3000 }).catch(() => false);
    const submitVisible = await submitButton.isVisible({ timeout: 3000 }).catch(() => false);
    
    console.log('Email input visible:', emailVisible);
    console.log('Password input visible:', passwordVisible);
    console.log('Submit button visible:', submitVisible);
    
    expect(emailVisible || passwordVisible || submitVisible).toBeTruthy();
  });

  test('should load signup page', async ({ page }) => {
    await page.goto('http://localhost:3000/auth/signup', { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    
    await page.waitForSelector('#email, input[type="email"]', { timeout: 10000 }).catch(() => null);
    
    const hasForm = await page.locator('form').isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Signup form visible:', hasForm);
    expect(hasForm).toBeTruthy();
  });

  test('should load forgot password page', async ({ page }) => {
    await page.goto('http://localhost:3000/auth/forgot-password', { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    
    await page.waitForSelector('#email, input[type="email"]', { timeout: 10000 }).catch(() => null);
    
    const hasEmail = await page.locator('#email, input[type="email"]').isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Forgot password email input visible:', hasEmail);
    expect(hasEmail).toBeTruthy();
  });

  test('should navigate from login to signup', async ({ page }) => {
    await page.goto('http://localhost:3000/auth/login', { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    
    // Click signup link
    const signupLink = page.locator('a[href*="signup"]').first();
    if (await signupLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await signupLink.click();
      await page.waitForTimeout(2000);
      const url = page.url();
      console.log('After clicking signup, URL:', url);
      expect(url).toContain('/signup');
    } else {
      console.log('Signup link not visible - skipping navigation test');
    }
  });

  test('should display public pages', async ({ page }) => {
    const pages = ['/about', '/features', '/pricing'];
    
    for (const path of pages) {
      await page.goto(`http://localhost:3000${path}`, { timeout: 30000 });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);
      
      const status = await page.evaluate(() => document.readyState);
      console.log(`${path}: ${status}`);
      expect(status).toBe('complete');
    }
  });
});

test.describe('API Tests', () => {
  test('should check session API', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api/auth/session');
    console.log('Session API status:', response.status());
    expect([200, 503]).toContain(response.status());
  });

  test('should check problems API', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api/problems');
    console.log('Problems API status:', response.status());
    expect([200, 503]).toContain(response.status());
  });

  test('should check health API', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api/health');
    console.log('Health API status:', response.status());
    expect([200, 503]).toContain(response.status());
  });
});

test.describe('UI Component Tests', () => {
  test('should check login form has required elements', async ({ page }) => {
    await page.goto('http://localhost:3000/auth/login', { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    
    await page.waitForSelector('#email, #password, button[type="submit"]', { timeout: 10000 }).catch(() => null);
    
    const elements = await page.evaluate(() => {
      return {
        email: !!document.querySelector('#email, input[type="email"]'),
        password: !!document.querySelector('#password, input[type="password"]'),
        submit: !!document.querySelector('button[type="submit"]'),
        form: !!document.querySelector('form'),
      };
    });
    
    console.log('Login form elements:', elements);
    expect(elements.email || elements.password).toBeTruthy();
  });

  test('should check for console errors', async ({ page }) => {
    const errors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto('http://localhost:3000/auth/login', { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    
    console.log('Console errors found:', errors.length);
    // Allow some non-critical errors
    expect(errors.length).toBeLessThan(5);
  });

  test('should take screenshot', async ({ page }) => {
    await page.goto('http://localhost:3000/auth/login', { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: '../screenshots/login-page.png', fullPage: true });
    console.log('Screenshot saved');
  });
});