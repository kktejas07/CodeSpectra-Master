import { Page, Request, Response } from '@playwright/test';

export interface ApiCall {
  url: string;
  method: string;
  status: number;
  statusText: string;
  duration: number;
  requestBody?: unknown;
  responseBody?: unknown;
  timestamp: number;
}

export interface ConsoleMessage {
  type: 'log' | 'warn' | 'error' | 'debug' | 'info';
  text: string;
  location: string;
  timestamp: number;
}

export class ApiMonitor {
  private calls: ApiCall[] = [];
  private page: Page;

  constructor(page: Page) {
    this.page = page;
    this.setupMonitoring();
  }

  private setupMonitoring(): void {
    this.page.on('request', (request) => {
      const startTime = Date.now();
      // @ts-expect-error Playwright Request type conflicts with web Request in Next.js build
      request.on('response', (response) => {
        const duration = Date.now() - startTime;
        this.calls.push({
          url: response.url(),
          method: request.method(),
          status: response.status(),
          statusText: response.statusText(),
          duration,
          requestBody: this.tryParseBody(request.postData()),
          responseBody: this.tryParseBody(response.body()),
          timestamp: startTime,
        });
      });
      // @ts-expect-error Playwright Request type conflicts with web Request in Next.js build
      request.on('requestfailed', (request) => {
        const duration = Date.now() - startTime;
        this.calls.push({
          url: request.url(),
          method: request.method(),
          status: 0,
          statusText: request.failure()?.errorText || 'Request Failed',
          duration,
          requestBody: this.tryParseBody(request.postData()),
          timestamp: startTime,
        });
      });
    });
  }

  private tryParseBody(body: string | Buffer | null): unknown {
    if (!body) return undefined;
    try {
      return JSON.parse(body.toString());
    } catch {
      return body.toString();
    }
  }

  getCalls(): ApiCall[] {
    return [...this.calls];
  }

  getFailedCalls(): ApiCall[] {
    return this.calls.filter(c => c.status >= 400 || c.status === 0);
  }

  getSlowCalls(threshold = 5000): ApiCall[] {
    return this.calls.filter(c => c.duration > threshold);
  }

  getCallsByUrl(pattern: string): ApiCall[] {
    return this.calls.filter(c => c.url.includes(pattern));
  }

  clear(): void {
    this.calls = [];
  }
}

export class ConsoleMonitor {
  private messages: ConsoleMessage[] = [];
  private page: Page;

  constructor(page: Page) {
    this.page = page;
    this.setupMonitoring();
  }

  private setupMonitoring(): void {
    this.page.on('console', (msg) => {
      this.messages.push({
        type: msg.type() as ConsoleMessage['type'],
        text: msg.text(),
        location: msg.location()?.url || '',
        timestamp: Date.now(),
      });
    });

    this.page.on('pageerror', (error) => {
      this.messages.push({
        type: 'error',
        text: error.message,
        location: '',
        timestamp: Date.now(),
      });
    });

    // @ts-expect-error Playwright Page type does not expose 'unhandledrejection' in Next.js build
    this.page.on('unhandledrejection', (promise) => {
      this.messages.push({
        type: 'error',
        text: `Unhandled Promise Rejection: ${promise.reason}`,
        location: '',
        timestamp: Date.now(),
      });
    });
  }

  getMessages(): ConsoleMessage[] {
    return [...this.messages];
  }

  getErrors(): ConsoleMessage[] {
    return this.messages.filter(m => m.type === 'error');
  }

  getWarnings(): ConsoleMessage[] {
    return this.messages.filter(m => m.type === 'warn');
  }

  clear(): void {
    this.messages = [];
  }
}

export class PerformanceMonitor {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async measurePageLoad(): Promise<{ domContentLoaded: number; load: number; full: number }> {
    const metrics = await this.page.evaluate(() => {
      const timing = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded: timing.domContentLoadedEventEnd - timing.startTime,
        load: timing.loadEventEnd - timing.startTime,
        full: performance.now(),
      };
    });
    return metrics;
  }

  async getResourceSizes(): Promise<{ js: number; css: number; images: number; total: number }> {
    return this.page.evaluate(() => {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      let js = 0, css = 0, images = 0, total = 0;
      
      resources.forEach(r => {
        const size = r.transferSize || 0;
        total += size;
        if (r.name.includes('.js')) js += size;
        else if (r.name.includes('.css')) css += size;
        else if (/\.(jpg|jpeg|png|gif|svg|webp)/.test(r.name)) images += size;
      });
      
      return { js, css, images, total };
    });
  }
}

export function createMonitors(page: Page): {
  api: ApiMonitor;
  console: ConsoleMonitor;
  performance: PerformanceMonitor;
} {
  return {
    api: new ApiMonitor(page),
    console: new ConsoleMonitor(page),
    performance: new PerformanceMonitor(page),
  };
}