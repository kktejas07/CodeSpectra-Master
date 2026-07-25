import { Page, Locator } from '@playwright/test';
import { BasePage, BaseForm } from './base-page';

export interface FormField {
  name: string;
  value: string;
  type: string;
}

export class DynamicForm extends BaseForm {
  readonly fields: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;
  readonly resetButton: Locator;

  constructor(page: Page, formSelector = 'form') {
    super(page, formSelector);
    this.fields = page.locator(`${formSelector} input, ${formSelector} select, ${formSelector} textarea`);
    this.submitButton = page.locator(`${formSelector} button[type="submit"]`).first();
    this.cancelButton = page.locator(`${formSelector} button:has-text("Cancel")`).first();
    this.resetButton = page.locator(`${formSelector} button:has-text("Reset")`).first();
  }

  async fillField(nameOrLabel: string, value: string): Promise<void> {
    const field = this.page.locator(
      `${this.formSelector} [name="${nameOrLabel}"], ${this.formSelector} [id="${nameOrLabel}"], ${this.formSelector} label:has-text("${nameOrLabel}") + input`
    ).first();
    await field.fill(value);
  }

  async selectOption(nameOrLabel: string, value: string): Promise<void> {
    const field = this.page.locator(
      `${this.formSelector} [name="${nameOrLabel}"], ${this.formSelector} [id="${nameOrLabel}"], ${this.formSelector} label:has-text("${nameOrLabel}") + select`
    ).first();
    await field.selectOption(value);
  }

  async check(nameOrLabel: string): Promise<void> {
    const field = this.page.locator(
      `${this.formSelector} [name="${nameOrLabel}"], ${this.formSelector} label:has-text("${nameOrLabel}") + input[type="checkbox"]`
    ).first();
    await field.check();
  }

  async uncheck(nameOrLabel: string): Promise<void> {
    const field = this.page.locator(
      `${this.formSelector} [name="${nameOrLabel}"], ${this.formSelector} label:has-text("${nameOrLabel}") + input[type="checkbox"]`
    ).first();
    await field.uncheck();
  }

  async getFieldValue(nameOrLabel: string): Promise<string> {
    const field = this.page.locator(
      `${this.formSelector} [name="${nameOrLabel}"], ${this.formSelector} [id="${nameOrLabel}"]`
    ).first();
    return field.inputValue();
  }

  async isFieldValid(nameOrLabel: string): Promise<boolean> {
    const field = this.page.locator(
      `${this.formSelector} [name="${nameOrLabel}"], ${this.formSelector} [id="${nameOrLabel}"]`
    ).first();
    const invalid = await field.getAttribute('aria-invalid');
    return invalid !== 'true';
  }

  async getAllFields(): Promise<FormField[]> {
    return this.page.evaluate((formSelector) => {
      const form = document.querySelector(formSelector);
      if (!form) return [];
      
      const fields: FormField[] = [];
      form.querySelectorAll('input, select, textarea').forEach(field => {
        const name = (field as HTMLInputElement).name || (field as HTMLInputElement).id || '';
        const type = (field as HTMLInputElement).type || field.tagName.toLowerCase();
        if (name) {
          fields.push({
            name,
            value: (field as HTMLInputElement).value,
            type,
          });
        }
      });
      return fields;
    }, this.formSelector);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async reset(): Promise<void> {
    await this.resetButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }
}

export class DynamicTable {
  readonly page: Page;
  readonly tableSelector: string;
  readonly rows: Locator;
  readonly headers: Locator;
  readonly pagination: Locator;

  constructor(page: Page, tableSelector = 'table') {
    this.page = page;
    this.tableSelector = tableSelector;
    this.rows = page.locator(`${tableSelector} tbody tr, ${tableSelector} tr`);
    this.headers = page.locator(`${tableSelector} thead th, ${tableSelector} th`);
    this.pagination = page.locator('[class*="pagination"], [role="navigation"]').first();
  }

  async getRowCount(): Promise<number> {
    return this.rows.count();
  }

  async getColumnCount(): Promise<number> {
    return this.headers.count();
  }

  async getHeaderTexts(): Promise<string[]> {
    return this.headers.allTextContents();
  }

  async getRowData(rowIndex: number): Promise<string[]> {
    return this.rows.nth(rowIndex).locator('td').allTextContents();
  }

  async getAllData(): Promise<string[][]> {
    const data: string[][] = [];
    const rowCount = await this.getRowCount();
    for (let i = 0; i < rowCount; i++) {
      data.push(await this.getRowData(i));
    }
    return data;
  }

  async sortByColumn(columnIndex: number, direction: 'asc' | 'desc' = 'asc'): Promise<void> {
    const header = this.headers.nth(columnIndex);
    await header.click();
    await this.page.waitForTimeout(300);
    
    if (direction === 'desc') {
      await header.click();
      await this.page.waitForTimeout(300);
    }
  }

  async clickRowAction(rowIndex: number, actionText: string): Promise<void> {
    await this.rows.nth(rowIndex).locator(`button:has-text("${actionText}"), a:has-text("${actionText}")`).click();
    await this.page.waitForLoadState('networkidle');
  }

  async deleteRow(rowIndex: number): Promise<void> {
    await this.rows.nth(rowIndex).locator('button[aria-label*="delete" i], button:has-text("Delete"), button[aria-label*="remove" i]').click();
    await this.page.waitForTimeout(500);
    const confirmButton = this.page.locator('button:has-text("Confirm"), button:has-text("Yes"), [data-testid="confirm-delete"]').first();
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
    }
    await this.page.waitForLoadState('networkidle');
  }

  async goToPage(pageNumber: number): Promise<void> {
    await this.page.locator(`button:has-text("${pageNumber}"), [role="button"]:has-text("${pageNumber}")`).click();
    await this.page.waitForLoadState('networkidle');
  }

  async nextPage(): Promise<boolean> {
    const nextButton = this.page.locator('button[aria-label="Next"], button:has-text("›"), button:has-text("Next")').first();
    if (await nextButton.isEnabled()) {
      await nextButton.click();
      await this.page.waitForLoadState('networkidle');
      return true;
    }
    return false;
  }

  async previousPage(): Promise<boolean> {
    const prevButton = this.page.locator('button[aria-label="Previous"], button:has-text("‹"), button:has-text("Previous")').first();
    if (await prevButton.isEnabled()) {
      await prevButton.click();
      await this.page.waitForLoadState('networkidle');
      return true;
    }
    return false;
  }

  async search(text: string): Promise<void> {
    const searchInput = this.page.locator('input[placeholder*="search" i], input[type="search"]').first();
    await searchInput.fill(text);
    await this.page.waitForTimeout(500);
  }

  async clearSearch(): Promise<void> {
    const searchInput = this.page.locator('input[placeholder*="search" i], input[type="search"]').first();
    await searchInput.clear();
    await this.page.waitForTimeout(500);
  }

  async filter(columnIndex: number, value: string): Promise<void> {
    const filterSelect = this.page.locator(`th:nth-child(${columnIndex + 1}) select, th:nth-child(${columnIndex + 1}) [role="combobox"]`);
    if (await filterSelect.isVisible()) {
      await filterSelect.selectOption(value);
      await this.page.waitForTimeout(300);
    }
  }

  async isEmpty(): Promise<boolean> {
    const count = await this.getRowCount();
    return count === 0 || (count === 1 && (await this.getRowData(0)).every(cell => cell.trim() === ''));
  }

  async getEmptyMessage(): Promise<string> {
    return this.page.locator('[class*="empty"], [data-testid="empty-state"]').textContent() || '';
  }
}

export class Modal {
  readonly page: Page;
  readonly modalSelector: string;
  readonly title: Locator;
  readonly content: Locator;
  readonly closeButton: Locator;
  readonly confirmButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page, modalSelector = '[role="dialog"], [data-testid="modal"], .modal') {
    this.page = page;
    this.modalSelector = modalSelector;
    this.title = page.locator(`${modalSelector} h2, ${modalSelector} [role="heading"]`).first();
    this.content = page.locator(`${modalSelector} .modal-content, ${modalSelector} [class*="content"]`).first();
    this.closeButton = page.locator(`${modalSelector} button[aria-label="Close"], ${modalSelector} button:has-text("×")`).first();
    this.confirmButton = page.locator(`${modalSelector} button:has-text("Confirm"), ${modalSelector} button:has-text("Save"), ${modalSelector} button[type="submit"]`).first();
    this.cancelButton = page.locator(`${modalSelector} button:has-text("Cancel"), ${modalSelector} button:has-text("Close")`).first();
  }

  async isOpen(): Promise<boolean> {
    return this.page.locator(this.modalSelector).first().isVisible();
  }

  async getTitle(): Promise<string> {
    return this.title.textContent() || '';
  }

  async close(): Promise<void> {
    await this.closeButton.click();
    await this.page.waitForTimeout(300);
  }

  async confirm(): Promise<void> {
    await this.confirmButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await this.page.waitForTimeout(300);
  }

  async getTextContent(): Promise<string> {
    return this.content.textContent() || '';
  }
}

export class Toast {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async getMessage(timeout = 5000): Promise<string> {
    const toast = this.page.locator('[role="status"], [role="alert"], [class*="toast"], [data-testid="toast"]').first();
    try {
      await toast.waitFor({ timeout });
      return toast.textContent() || '';
    } catch {
      return '';
    }
  }

  async isSuccess(timeout = 5000): Promise<boolean> {
    const toast = this.page.locator('[role="status"]:has-text("success"), [class*="toast"][class*="success"]').first();
    try {
      await toast.waitFor({ timeout });
      return true;
    } catch {
      return false;
    }
  }

  async isError(timeout = 5000): Promise<boolean> {
    const toast = this.page.locator('[role="alert"]:has-text("error"), [class*="toast"][class*="error"]').first();
    try {
      await toast.waitFor({ timeout });
      return true;
    } catch {
      return false;
    }
  }

  async waitForDismiss(timeout = 10000): Promise<void> {
    await this.page.waitForTimeout(timeout);
  }
}