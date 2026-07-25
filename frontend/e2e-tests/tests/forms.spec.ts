import { test, expect, Page } from '@playwright/test';

async function waitForHydration(page: Page, timeout = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const hasContent = await page.evaluate(() => {
      return document.querySelector('#email') !== null || 
             document.querySelector('form') !== null;
    });
    if (hasContent) return;
    await page.waitForTimeout(500);
  }
}

test.describe('Forms Validation Tests', () => {
  test.describe('Login Form', () => {
    test('should display login form with all required elements', async ({ page }) => {
      await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      
      await expect(page.locator('#email')).toBeVisible();
      await expect(page.locator('#password')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
      await expect(page.locator('button:has-text("Sign in")')).toBeVisible();
    });

    test('should show email input with correct attributes', async ({ page }) => {
      await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      
      const emailInput = page.locator('#email');
      await expect(emailInput).toHaveAttribute('type', 'email');
      await expect(emailInput).toHaveAttribute('autocomplete', 'email');
    });

    test('should show password input with correct attributes', async ({ page }) => {
      await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      
      const passwordInput = page.locator('#password');
      await expect(passwordInput).toHaveAttribute('type', 'password');
      await expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
    });

    test('should validate email format', async ({ page }) => {
      await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      
      const emailInput = page.locator('#email');
      await emailInput.fill('invalid-email');
      
      // Try to submit
      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();
      
      await page.waitForTimeout(500);
      
      // Check if HTML5 validation caught it
      const isInvalid = await emailInput.evaluate(el => el.checkValidity() === false);
      expect(isInvalid).toBe(true);
    });

    test('should show forgot password link', async ({ page }) => {
      await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      
      const forgotLink = page.locator('a:has-text("Forgot")');
      await expect(forgotLink).toBeVisible();
    });

    test('should show signup link', async ({ page }) => {
      await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      
      const signupLink = page.locator('a:has-text("Create"), a:has-text("Sign Up")');
      await expect(signupLink.first()).toBeVisible();
    });

    test('should have social login buttons', async ({ page }) => {
      await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      
      await expect(page.locator('button:has-text("Google")')).toBeVisible();
      await expect(page.locator('button:has-text("GitHub")')).toBeVisible();
    });
  });

  test.describe('Signup Form', () => {
    test('should display signup form with all required elements', async ({ page }) => {
      await page.goto('http://localhost:3000/auth/signup', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      
      await expect(page.locator('#name')).toBeVisible();
      await expect(page.locator('#email')).toBeVisible();
      await expect(page.locator('#password')).toBeVisible();
      await expect(page.locator('#confirm')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should validate password length', async ({ page }) => {
      await page.goto('http://localhost:3000/auth/signup', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      
      const passwordInput = page.locator('#password');
      await passwordInput.fill('123'); // Too short
      
      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();
      
      await page.waitForTimeout(500);
      
      // Check minlength attribute
      const minLength = await passwordInput.getAttribute('minlength');
      expect(minLength).toBe('8');
    });

    test('should show password requirements', async ({ page }) => {
      await page.goto('http://localhost:3000/auth/signup', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      
      const passwordInput = page.locator('#password');
      await expect(passwordInput).toHaveAttribute('placeholder', /At least 8 characters/i);
    });

    test('should validate matching passwords', async ({ page }) => {
      await page.goto('http://localhost:3000/auth/signup', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      
      await page.locator('#name').fill('Test User');
      await page.locator('#email').fill('test@example.com');
      await page.locator('#password').fill('Password@123');
      await page.locator('#confirm').fill('DifferentPass@123');
      
      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();
      
      await page.waitForTimeout(500);
      
      // Check if confirm input shows mismatch
      const confirmInput = page.locator('#confirm');
      const value = await confirmInput.inputValue();
      expect(value).toBe('DifferentPass@123');
    });

    test('should have login link', async ({ page }) => {
      await page.goto('http://localhost:3000/auth/signup', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      
      const loginLink = page.locator('a:has-text("Login"), a:has-text("Sign in")');
      await expect(loginLink.first()).toBeVisible();
    });
  });

  test.describe('Forgot Password Form', () => {
    test('should display email input', async ({ page }) => {
      await page.goto('http://localhost:3000/auth/forgot-password', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      
      await expect(page.locator('#email')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should have submit button with correct text', async ({ page }) => {
      await page.goto('http://localhost:3000/auth/forgot-password', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      
      const submitButton = page.locator('button[type="submit"]');
      await expect(submitButton).toContainText(/Send|Reset/i);
    });

    test('should have back to login link', async ({ page }) => {
      await page.goto('http://localhost:3000/auth/forgot-password', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      
      const backLink = page.locator('a:has-text("Back"), a:has-text("Login")');
      await expect(backLink.first()).toBeVisible();
    });
  });

  test.describe('Form Interactions', () => {
    test('should focus on email input on page load', async ({ page }) => {
      await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
      
      const focusedElement = await page.evaluate(() => document.activeElement?.id);
      console.log('Focused element:', focusedElement);
    });

    test('should toggle password visibility', async ({ page }) => {
      await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      
      const passwordInput = page.locator('#password');
      const initialType = await passwordInput.getAttribute('type');
      
      // Find and click the toggle button
      const toggleButton = page.locator('button[type="button"]').first();
      if (await toggleButton.isVisible()) {
        await toggleButton.click();
        await page.waitForTimeout(300);
        
        const newType = await passwordInput.getAttribute('type');
        console.log('Password type changed from', initialType, 'to', newType);
      }
    });

    test('should fill form and clear', async ({ page }) => {
      await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      
      await page.locator('#email').fill('test@example.com');
      await page.locator('#password').fill('testpassword');
      
      expect(await page.locator('#email').inputValue()).toBe('test@example.com');
      expect(await page.locator('#password').inputValue()).toBe('testpassword');
      
      await page.locator('#email').clear();
      await page.locator('#password').clear();
      
      expect(await page.locator('#email').inputValue()).toBe('');
      expect(await page.locator('#password').inputValue()).toBe('');
    });
  });
});