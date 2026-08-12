# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/performance/performance.spec.ts >> Performance Tests >> Page Load Time >> should load dashboard within acceptable time
- Location: tests/performance/performance.spec.ts:6:9

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/dashboard
Call log:
  - navigating to "http://localhost:3000/dashboard", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect } from '../../fixtures/test-fixtures';
  2   | import { PerformanceMonitor } from '../../helpers/monitors';
  3   | 
  4   | test.describe('Performance Tests', () => {
  5   |   test.describe('Page Load Time', () => {
  6   |     test('should load dashboard within acceptable time', async ({ page, authenticatedPage }) => {
  7   |       const start = Date.now();
  8   |       
> 9   |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      |                               ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/dashboard
  10  |       await authenticatedPage.waitForLoadState('networkidle');
  11  |       
  12  |       const loadTime = Date.now() - start;
  13  |       console.log(`Dashboard load time: ${loadTime}ms`);
  14  |       
  15  |       expect(loadTime).toBeLessThan(5000);
  16  |     });
  17  | 
  18  |     test('should load problems page within acceptable time', async ({ page, authenticatedPage }) => {
  19  |       const start = Date.now();
  20  |       
  21  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
  22  |       await authenticatedPage.waitForLoadState('networkidle');
  23  |       
  24  |       const loadTime = Date.now() - start;
  25  |       console.log(`Problems page load time: ${loadTime}ms`);
  26  |       
  27  |       expect(loadTime).toBeLessThan(5000);
  28  |     });
  29  | 
  30  |     test('should have fast Time to First Byte', async ({ page, authenticatedPage }) => {
  31  |       const start = Date.now();
  32  |       
  33  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  34  |       
  35  |       const ttfb = Date.now() - start;
  36  |       console.log(`Time to First Byte: ${ttfb}ms`);
  37  |       
  38  |       expect(ttfb).toBeLessThan(2000);
  39  |     });
  40  | 
  41  |     test('should have fast First Contentful Paint', async ({ page, authenticatedPage }) => {
  42  |       const metrics = await authenticatedPage.evaluate(() => {
  43  |         return new Promise<{ fcp: number; domContentLoaded: number; load: number }>((resolve) => {
  44  |           const observer = new PerformanceObserver((list) => {
  45  |             const entries = list.getEntries();
  46  |             const fcp = entries.find(e => e.entryType === 'paint' && e.name === 'first-contentful-paint');
  47  |             
  48  |             if (fcp) {
  49  |               resolve({
  50  |                 fcp: fcp.startTime,
  51  |                 domContentLoaded: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd || 0,
  52  |                 load: performance.getEntriesByType('navigation')[0]?.loadEventEnd || 0,
  53  |               });
  54  |             }
  55  |           });
  56  |           
  57  |           observer.observe({ entryTypes: ['paint', 'navigation'] });
  58  |           
  59  |           setTimeout(() => {
  60  |             resolve({
  61  |               fcp: 0,
  62  |               domContentLoaded: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd || 0,
  63  |               load: performance.getEntriesByType('navigation')[0]?.loadEventEnd || 0,
  64  |             });
  65  |           }, 3000);
  66  |         });
  67  |       });
  68  |       
  69  |       console.log(`First Contentful Paint: ${metrics.fcp}ms`);
  70  |       console.log(`DOM Content Loaded: ${metrics.domContentLoaded}ms`);
  71  |       console.log(`Full Load: ${metrics.load}ms`);
  72  |     });
  73  |   });
  74  | 
  75  |   test.describe('Slow API Detection', () => {
  76  |     test('should detect slow API calls', async ({ page, authenticatedPage }) => {
  77  |       const performanceMonitor = new PerformanceMonitor(authenticatedPage);
  78  |       
  79  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  80  |       await authenticatedPage.waitForLoadState('networkidle');
  81  |       
  82  |       const slowApis = await authenticatedPage.evaluate(() => {
  83  |         const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  84  |         return resources
  85  |           .filter(r => r.name.includes('/api/') && r.duration > 2000)
  86  |           .map(r => ({
  87  |             url: r.name,
  88  |             duration: r.duration,
  89  |           }));
  90  |       });
  91  |       
  92  |       console.log(`Slow API calls (>2s): ${slowApis.length}`);
  93  |       slowApis.forEach(api => {
  94  |         console.log(`  ${api.url} - ${api.duration.toFixed(0)}ms`);
  95  |       });
  96  |     });
  97  | 
  98  |     test('should report API response times', async ({ page, authenticatedPage }) => {
  99  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  100 |       await authenticatedPage.waitForLoadState('networkidle');
  101 |       
  102 |       const apiTimings = await authenticatedPage.evaluate(() => {
  103 |         const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  104 |         return resources
  105 |           .filter(r => r.name.includes('/api/'))
  106 |           .map(r => ({
  107 |             url: r.name.split('/api/')[1] || r.name,
  108 |             duration: r.duration.toFixed(0),
  109 |           }));
```