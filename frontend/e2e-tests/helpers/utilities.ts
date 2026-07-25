import { Page } from '@playwright/test';

export class DataGenerator {
  static randomEmail(): string {
    return `test_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`;
  }

  static randomName(): string {
    return `Test User ${Date.now()}`;
  }

  static randomSlug(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  static randomNumber(min = 1, max = 1000): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  static randomPhone(): string {
    return `+1${Date.now().toString().substring(0, 10)}`;
  }

  static randomText(length = 10): string {
    return Math.random().toString(36).substring(2, 2 + length);
  }

  static randomLongText(length = 1000): string {
    return 'A'.repeat(length);
  }

  static validEmail(): string {
    return `user${Date.now()}@codespectra.io`;
  }

  static invalidEmail(): string {
    return 'notanemail';
  }

  static invalidPhone(): string {
    return 'abc123';
  }

  static validUrl(): string {
    return `https://example.com/${Date.now()}`;
  }

  static invalidUrl(): string {
    return 'not-a-url';
  }
}

export class ValidationHelper {
  static isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  static isValidPhone(phone: string): boolean {
    return /^\+?[\d\s-()]+$/.test(phone);
  }

  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static isValidSlug(slug: string): boolean {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
  }
}

export class PageHelper {
  static async getAllLinks(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const links: string[] = [];
      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
          links.push(href);
        }
      });
      return [...new Set(links)];
    });
  }

  static async getAllButtons(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const buttons: string[] = [];
      document.querySelectorAll('button, [role="button"], input[type="submit"]').forEach(b => {
        const text = b.textContent?.trim() || b.getAttribute('aria-label') || '';
        if (text) buttons.push(text);
      });
      return [...new Set(buttons)];
    });
  }

  static async getAllForms(page: Page): Promise<{ id?: string; action?: string }[]> {
    return page.evaluate(() => {
      return Array.from(document.querySelectorAll('form')).map(f => ({
        id: f.id || undefined,
        action: f.getAttribute('action') || undefined,
      }));
    });
  }

  static async getAllInputs(page: Page): Promise<{ name?: string; type: string; label?: string }[]> {
    return page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, select, textarea')).map(i => ({
        name: i.getAttribute('name') || undefined,
        type: i.getAttribute('type') || 'text',
        label: i.getAttribute('aria-label') || (i.previousElementSibling?.textContent || '') || undefined,
      }));
    });
  }

  static async getPageInfo(page: Page): Promise<{
    title: string;
    url: string;
    h1: string;
    links: number;
    buttons: number;
    forms: number;
    inputs: number;
  }> {
    const [title, url, h1, links, buttons, forms, inputs] = await Promise.all([
      page.title(),
      page.url(),
      page.locator('h1').first().textContent().catch(() => ''),
      PageHelper.getAllLinks(page),
      PageHelper.getAllButtons(page),
      PageHelper.getAllForms(page),
      PageHelper.getAllInputs(page),
    ]);
    return { title, url, h1, links: links.length, buttons: buttons.length, forms: forms.length, inputs: inputs.length };
  }
}

export class NavigationHelper {
  static async goBack(page: Page): Promise<void> {
    await page.goBack();
    await page.waitForLoadState('networkidle');
  }

  static async goForward(page: Page): Promise<void> {
    await page.goForward();
    await page.waitForLoadState('networkidle');
  }

  static async refresh(page: Page): Promise<void> {
    await page.reload();
    await page.waitForLoadState('networkidle');
  }
}

export class TableHelper {
  static async getTableData(page: Page, tableSelector = 'table'): Promise<string[][]> {
    return page.evaluate((selector) => {
      const rows = document.querySelectorAll(`${selector} tr`);
      return Array.from(rows).map(row => 
        Array.from(row.querySelectorAll('td, th')).map(cell => cell.textContent?.trim() || '')
      );
    }, tableSelector);
  }

  static async sortByColumn(page: Page, columnIndex: number, tableSelector = 'table'): Promise<void> {
    await page.locator(`${tableSelector} th:nth-child(${columnIndex})`).click();
    await page.waitForLoadState('networkidle');
  }

  static async filterTable(page: Page, searchText: string, inputSelector = '[data-testid="search-input"], input[placeholder*="search" i], input[type="search"]'): Promise<void> {
    const input = page.locator(inputSelector).first();
    if (await input.isVisible()) {
      await input.fill(searchText);
      await page.waitForTimeout(500);
    }
  }

  static async goToNextPage(page: Page): Promise<boolean> {
    const nextButton = page.locator('button:has-text("Next"), button:has-text("›"), [aria-label="Next"]').first();
    if (await nextButton.isEnabled()) {
      await nextButton.click();
      await page.waitForLoadState('networkidle');
      return true;
    }
    return false;
  }

  static async goToPreviousPage(page: Page): Promise<boolean> {
    const prevButton = page.locator('button:has-text("Previous"), button:has-text("‹"), [aria-label="Previous"]').first();
    if (await prevButton.isEnabled()) {
      await prevButton.click();
      await page.waitForLoadState('networkidle');
      return true;
    }
    return false;
  }
}