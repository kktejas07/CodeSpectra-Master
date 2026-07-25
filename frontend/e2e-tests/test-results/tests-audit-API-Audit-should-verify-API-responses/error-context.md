# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/audit.spec.ts >> API Audit >> should verify API responses
- Location: tests/audit.spec.ts:110:7

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 500
Received:   503
```

# Test source

```ts
  19  |     await expect(signupLink).toBeVisible();
  20  |     
  21  |     await page.screenshot({ path: '../screenshots/audit-login.png' });
  22  |   });
  23  | 
  24  |   test('should test direct navigation to auth pages', async ({ page }) => {
  25  |     await page.goto('http://localhost:3000/auth/forgot-password', { waitUntil: 'networkidle' });
  26  |     await expect(page.locator('#email')).toBeVisible();
  27  |     
  28  |     await page.goto('http://localhost:3000/auth/signup', { waitUntil: 'networkidle' });
  29  |     await expect(page.locator('form')).toBeVisible();
  30  |     
  31  |     await page.screenshot({ path: '../screenshots/audit-signup.png' });
  32  |   });
  33  | 
  34  |   test('should verify public pages are accessible', async ({ page }) => {
  35  |     const publicPages = [
  36  |       '/',
  37  |       '/about',
  38  |       '/features',
  39  |       '/pricing',
  40  |     ];
  41  |     
  42  |     for (const path of publicPages) {
  43  |       await page.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle' });
  44  |       const status = await page.evaluate(() => document.readyState);
  45  |       expect(status).toBe('complete');
  46  |       console.log(`✓ ${path} loaded successfully`);
  47  |     }
  48  |   });
  49  | 
  50  |   test('should check API endpoints', async ({ request }) => {
  51  |     const endpoints = [
  52  |       '/api/health',
  53  |       '/api/auth/session',
  54  |     ];
  55  |     
  56  |     for (const endpoint of endpoints) {
  57  |       const response = await request.get(`http://localhost:3000${endpoint}`);
  58  |       console.log(`${endpoint}: ${response.status()}`);
  59  |       expect(response.status()).toBeLessThan(500);
  60  |     }
  61  |   });
  62  | 
  63  |   test('should explore dashboard pages', async ({ page }) => {
  64  |     await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  65  |     await page.waitForTimeout(2000);
  66  |     
  67  |     const url = page.url();
  68  |     console.log('After dashboard nav, URL:', url);
  69  |     
  70  |     if (url.includes('/dashboard')) {
  71  |       await expect(page.locator('nav, [class*="sidebar"]').first()).toBeVisible({ timeout: 5000 }).catch(() => {
  72  |         console.log('No sidebar found - might need authentication');
  73  |       });
  74  |     }
  75  |   });
  76  | 
  77  |   test('should identify all interactive elements on login page', async ({ page }) => {
  78  |     await page.goto('http://localhost:3000/auth/login', { waitUntil: 'networkidle' });
  79  |     await page.waitForTimeout(2000);
  80  |     
  81  |     const forms = await page.locator('form').count();
  82  |     const buttons = await page.locator('button').count();
  83  |     const inputs = await page.locator('input').count();
  84  |     const links = await page.locator('a').count();
  85  |     
  86  |     console.log('Login page elements:');
  87  |     console.log(`  Forms: ${forms}`);
  88  |     console.log(`  Buttons: ${buttons}`);
  89  |     console.log(`  Inputs: ${inputs}`);
  90  |     console.log(`  Links: ${links}`);
  91  |   });
  92  | 
  93  |   test('should test form validation on signup', async ({ page }) => {
  94  |     await page.goto('http://localhost:3000/auth/signup', { waitUntil: 'networkidle' });
  95  |     await page.waitForTimeout(2000);
  96  |     
  97  |     const submitButton = page.locator('button[type="submit"]');
  98  |     if (await submitButton.isVisible()) {
  99  |       await submitButton.click();
  100 |       await page.waitForTimeout(500);
  101 |       
  102 |       const emailInput = page.locator('#email');
  103 |       const isValid = await emailInput.evaluate(el => el.checkValidity());
  104 |       console.log('Form validation working:', isValid === false);
  105 |     }
  106 |   });
  107 | });
  108 | 
  109 | test.describe('API Audit', () => {
  110 |   test('should verify API responses', async ({ request }) => {
  111 |     const apiTests = [
  112 |       { url: '/api/health', expectedStatus: 200 },
  113 |       { url: '/api/auth/session', expectedStatus: 200 },
  114 |     ];
  115 |     
  116 |     for (const test of apiTests) {
  117 |       const response = await request.get(`http://localhost:3000${test.url}`);
  118 |       console.log(`${test.url}: ${response.status()}`);
> 119 |       expect(response.status()).toBeLessThan(500);
      |                                 ^ Error: expect(received).toBeLessThan(expected)
  120 |     }
  121 |   });
  122 | 
  123 |   test('should check for console errors on key pages', async ({ page }) => {
  124 |     const consoleErrors: string[] = [];
  125 |     
  126 |     page.on('console', msg => {
  127 |       if (msg.type() === 'error') {
  128 |         consoleErrors.push(msg.text());
  129 |       }
  130 |     });
  131 |     
  132 |     await page.goto('http://localhost:3000/auth/login', { waitUntil: 'networkidle' });
  133 |     await page.waitForTimeout(1000);
  134 |     
  135 |     console.log('Console errors on login:', consoleErrors.length);
  136 |     expect(consoleErrors.length).toBeLessThan(3);
  137 |   });
  138 | });
```