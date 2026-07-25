import { Page, Locator, expect } from '@playwright/test';
import { testConfig } from '../config/test-config';

export class BasePage {
  protected page: Page;
  protected url: string;

  constructor(page: Page, url = '/') {
    this.page = page;
    this.url = url;
  }

  async navigate(path = ''): Promise<void> {
    const start = Date.now();
    const fullUrl = this.url.startsWith('http') 
      ? `${this.url}${path}` 
      : `${testConfig.baseUrl}${this.url}${path}`;
    await this.page.goto(fullUrl, { waitUntil: 'networkidle' });
    const loadTime = Date.now() - start;
    if (loadTime > testConfig.slowThreshold) {
      console.warn(`⚠️ Slow page load: ${loadTime}ms for ${fullUrl}`);
    }
  }

  async getTitle(): Promise<string> {
    return this.page.title();
  }

  async getUrl(): Promise<string> {
    return this.page.url();
  }

  locator(selector: string): Locator {
    return this.page.locator(selector);
  }

  async waitForSelector(selector: string, timeout = 10000): Promise<Locator> {
    return this.page.locator(selector).first().waitFor({ timeout });
  }

  async click(selector: string): Promise<void> {
    await this.page.locator(selector).first().click();
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.page.locator(selector).first().fill(value);
  }

  async getText(selector: string): Promise<string> {
    return this.page.locator(selector).first().textContent() || '';
  }

  async isVisible(selector: string): Promise<boolean> {
    return this.page.locator(selector).first().isVisible();
  }

  async isHidden(selector: string): Promise<boolean> {
    return this.page.locator(selector).first().isHidden();
  }

  async waitForNavigation(callback: () => Promise<void>): Promise<void> {
    await Promise.all([this.page.waitForNavigation(), callback()]);
  }

  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({ path: `../screenshots/${name}.png`, fullPage: true });
  }

  async getConsoleLogs(): Promise<string[]> {
    return [];
  }

  async getApiCalls(): Promise<unknown[]> {
    return [];
  }
}

export class BaseModal {
  protected page: Page;
  protected modalSelector: string;

  constructor(page: Page, modalSelector = '[role="dialog"]') {
    this.page = page;
    this.modalSelector = modalSelector;
  }

  async isOpen(): Promise<boolean> {
    return this.page.locator(this.modalSelector).first().isVisible();
  }

  async close(): Promise<void> {
    const closeButton = this.page.locator(`${this.modalSelector} button[aria-label="Close"], ${this.modalSelector} button:has-text("Close"), ${this.modalSelector} button:has-text("Cancel")`).first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }
  }

  async getTitle(): Promise<string> {
    return this.page.locator(`${this.modalSelector} h2, ${this.modalSelector} [role="heading"]`).first().textContent() || '';
  }
}

export class BaseForm {
  protected page: Page;
  protected formSelector: string;

  constructor(page: Page, formSelector = 'form') {
    this.page = page;
    this.formSelector = formSelector;
  }

  async fillField(labelOrName: string, value: string): Promise<void> {
    const field = this.page.locator(`label:has-text("${labelOrName}") + input, [name="${labelOrName}"], #${labelOrName}`).first();
    await field.fill(value);
  }

  async submit(): Promise<void> {
    await this.page.locator(`${this.formSelector} button[type="submit"]`).first().click();
  }

  async cancel(): Promise<void> {
    await this.page.locator(`${this.formSelector} button:has-text("Cancel")`).first().click();
  }

  async getValidationErrors(): Promise<string[]> {
    return this.page.locator(`${this.formSelector} [data-error], ${this.formSelector} .error, ${this.formSelector} .invalid`).allTextContents();
  }
}