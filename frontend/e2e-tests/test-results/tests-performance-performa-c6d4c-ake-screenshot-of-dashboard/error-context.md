# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/performance/performance.spec.ts >> Visual Regression Tests >> should take screenshot of dashboard
- Location: tests/performance/performance.spec.ts:242:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/dashboard
Call log:
  - navigating to "http://localhost:3000/dashboard", waiting until "load"

```

# Test source

```ts
  143 |       
  144 |       console.log(`JavaScript: ${resourceSizes.js}MB`);
  145 |       console.log(`CSS: ${resourceSizes.css}MB`);
  146 |       console.log(`Images: ${resourceSizes.images}MB`);
  147 |       
  148 |       expect(parseFloat(resourceSizes.js)).toBeLessThan(5);
  149 |     });
  150 | 
  151 |     test('should report largest resources', async ({ page, authenticatedPage }) => {
  152 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  153 |       await authenticatedPage.waitForLoadState('networkidle');
  154 |       
  155 |       const largestResources = await authenticatedPage.evaluate(() => {
  156 |         const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  157 |         return resources
  158 |           .filter(r => r.transferSize > 100000)
  159 |           .sort((a, b) => b.transferSize - a.transferSize)
  160 |           .slice(0, 10)
  161 |           .map(r => ({
  162 |             url: r.name.split('/').pop() || r.name,
  163 |             size: (r.transferSize / 1024).toFixed(0) + 'KB',
  164 |           }));
  165 |       });
  166 |       
  167 |       console.log('Largest resources:');
  168 |       largestResources.forEach(r => {
  169 |         console.log(`  ${r.url}: ${r.size}`);
  170 |       });
  171 |     });
  172 |   });
  173 | 
  174 |   test.describe('Lighthouse Scores', () => {
  175 |     test('should measure performance metrics', async ({ page, authenticatedPage }) => {
  176 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  177 |       await authenticatedPage.waitForLoadState('networkidle');
  178 |       
  179 |       const metrics = await authenticatedPage.evaluate(() => {
  180 |         const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
  181 |         const paint = performance.getEntriesByType('paint');
  182 |         
  183 |         const fcp = paint.find((p: PerformanceEntry) => p.name === 'first-contentful-paint');
  184 |         const lcp = performance.getEntriesByType('largest-contentful-paint')[0] as PerformanceEntry;
  185 |         const cls = (performance as any).getEntriesByType('layout-shift')[0] as PerformanceEntry;
  186 |         
  187 |         return {
  188 |           ttfb: navigation?.responseStart || 0,
  189 |           fcp: fcp?.startTime || 0,
  190 |           lcp: lcp?.startTime || 0,
  191 |           cls: cls?.value || 0,
  192 |           domInteractive: navigation?.domInteractive || 0,
  193 |           domComplete: navigation?.domComplete || 0,
  194 |         };
  195 |       });
  196 |       
  197 |       console.log('Performance Metrics:');
  198 |       console.log(`  TTFB: ${metrics.ttfb.toFixed(0)}ms`);
  199 |       console.log(`  FCP: ${metrics.fcp.toFixed(0)}ms`);
  200 |       console.log(`  LCP: ${metrics.lcp.toFixed(0)}ms`);
  201 |       console.log(`  CLS: ${metrics.cls.toFixed(3)}`);
  202 |       console.log(`  DOM Interactive: ${metrics.domInteractive.toFixed(0)}ms`);
  203 |       console.log(`  DOM Complete: ${metrics.domComplete.toFixed(0)}ms`);
  204 |     });
  205 |   });
  206 | 
  207 |   test.describe('Memory Leaks', () => {
  208 |     test('should not have increasing memory usage', async ({ page, authenticatedPage }) => {
  209 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  210 |       await authenticatedPage.waitForLoadState('networkidle');
  211 |       
  212 |       const initialMemory = await authenticatedPage.evaluate(() => {
  213 |         if ((performance as any).memory) {
  214 |           return (performance as any).memory.usedJSHeapSize;
  215 |         }
  216 |         return null;
  217 |       });
  218 |       
  219 |       if (initialMemory) {
  220 |         for (let i = 0; i < 3; i++) {
  221 |           await authenticatedPage.reload();
  222 |           await authenticatedPage.waitForLoadState('networkidle');
  223 |         }
  224 |         
  225 |         const finalMemory = await authenticatedPage.evaluate(() => {
  226 |           if ((performance as any).memory) {
  227 |             return (performance as any).memory.usedJSHeapSize;
  228 |           }
  229 |           return null;
  230 |         });
  231 |         
  232 |         const increase = ((finalMemory - initialMemory) / initialMemory * 100).toFixed(2);
  233 |         console.log(`Memory increase after 3 reloads: ${increase}%`);
  234 |       } else {
  235 |         console.log('Memory API not available in this browser');
  236 |       }
  237 |     });
  238 |   });
  239 | });
  240 | 
  241 | test.describe('Visual Regression Tests', () => {
  242 |   test('should take screenshot of dashboard', async ({ page, authenticatedPage }) => {
> 243 |     await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      |                             ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/dashboard
  244 |     await authenticatedPage.waitForLoadState('networkidle');
  245 |     
  246 |     await authenticatedPage.screenshot({
  247 |       path: '../screenshots/dashboard.png',
  248 |       fullPage: true,
  249 |     });
  250 |     
  251 |     console.log('Dashboard screenshot saved');
  252 |   });
  253 | 
  254 |   test('should take screenshot of login page', async ({ page }) => {
  255 |     await page.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/login`);
  256 |     await page.waitForLoadState('networkidle');
  257 |     
  258 |     await page.screenshot({
  259 |       path: '../screenshots/login.png',
  260 |       fullPage: true,
  261 |     });
  262 |     
  263 |     console.log('Login page screenshot saved');
  264 |   });
  265 | 
  266 |   test('should take screenshot of problems page', async ({ page, authenticatedPage }) => {
  267 |     await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
  268 |     await authenticatedPage.waitForLoadState('networkidle');
  269 |     
  270 |     await authenticatedPage.screenshot({
  271 |       path: '../screenshots/problems.png',
  272 |       fullPage: true,
  273 |     });
  274 |     
  275 |     console.log('Problems page screenshot saved');
  276 |   });
  277 | 
  278 |   test('should take screenshots of modals', async ({ page, authenticatedPage }) => {
  279 |     await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  280 |     await authenticatedPage.waitForLoadState('networkidle');
  281 |     
  282 |     const modalButton = authenticatedPage.locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")').first();
  283 |     if (await modalButton.isVisible()) {
  284 |       await modalButton.click();
  285 |       await authenticatedPage.waitForTimeout(500);
  286 |       
  287 |       const modal = authenticatedPage.locator('[role="dialog"], .modal');
  288 |       if (await modal.isVisible()) {
  289 |         await modal.screenshot({
  290 |           path: '../screenshots/modal.png',
  291 |         });
  292 |         console.log('Modal screenshot saved');
  293 |       }
  294 |     }
  295 |   });
  296 | 
  297 |   test('should take screenshots for responsive viewports', async ({ page, authenticatedPage }) => {
  298 |     const viewports = [
  299 |       { name: 'mobile', size: { width: 375, height: 812 } },
  300 |       { name: 'tablet', size: { width: 768, height: 1024 } },
  301 |       { name: 'desktop', size: { width: 1920, height: 1080 } },
  302 |     ];
  303 |     
  304 |     for (const viewport of viewports) {
  305 |       await authenticatedPage.setViewportSize(viewport.size);
  306 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  307 |       await authenticatedPage.waitForLoadState('networkidle');
  308 |       
  309 |       await authenticatedPage.screenshot({
  310 |         path: `../screenshots/dashboard-${viewport.name}.png`,
  311 |         fullPage: true,
  312 |       });
  313 |       
  314 |       console.log(`${viewport.name} screenshot saved`);
  315 |     }
  316 |   });
  317 | });
```