import { test, expect } from '../fixtures/test-fixtures';
import { PerformanceMonitor } from '../helpers/monitors';

test.describe('Performance Tests', () => {
  test.describe('Page Load Time', () => {
    test('should load dashboard within acceptable time', async ({ page, authenticatedPage }) => {
      const start = Date.now();
      
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const loadTime = Date.now() - start;
      console.log(`Dashboard load time: ${loadTime}ms`);
      
      expect(loadTime).toBeLessThan(5000);
    });

    test('should load problems page within acceptable time', async ({ page, authenticatedPage }) => {
      const start = Date.now();
      
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const loadTime = Date.now() - start;
      console.log(`Problems page load time: ${loadTime}ms`);
      
      expect(loadTime).toBeLessThan(5000);
    });

    test('should have fast Time to First Byte', async ({ page, authenticatedPage }) => {
      const start = Date.now();
      
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      
      const ttfb = Date.now() - start;
      console.log(`Time to First Byte: ${ttfb}ms`);
      
      expect(ttfb).toBeLessThan(2000);
    });

    test('should have fast First Contentful Paint', async ({ page, authenticatedPage }) => {
      const metrics = await authenticatedPage.evaluate(() => {
        return new Promise<{ fcp: number; domContentLoaded: number; load: number }>((resolve) => {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const fcp = entries.find(e => e.entryType === 'paint' && e.name === 'first-contentful-paint');
            
            if (fcp) {
              resolve({
                fcp: fcp.startTime,
                domContentLoaded: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd || 0,
                load: performance.getEntriesByType('navigation')[0]?.loadEventEnd || 0,
              });
            }
          });
          
          observer.observe({ entryTypes: ['paint', 'navigation'] });
          
          setTimeout(() => {
            resolve({
              fcp: 0,
              domContentLoaded: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd || 0,
              load: performance.getEntriesByType('navigation')[0]?.loadEventEnd || 0,
            });
          }, 3000);
        });
      });
      
      console.log(`First Contentful Paint: ${metrics.fcp}ms`);
      console.log(`DOM Content Loaded: ${metrics.domContentLoaded}ms`);
      console.log(`Full Load: ${metrics.load}ms`);
    });
  });

  test.describe('Slow API Detection', () => {
    test('should detect slow API calls', async ({ page, authenticatedPage }) => {
      const performanceMonitor = new PerformanceMonitor(authenticatedPage);
      
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const slowApis = await authenticatedPage.evaluate(() => {
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        return resources
          .filter(r => r.name.includes('/api/') && r.duration > 2000)
          .map(r => ({
            url: r.name,
            duration: r.duration,
          }));
      });
      
      console.log(`Slow API calls (>2s): ${slowApis.length}`);
      slowApis.forEach(api => {
        console.log(`  ${api.url} - ${api.duration.toFixed(0)}ms`);
      });
    });

    test('should report API response times', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const apiTimings = await authenticatedPage.evaluate(() => {
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        return resources
          .filter(r => r.name.includes('/api/'))
          .map(r => ({
            url: r.name.split('/api/')[1] || r.name,
            duration: r.duration.toFixed(0),
          }));
      });
      
      console.log('API Response Times:');
      apiTimings.slice(0, 10).forEach(api => {
        console.log(`  ${api.url}: ${api.duration}ms`);
      });
    });
  });

  test.describe('Resource Size', () => {
    test('should not have excessively large JavaScript bundles', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const resourceSizes = await authenticatedPage.evaluate(() => {
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        let totalJS = 0;
        let totalCSS = 0;
        let totalImages = 0;
        
        resources.forEach(r => {
          const size = r.transferSize || 0;
          if (r.name.includes('.js')) totalJS += size;
          else if (r.name.includes('.css')) totalCSS += size;
          else if (/\.(jpg|jpeg|png|gif|webp|svg)/.test(r.name)) totalImages += size;
        });
        
        return {
          js: (totalJS / 1024 / 1024).toFixed(2),
          css: (totalCSS / 1024 / 1024).toFixed(2),
          images: (totalImages / 1024 / 1024).toFixed(2),
        };
      });
      
      console.log(`JavaScript: ${resourceSizes.js}MB`);
      console.log(`CSS: ${resourceSizes.css}MB`);
      console.log(`Images: ${resourceSizes.images}MB`);
      
      expect(parseFloat(resourceSizes.js)).toBeLessThan(5);
    });

    test('should report largest resources', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const largestResources = await authenticatedPage.evaluate(() => {
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        return resources
          .filter(r => r.transferSize > 100000)
          .sort((a, b) => b.transferSize - a.transferSize)
          .slice(0, 10)
          .map(r => ({
            url: r.name.split('/').pop() || r.name,
            size: (r.transferSize / 1024).toFixed(0) + 'KB',
          }));
      });
      
      console.log('Largest resources:');
      largestResources.forEach(r => {
        console.log(`  ${r.url}: ${r.size}`);
      });
    });
  });

  test.describe('Lighthouse Scores', () => {
    test('should measure performance metrics', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const metrics = await authenticatedPage.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const paint = performance.getEntriesByType('paint');
        
        const fcp = paint.find((p: PerformanceEntry) => p.name === 'first-contentful-paint');
        const lcp = performance.getEntriesByType('largest-contentful-paint')[0] as PerformanceEntry;
        const cls = (performance as any).getEntriesByType('layout-shift')[0] as PerformanceEntry;
        
        return {
          ttfb: navigation?.responseStart || 0,
          fcp: fcp?.startTime || 0,
          lcp: lcp?.startTime || 0,
          cls: cls?.value || 0,
          domInteractive: navigation?.domInteractive || 0,
          domComplete: navigation?.domComplete || 0,
        };
      });
      
      console.log('Performance Metrics:');
      console.log(`  TTFB: ${metrics.ttfb.toFixed(0)}ms`);
      console.log(`  FCP: ${metrics.fcp.toFixed(0)}ms`);
      console.log(`  LCP: ${metrics.lcp.toFixed(0)}ms`);
      console.log(`  CLS: ${metrics.cls.toFixed(3)}`);
      console.log(`  DOM Interactive: ${metrics.domInteractive.toFixed(0)}ms`);
      console.log(`  DOM Complete: ${metrics.domComplete.toFixed(0)}ms`);
    });
  });

  test.describe('Memory Leaks', () => {
    test('should not have increasing memory usage', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const initialMemory = await authenticatedPage.evaluate(() => {
        if ((performance as any).memory) {
          return (performance as any).memory.usedJSHeapSize;
        }
        return null;
      });
      
      if (initialMemory) {
        for (let i = 0; i < 3; i++) {
          await authenticatedPage.reload();
          await authenticatedPage.waitForLoadState('networkidle');
        }
        
        const finalMemory = await authenticatedPage.evaluate(() => {
          if ((performance as any).memory) {
            return (performance as any).memory.usedJSHeapSize;
          }
          return null;
        });
        
        const increase = ((finalMemory - initialMemory) / initialMemory * 100).toFixed(2);
        console.log(`Memory increase after 3 reloads: ${increase}%`);
      } else {
        console.log('Memory API not available in this browser');
      }
    });
  });
});

test.describe('Visual Regression Tests', () => {
  test('should take screenshot of dashboard', async ({ page, authenticatedPage }) => {
    await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
    await authenticatedPage.waitForLoadState('networkidle');
    
    await authenticatedPage.screenshot({
      path: '../screenshots/dashboard.png',
      fullPage: true,
    });
    
    console.log('Dashboard screenshot saved');
  });

  test('should take screenshot of login page', async ({ page }) => {
    await page.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/login`);
    await page.waitForLoadState('networkidle');
    
    await page.screenshot({
      path: '../screenshots/login.png',
      fullPage: true,
    });
    
    console.log('Login page screenshot saved');
  });

  test('should take screenshot of problems page', async ({ page, authenticatedPage }) => {
    await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
    await authenticatedPage.waitForLoadState('networkidle');
    
    await authenticatedPage.screenshot({
      path: '../screenshots/problems.png',
      fullPage: true,
    });
    
    console.log('Problems page screenshot saved');
  });

  test('should take screenshots of modals', async ({ page, authenticatedPage }) => {
    await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
    await authenticatedPage.waitForLoadState('networkidle');
    
    const modalButton = authenticatedPage.locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")').first();
    if (await modalButton.isVisible()) {
      await modalButton.click();
      await authenticatedPage.waitForTimeout(500);
      
      const modal = authenticatedPage.locator('[role="dialog"], .modal');
      if (await modal.isVisible()) {
        await modal.screenshot({
          path: '../screenshots/modal.png',
        });
        console.log('Modal screenshot saved');
      }
    }
  });

  test('should take screenshots for responsive viewports', async ({ page, authenticatedPage }) => {
    const viewports = [
      { name: 'mobile', size: { width: 375, height: 812 } },
      { name: 'tablet', size: { width: 768, height: 1024 } },
      { name: 'desktop', size: { width: 1920, height: 1080 } },
    ];
    
    for (const viewport of viewports) {
      await authenticatedPage.setViewportSize(viewport.size);
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      await authenticatedPage.screenshot({
        path: `../screenshots/dashboard-${viewport.name}.png`,
        fullPage: true,
      });
      
      console.log(`${viewport.name} screenshot saved`);
    }
  });
});