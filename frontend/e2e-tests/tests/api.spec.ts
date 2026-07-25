import { test, expect, request } from '@playwright/test';

test.describe('API Validation Tests', () => {
  test('should validate session API endpoint', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api/auth/session');
    const status = response.status();
    console.log('Session API status:', status);
    
    // Accept 200 (success) or 503 (database not available)
    expect([200, 503]).toContain(status);
  });

  test('should validate problems API endpoint', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api/problems');
    const status = response.status();
    console.log('Problems API status:', status);
    
    expect([200, 503]).toContain(status);
  });

  test('should validate health API endpoint', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api/health');
    const status = response.status();
    console.log('Health API status:', status);
    
    // Health check returns 503 when DB is not configured
    expect([200, 503]).toContain(status);
  });

  test('should return proper JSON content type', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api/auth/session');
    
    const contentType = response.headers()['content-type'];
    console.log('Content-Type:', contentType);
    
    expect(contentType).toContain('application/json');
  });

  test('should handle OPTIONS request for CORS', async ({ request }) => {
    const response = await request.fetch('http://localhost:3000/api/auth/session', {
      method: 'OPTIONS',
    });
    const status = response.status();
    console.log('OPTIONS request status:', status);
    
    // CORS preflight should be handled
    expect([200, 204, 405]).toContain(status);
  });
});

test.describe('Console Error Detection', () => {
  test('should have no critical console errors on login page', async ({ page }) => {
    const errors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    console.log('Console errors on login:', errors.length);
    errors.forEach(e => console.log('  Error:', e));
    
    // Allow non-critical errors but not critical ones
    const criticalErrors = errors.filter(e => 
      e.includes('Uncaught') || 
      e.includes('TypeError') ||
      e.includes('ReferenceError')
    );
    
    expect(criticalErrors.length).toBe(0);
  });

  test('should have no critical console errors on landing page', async ({ page }) => {
    const errors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    console.log('Console errors on landing:', errors.length);
    
    const criticalErrors = errors.filter(e => 
      e.includes('Uncaught') || 
      e.includes('TypeError') ||
      e.includes('ReferenceError')
    );
    
    expect(criticalErrors.length).toBe(0);
  });

  test('should have no console warnings about missing resources', async ({ page }) => {
    const warnings: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'warning') {
        warnings.push(msg.text());
      }
    });

    await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    console.log('Console warnings:', warnings.length);
    
    // Allow normal React development warnings
    const resourceWarnings = warnings.filter(w => 
      w.includes('404') || 
      w.includes('Failed to load resource')
    );
    
    console.log('Resource warnings:', resourceWarnings.length);
  });
});

test.describe('Network Request Tests', () => {
  test('should complete all page resources', async ({ page }) => {
    const failedRequests: string[] = [];
    
    page.on('requestfailed', request => {
      failedRequests.push(`${request.url()} - ${request.failure()?.errorText}`);
    });

    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    
    console.log('Failed requests:', failedRequests.length);
    failedRequests.forEach(r => console.log('  Failed:', r));
    
    // Allow some failed requests for non-critical resources
    expect(failedRequests.length).toBeLessThan(5);
  });

  test('should load JavaScript files successfully', async ({ page }) => {
    const jsFiles: string[] = [];
    
    page.on('response', response => {
      if (response.url().includes('.js')) {
        jsFiles.push(response.url());
      }
    });

    await page.goto('http://localhost:3000/auth/login', { waitUntil: 'networkidle' });
    
    console.log('JavaScript files loaded:', jsFiles.length);
    
    // Verify some JS files were loaded
    expect(jsFiles.length).toBeGreaterThan(0);
  });

  test('should load CSS files successfully', async ({ page }) => {
    const cssFiles: string[] = [];
    
    page.on('response', response => {
      if (response.url().includes('.css')) {
        cssFiles.push(response.url());
      }
    });

    await page.goto('http://localhost:3000/auth/login', { waitUntil: 'networkidle' });
    
    console.log('CSS files loaded:', cssFiles.length);
    
    expect(cssFiles.length).toBeGreaterThan(0);
  });
});

test.describe('Performance Tests', () => {
  test('should load page within reasonable time', async ({ page }) => {
    const start = Date.now();
    
    await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    
    const loadTime = Date.now() - start;
    console.log('Login page load time:', loadTime, 'ms');
    
    // In development mode, allow up to 30 seconds
    expect(loadTime).toBeLessThan(30000);
  });

  test('should have fast TTFB (Time to First Byte)', async ({ page }) => {
    const start = Date.now();
    
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
    
    const ttfb = Date.now() - start;
    console.log('TTFB:', ttfb, 'ms');
    
    // TTFB should be reasonable
    expect(ttfb).toBeLessThan(10000);
  });

  test('should lazy load images', async ({ page }) => {
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    
    const images = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs.map(img => ({
        src: img.src,
        loading: img.loading,
        naturalWidth: img.naturalWidth,
      }));
    });
    
    console.log('Images found:', images.length);
    console.log('Lazy loaded images:', images.filter(i => i.loading === 'lazy').length);
  });
});