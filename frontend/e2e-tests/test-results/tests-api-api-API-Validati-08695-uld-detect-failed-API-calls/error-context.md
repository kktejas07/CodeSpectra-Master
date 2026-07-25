# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/api/api.spec.ts >> API Validation Tests >> should detect failed API calls
- Location: tests/api/api.spec.ts:18:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
Call log:
  - navigating to "http://localhost:3000/dashboard", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect } from '../../fixtures/test-fixtures';
  2   | import { ApiMonitor, ConsoleMonitor, PerformanceMonitor } from '../../helpers/monitors';
  3   | 
  4   | test.describe('API Validation Tests', () => {
  5   |   test('should monitor API calls', async ({ page, authenticatedPage }) => {
  6   |     const apiMonitor = new ApiMonitor(authenticatedPage);
  7   |     
  8   |     await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  9   |     await authenticatedPage.waitForLoadState('networkidle');
  10  |     
  11  |     const calls = apiMonitor.getCalls();
  12  |     console.log(`Made ${calls.length} API calls during page load`);
  13  |     
  14  |     const apiCalls = calls.filter(c => c.url.includes('/api/'));
  15  |     console.log(`Found ${apiCalls.length} API calls`);
  16  |   });
  17  | 
  18  |   test('should detect failed API calls', async ({ page, authenticatedPage }) => {
  19  |     const apiMonitor = new ApiMonitor(authenticatedPage);
  20  |     
> 21  |     await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      |                             ^ Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
  22  |     await authenticatedPage.waitForLoadState('networkidle');
  23  |     
  24  |     const failedCalls = apiMonitor.getFailedCalls();
  25  |     console.log(`Found ${failedCalls.length} failed API calls`);
  26  |     
  27  |     failedCalls.forEach(call => {
  28  |       console.log(`Failed: ${call.method} ${call.url} - ${call.status} ${call.statusText}`);
  29  |     });
  30  |     
  31  |     expect(failedCalls.length).toBe(0);
  32  |   });
  33  | 
  34  |   test('should detect slow API calls', async ({ page, authenticatedPage }) => {
  35  |     const apiMonitor = new ApiMonitor(authenticatedPage);
  36  |     
  37  |     await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  38  |     await authenticatedPage.waitForLoadState('networkidle');
  39  |     
  40  |     const slowCalls = apiMonitor.getSlowCalls(3000);
  41  |     console.log(`Found ${slowCalls.length} slow API calls (>3s)`);
  42  |     
  43  |     slowCalls.forEach(call => {
  44  |       console.log(`Slow: ${call.method} ${call.url} - ${call.duration}ms`);
  45  |     });
  46  |   });
  47  | 
  48  |   test('should validate HTTP status codes', async ({ page, authenticatedPage }) => {
  49  |     const apiMonitor = new ApiMonitor(authenticatedPage);
  50  |     
  51  |     await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  52  |     await authenticatedPage.waitForLoadState('networkidle');
  53  |     
  54  |     const calls = apiMonitor.getCalls().filter(c => c.url.includes('/api/'));
  55  |     
  56  |     for (const call of calls.slice(0, 10)) {
  57  |       console.log(`${call.status} ${call.method} ${call.url}`);
  58  |       expect(call.status).toBeGreaterThanOrEqual(200);
  59  |       expect(call.status).toBeLessThan(400);
  60  |     }
  61  |   });
  62  | 
  63  |   test('should capture request/response payloads', async ({ page, authenticatedPage }) => {
  64  |     const apiMonitor = new ApiMonitor(authenticatedPage);
  65  |     
  66  |     await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  67  |     await authenticatedPage.waitForLoadState('networkidle');
  68  |     
  69  |     const apiCalls = apiMonitor.getCalls().filter(c => c.url.includes('/api/') && c.responseBody);
  70  |     
  71  |     if (apiCalls.length > 0) {
  72  |       const firstCall = apiCalls[0];
  73  |       console.log('First API call:', {
  74  |         url: firstCall.url,
  75  |         status: firstCall.status,
  76  |         hasResponse: !!firstCall.responseBody,
  77  |       });
  78  |       expect(firstCall.responseBody).toBeTruthy();
  79  |     }
  80  |   });
  81  | 
  82  |   test('should validate authentication API', async ({ page }) => {
  83  |     const response = await page.request.get(`${process.env.BASE_URL || 'http://localhost:3000'}/api/auth/session`);
  84  |     const status = response.status();
  85  |     console.log(`Auth session API status: ${status}`);
  86  |   });
  87  | 
  88  |   test('should validate problems API', async ({ page, authenticatedPage }) => {
  89  |     const response = await page.request.get(`${process.env.BASE_URL || 'http://localhost:3000'}/api/problems`);
  90  |     const status = response.status();
  91  |     console.log(`Problems API status: ${status}`);
  92  |     
  93  |     if (status === 200) {
  94  |       const body = await response.json();
  95  |       console.log(`Problems API returned ${Array.isArray(body) ? body.length : 'unknown'} items`);
  96  |     }
  97  |   });
  98  | 
  99  |   test('should detect 404 errors', async ({ page, authenticatedPage }) => {
  100 |     const apiMonitor = new ApiMonitor(authenticatedPage);
  101 |     
  102 |     await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  103 |     await authenticatedPage.waitForLoadState('networkidle');
  104 |     
  105 |     const notFoundCalls = apiMonitor.getCalls().filter(c => c.status === 404);
  106 |     console.log(`Found ${notFoundCalls.length} 404 errors`);
  107 |     
  108 |     notFoundCalls.forEach(call => {
  109 |       console.log(`404: ${call.url}`);
  110 |     });
  111 |   });
  112 | 
  113 |   test('should detect 500 errors', async ({ page, authenticatedPage }) => {
  114 |     const apiMonitor = new ApiMonitor(authenticatedPage);
  115 |     
  116 |     await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  117 |     await authenticatedPage.waitForLoadState('networkidle');
  118 |     
  119 |     const serverErrors = apiMonitor.getCalls().filter(c => c.status >= 500);
  120 |     console.log(`Found ${serverErrors.length} server errors`);
  121 |     
```