import { test, expect } from '../../fixtures/test-fixtures';
import { ApiMonitor, ConsoleMonitor, PerformanceMonitor } from '../../helpers/monitors';

test.describe('API Validation Tests', () => {
  test('should monitor API calls', async ({ page, authenticatedPage }) => {
    const apiMonitor = new ApiMonitor(authenticatedPage);
    
    await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
    await authenticatedPage.waitForLoadState('networkidle');
    
    const calls = apiMonitor.getCalls();
    console.log(`Made ${calls.length} API calls during page load`);
    
    const apiCalls = calls.filter(c => c.url.includes('/api/'));
    console.log(`Found ${apiCalls.length} API calls`);
  });

  test('should detect failed API calls', async ({ page, authenticatedPage }) => {
    const apiMonitor = new ApiMonitor(authenticatedPage);
    
    await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
    await authenticatedPage.waitForLoadState('networkidle');
    
    const failedCalls = apiMonitor.getFailedCalls();
    console.log(`Found ${failedCalls.length} failed API calls`);
    
    failedCalls.forEach(call => {
      console.log(`Failed: ${call.method} ${call.url} - ${call.status} ${call.statusText}`);
    });
    
    expect(failedCalls.length).toBe(0);
  });

  test('should detect slow API calls', async ({ page, authenticatedPage }) => {
    const apiMonitor = new ApiMonitor(authenticatedPage);
    
    await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
    await authenticatedPage.waitForLoadState('networkidle');
    
    const slowCalls = apiMonitor.getSlowCalls(3000);
    console.log(`Found ${slowCalls.length} slow API calls (>3s)`);
    
    slowCalls.forEach(call => {
      console.log(`Slow: ${call.method} ${call.url} - ${call.duration}ms`);
    });
  });

  test('should validate HTTP status codes', async ({ page, authenticatedPage }) => {
    const apiMonitor = new ApiMonitor(authenticatedPage);
    
    await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
    await authenticatedPage.waitForLoadState('networkidle');
    
    const calls = apiMonitor.getCalls().filter(c => c.url.includes('/api/'));
    
    for (const call of calls.slice(0, 10)) {
      console.log(`${call.status} ${call.method} ${call.url}`);
      expect(call.status).toBeGreaterThanOrEqual(200);
      expect(call.status).toBeLessThan(400);
    }
  });

  test('should capture request/response payloads', async ({ page, authenticatedPage }) => {
    const apiMonitor = new ApiMonitor(authenticatedPage);
    
    await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
    await authenticatedPage.waitForLoadState('networkidle');
    
    const apiCalls = apiMonitor.getCalls().filter(c => c.url.includes('/api/') && c.responseBody);
    
    if (apiCalls.length > 0) {
      const firstCall = apiCalls[0];
      console.log('First API call:', {
        url: firstCall.url,
        status: firstCall.status,
        hasResponse: !!firstCall.responseBody,
      });
      expect(firstCall.responseBody).toBeTruthy();
    }
  });

  test('should validate authentication API', async ({ page }) => {
    const response = await page.request.get(`${process.env.BASE_URL || 'http://localhost:3000'}/api/auth/session`);
    const status = response.status();
    console.log(`Auth session API status: ${status}`);
  });

  test('should validate problems API', async ({ page, authenticatedPage }) => {
    const response = await page.request.get(`${process.env.BASE_URL || 'http://localhost:3000'}/api/problems`);
    const status = response.status();
    console.log(`Problems API status: ${status}`);
    
    if (status === 200) {
      const body = await response.json();
      console.log(`Problems API returned ${Array.isArray(body) ? body.length : 'unknown'} items`);
    }
  });

  test('should detect 404 errors', async ({ page, authenticatedPage }) => {
    const apiMonitor = new ApiMonitor(authenticatedPage);
    
    await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
    await authenticatedPage.waitForLoadState('networkidle');
    
    const notFoundCalls = apiMonitor.getCalls().filter(c => c.status === 404);
    console.log(`Found ${notFoundCalls.length} 404 errors`);
    
    notFoundCalls.forEach(call => {
      console.log(`404: ${call.url}`);
    });
  });

  test('should detect 500 errors', async ({ page, authenticatedPage }) => {
    const apiMonitor = new ApiMonitor(authenticatedPage);
    
    await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
    await authenticatedPage.waitForLoadState('networkidle');
    
    const serverErrors = apiMonitor.getCalls().filter(c => c.status >= 500);
    console.log(`Found ${serverErrors.length} server errors`);
    
    serverErrors.forEach(call => {
      console.log(`Server Error ${call.status}: ${call.url}`);
    });
  });
});

test.describe('Console Error Detection', () => {
  test('should capture console errors', async ({ page, authenticatedPage }) => {
    const consoleMonitor = new ConsoleMonitor(authenticatedPage);
    
    await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
    await authenticatedPage.waitForLoadState('networkidle');
    
    const errors = consoleMonitor.getErrors();
    console.log(`Found ${errors.length} console errors`);
    
    errors.forEach(error => {
      console.log(`Console Error: ${error.text}`);
    });
  });

  test('should capture console warnings', async ({ page, authenticatedPage }) => {
    const consoleMonitor = new ConsoleMonitor(authenticatedPage);
    
    await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
    await authenticatedPage.waitForLoadState('networkidle');
    
    const warnings = consoleMonitor.getWarnings();
    console.log(`Found ${warnings.length} console warnings`);
  });

  test('should detect JavaScript exceptions', async ({ page, authenticatedPage }) => {
    const consoleMonitor = new ConsoleMonitor(authenticatedPage);
    
    await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
    await authenticatedPage.waitForLoadState('networkidle');
    
    const errors = consoleMonitor.getErrors();
    const jsErrors = errors.filter(e => e.text.includes('Error') || e.text.includes('exception'));
    console.log(`Found ${jsErrors.length} JavaScript errors`);
    
    jsErrors.forEach(error => {
      console.log(`JS Error: ${error.text}`);
    });
  });

  test('should detect unhandled promise rejections', async ({ page, authenticatedPage }) => {
    const consoleMonitor = new ConsoleMonitor(authenticatedPage);
    
    await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
    await authenticatedPage.waitForLoadState('networkidle');
    
    const errors = consoleMonitor.getErrors();
    const unhandledRejections = errors.filter(e => e.text.includes('Unhandled Promise'));
    console.log(`Found ${unhandledRejections.length} unhandled promise rejections`);
  });

  test('should report no critical console errors on dashboard', async ({ page, authenticatedPage }) => {
    const consoleMonitor = new ConsoleMonitor(authenticatedPage);
    
    await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
    await authenticatedPage.waitForLoadState('networkidle');
    
    const errors = consoleMonitor.getErrors();
    const criticalErrors = errors.filter(e => 
      e.text.includes('Error') && 
      !e.text.includes('warning') && 
      !e.text.includes('Warning')
    );
    
    console.log(`Critical errors on dashboard: ${criticalErrors.length}`);
    expect(criticalErrors.length).toBe(0);
  });
});