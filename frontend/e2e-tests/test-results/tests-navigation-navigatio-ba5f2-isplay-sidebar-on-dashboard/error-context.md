# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/navigation/navigation.spec.ts >> Navigation Tests >> Sidebar Navigation >> should display sidebar on dashboard
- Location: tests/navigation/navigation.spec.ts:13:9

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/dashboard
Call log:
  - navigating to "http://localhost:3000/dashboard", waiting until "networkidle"

```

# Test source

```ts
  1   | import { Page, Locator, expect } from '@playwright/test';
  2   | import { testConfig } from '../config/test-config';
  3   | 
  4   | export class BasePage {
  5   |   protected page: Page;
  6   |   protected url: string;
  7   | 
  8   |   constructor(page: Page, url = '/') {
  9   |     this.page = page;
  10  |     this.url = url;
  11  |   }
  12  | 
  13  |   async navigate(path = ''): Promise<void> {
  14  |     const start = Date.now();
  15  |     const fullUrl = this.url.startsWith('http') 
  16  |       ? `${this.url}${path}` 
  17  |       : `${testConfig.baseUrl}${this.url}${path}`;
> 18  |     await this.page.goto(fullUrl, { waitUntil: 'networkidle' });
      |                     ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/dashboard
  19  |     const loadTime = Date.now() - start;
  20  |     if (loadTime > testConfig.slowThreshold) {
  21  |       console.warn(`⚠️ Slow page load: ${loadTime}ms for ${fullUrl}`);
  22  |     }
  23  |   }
  24  | 
  25  |   async getTitle(): Promise<string> {
  26  |     return this.page.title();
  27  |   }
  28  | 
  29  |   async getUrl(): Promise<string> {
  30  |     return this.page.url();
  31  |   }
  32  | 
  33  |   locator(selector: string): Locator {
  34  |     return this.page.locator(selector);
  35  |   }
  36  | 
  37  |   async waitForSelector(selector: string, timeout = 10000): Promise<void> {
  38  |     return this.page.locator(selector).first().waitFor({ timeout });
  39  |   }
  40  | 
  41  |   async click(selector: string): Promise<void> {
  42  |     await this.page.locator(selector).first().click();
  43  |   }
  44  | 
  45  |   async fill(selector: string, value: string): Promise<void> {
  46  |     await this.page.locator(selector).first().fill(value);
  47  |   }
  48  | 
  49  |   async getText(selector: string): Promise<string> {
  50  |     return this.page.locator(selector).first().textContent() || '';
  51  |   }
  52  | 
  53  |   async isVisible(selector: string): Promise<boolean> {
  54  |     return this.page.locator(selector).first().isVisible();
  55  |   }
  56  | 
  57  |   async isHidden(selector: string): Promise<boolean> {
  58  |     return this.page.locator(selector).first().isHidden();
  59  |   }
  60  | 
  61  |   async waitForNavigation(callback: () => Promise<void>): Promise<void> {
  62  |     await Promise.all([this.page.waitForNavigation(), callback()]);
  63  |   }
  64  | 
  65  |   async takeScreenshot(name: string): Promise<void> {
  66  |     await this.page.screenshot({ path: `../screenshots/${name}.png`, fullPage: true });
  67  |   }
  68  | 
  69  |   async getConsoleLogs(): Promise<string[]> {
  70  |     return [];
  71  |   }
  72  | 
  73  |   async getApiCalls(): Promise<unknown[]> {
  74  |     return [];
  75  |   }
  76  | }
  77  | 
  78  | export class BaseModal {
  79  |   protected page: Page;
  80  |   protected modalSelector: string;
  81  | 
  82  |   constructor(page: Page, modalSelector = '[role="dialog"]') {
  83  |     this.page = page;
  84  |     this.modalSelector = modalSelector;
  85  |   }
  86  | 
  87  |   async isOpen(): Promise<boolean> {
  88  |     return this.page.locator(this.modalSelector).first().isVisible();
  89  |   }
  90  | 
  91  |   async close(): Promise<void> {
  92  |     const closeButton = this.page.locator(`${this.modalSelector} button[aria-label="Close"], ${this.modalSelector} button:has-text("Close"), ${this.modalSelector} button:has-text("Cancel")`).first();
  93  |     if (await closeButton.isVisible()) {
  94  |       await closeButton.click();
  95  |     }
  96  |   }
  97  | 
  98  |   async getTitle(): Promise<string> {
  99  |     return this.page.locator(`${this.modalSelector} h2, ${this.modalSelector} [role="heading"]`).first().textContent() || '';
  100 |   }
  101 | }
  102 | 
  103 | export class BaseForm {
  104 |   protected page: Page;
  105 |   protected formSelector: string;
  106 | 
  107 |   constructor(page: Page, formSelector = 'form') {
  108 |     this.page = page;
  109 |     this.formSelector = formSelector;
  110 |   }
  111 | 
  112 |   async fillField(labelOrName: string, value: string): Promise<void> {
  113 |     const field = this.page.locator(`label:has-text("${labelOrName}") + input, [name="${labelOrName}"], #${labelOrName}`).first();
  114 |     await field.fill(value);
  115 |   }
  116 | 
  117 |   async submit(): Promise<void> {
  118 |     await this.page.locator(`${this.formSelector} button[type="submit"]`).first().click();
```