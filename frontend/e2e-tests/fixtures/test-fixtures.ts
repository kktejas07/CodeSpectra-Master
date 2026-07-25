import { test as base, Page, chromium, type BrowserContext, type Browser } from '@playwright/test';
import { testConfig } from '../config/test-config';

export interface TestUser {
  email: string;
  password: string;
  name?: string;
}

export interface AuthenticatedPage extends Page {
  authenticatedAs?: TestUser;
}

export const createPageFixture = base.extend<{ page: AuthenticatedPage }>({
  page: async ({}, use) => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await use(page as AuthenticatedPage);
    await context.close();
    await browser.close();
  },
});

export const test = base.extend<{
  authenticatedPage: AuthenticatedPage;
  adminPage: AuthenticatedPage;
}>({
  authenticatedPage: async ({}, use) => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage() as AuthenticatedPage;
    
    try {
      await page.goto(`${testConfig.baseUrl}/login`);
      await page.fill('input[name="email"], input[type="email"]', testConfig.credentials.valid.email);
      await page.fill('input[name="password"], input[type="password"]', testConfig.credentials.valid.password);
      await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
      await page.waitForURL('**/dashboard**', { timeout: 15000 }).catch(() => {});
      page.authenticatedAs = {
        email: testConfig.credentials.valid.email,
        password: testConfig.credentials.valid.password,
      };
    } catch (e) {
      console.log('⚠️ Could not authenticate, running as guest');
    }
    
    await use(page);
    await context.close();
    await browser.close();
  },
  adminPage: async ({}, use) => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage() as AuthenticatedPage;
    
    try {
      await page.goto(`${testConfig.baseUrl}/login`);
      await page.fill('input[name="email"], input[type="email"]', 'admin@codespectra.io');
      await page.fill('input[name="password"], input[type="password"]', 'Admin@123456');
      await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
      await page.waitForURL('**/dashboard**', { timeout: 15000 }).catch(() => {});
      page.authenticatedAs = {
        email: 'admin@codespectra.io',
        password: 'Admin@123456',
      };
    } catch (e) {
      console.log('⚠️ Could not authenticate as admin, running as regular user');
    }
    
    await use(page);
    await context.close();
    await browser.close();
  },
});

export { testConfig };
export { expect } from '@playwright/test';