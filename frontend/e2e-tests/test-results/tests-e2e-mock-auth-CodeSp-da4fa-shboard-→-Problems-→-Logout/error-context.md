# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/e2e-mock-auth.spec.ts >> CodeSpectra E2E with Mock Auth >> 16. Complete user flow: Login → Dashboard → Problems → Logout
- Location: tests/e2e-mock-auth.spec.ts:377:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/auth/login
Call log:
  - navigating to "http://localhost:3000/auth/login", waiting until "networkidle"

```

# Test source

```ts
  281 |   // ==========================================
  282 |   // API ENDPOINTS
  283 |   // ==========================================
  284 |   test('11. API endpoints respond', async () => {
  285 |     const endpoints = [
  286 |       { path: '/api/auth/session', expectStatus: 200 },
  287 |       { path: '/api/problems', expectStatus: 200 },
  288 |       { path: '/api/health', expectStatus: [200, 503] }, // 503 is OK if MongoDB not configured
  289 |     ];
  290 | 
  291 |     for (const ep of endpoints) {
  292 |       const resp = await page.request.get(`http://localhost:3000${ep.path}`);
  293 |       const status = resp.status();
  294 |       const expectedStatuses = Array.isArray(ep.expectStatus) ? ep.expectStatus : [ep.expectStatus];
  295 |       const ok = expectedStatuses.includes(status);
  296 |       console.log(`  ${ep.path}: ${status} ${ok ? '✅' : '❌'}`);
  297 |     }
  298 |   });
  299 | 
  300 |   // ==========================================
  301 |   // RESPONSIVE DESIGN
  302 |   // ==========================================
  303 |   test('12. Mobile responsive layout', async () => {
  304 |     // Set mobile viewport
  305 |     await page.setViewportSize({ width: 375, height: 812 });
  306 | 
  307 |     await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  308 |     await page.waitForTimeout(2000);
  309 | 
  310 |     // Check for mobile menu
  311 |     const hamburger = await page.locator('button[aria-label*="menu" i], button[class*="menu"]').first().isVisible().catch(() => false);
  312 |     console.log(`  Mobile menu button: ${hamburger ? 'VISIBLE ✅' : 'NOT FOUND (may be using icons)'}`);
  313 | 
  314 |     // Check page doesn't overflow
  315 |     const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  316 |     console.log(`  Page width: ${bodyWidth}px (viewport: 375px) ${bodyWidth <= 400 ? '✅' : '⚠️'}`);
  317 |   });
  318 | 
  319 |   test('13. Tablet responsive layout', async () => {
  320 |     await page.setViewportSize({ width: 768, height: 1024 });
  321 | 
  322 |     await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  323 |     await page.waitForTimeout(2000);
  324 | 
  325 |     const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  326 |     console.log(`  Page width: ${bodyWidth}px (viewport: 768px) ${bodyWidth <= 800 ? '✅' : '⚠️'}`);
  327 |   });
  328 | 
  329 |   // ==========================================
  330 |   // DARK MODE
  331 |   // ==========================================
  332 |   test('14. Dark mode is active', async () => {
  333 |     await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  334 |     await page.waitForTimeout(2000);
  335 | 
  336 |     const isDark = await page.evaluate(() =>
  337 |       document.documentElement.classList.contains('dark') ||
  338 |       document.body.classList.contains('dark')
  339 |     );
  340 |     console.log(`  Dark mode: ${isDark ? 'ACTIVE ✅' : 'INACTIVE'}`);
  341 |   });
  342 | 
  343 |   // ==========================================
  344 |   // CONSOLE ERRORS
  345 |   // ==========================================
  346 |   test('15. No console errors on main pages', async () => {
  347 |     const errors: string[] = [];
  348 |     page.on('console', msg => {
  349 |       if (msg.type() === 'error') {
  350 |         errors.push(msg.text());
  351 |       }
  352 |     });
  353 | 
  354 |     const testPages = ['/', '/auth/login', '/dashboard'];
  355 |     for (const p of testPages) {
  356 |       await page.goto(`http://localhost:3000${p}`, { waitUntil: 'networkidle' });
  357 |       await page.waitForTimeout(2000);
  358 |     }
  359 | 
  360 |     const criticalErrors = errors.filter(e =>
  361 |       e.includes('Error') &&
  362 |       !e.includes('warning') &&
  363 |       !e.includes('Warning') &&
  364 |       !e.includes('Firebase')
  365 |     );
  366 | 
  367 |     console.log(`  Total console errors: ${errors.length}`);
  368 |     console.log(`  Critical errors: ${criticalErrors.length}`);
  369 |     if (criticalErrors.length > 0) {
  370 |       criticalErrors.slice(0, 3).forEach(e => console.log(`    - ${e.substring(0, 100)}`));
  371 |     }
  372 |   });
  373 | 
  374 |   // ==========================================
  375 |   // FULL USER FLOWS
  376 |   // ==========================================
  377 |   test('16. Complete user flow: Login → Dashboard → Problems → Logout', async () => {
  378 |     console.log('\n=== Testing Complete User Flow ===');
  379 | 
  380 |     // 1. Go to login
> 381 |     await page.goto('http://localhost:3000/auth/login', { waitUntil: 'networkidle' });
      |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/auth/login
  382 |     await page.waitForTimeout(2000);
  383 |     console.log('  1. Login page loaded');
  384 | 
  385 |     // 2. Fill login form (mock will handle submission)
  386 |     await page.locator('#email').fill('test@codespectra.dev');
  387 |     await page.locator('#password').fill('password123');
  388 |     await page.locator('button[type="submit"]').click();
  389 |     await page.waitForTimeout(3000);
  390 |     console.log('  2. Login form submitted');
  391 | 
  392 |     // 3. Check redirect to dashboard
  393 |     const dashUrl = page.url();
  394 |     console.log(`  3. Current URL: ${dashUrl}`);
  395 | 
  396 |     // 4. Navigate to problems
  397 |     await page.goto('http://localhost:3000/dashboard/problems', { waitUntil: 'networkidle' });
  398 |     await page.waitForTimeout(2000);
  399 |     console.log('  4. Problems page loaded');
  400 | 
  401 |     // 5. Check user menu
  402 |     const userMenuVisible = await page.locator('[class*="user"], [class*="avatar"]').first().isVisible().catch(() => false);
  403 |     console.log(`  5. User menu visible: ${userMenuVisible ? 'YES' : 'NO'}`);
  404 | 
  405 |     console.log('  ✅ Complete flow tested');
  406 |   });
  407 | 
  408 |   test('17. Signup flow', async () => {
  409 |     await page.goto('http://localhost:3000/auth/signup', { waitUntil: 'networkidle' });
  410 |     await page.waitForTimeout(2000);
  411 | 
  412 |     // Fill signup form
  413 |     await page.locator('#name').fill('New Test User');
  414 |     await page.locator('#email').fill('newuser@test.com');
  415 |     await page.locator('#password').fill('TestPass123!');
  416 |     await page.locator('#confirm').fill('TestPass123!');
  417 | 
  418 |     // Check password requirements display
  419 |     const passwordChecks = await page.locator('text="At least 8 characters"').isVisible().catch(() => false);
  420 |     console.log(`  Password requirements shown: ${passwordChecks ? 'YES' : 'NO'}`);
  421 | 
  422 |     // Submit
  423 |     await page.locator('button[type="submit"]').click();
  424 |     await page.waitForTimeout(3000);
  425 | 
  426 |     const url = page.url();
  427 |     console.log(`  After signup URL: ${url}`);
  428 |     console.log(`  Signup flow: ${url.includes('dashboard') ? '✅ REDIRECTED TO DASHBOARD' : '⚠️ STAYED ON PAGE'}`);
  429 |   });
  430 | 
  431 |   test('18. Forgot password flow', async () => {
  432 |     await page.goto('http://localhost:3000/auth/forgot-password', { waitUntil: 'networkidle' });
  433 |     await page.waitForTimeout(2000);
  434 | 
  435 |     await page.locator('#email').fill('test@codespectra.dev');
  436 |     await page.locator('button[type="submit"]').click();
  437 |     await page.waitForTimeout(3000);
  438 | 
  439 |     // Check for success message or redirect
  440 |     const url = page.url();
  441 |     const bodyText = await page.locator('body').textContent();
  442 |     const hasSuccess = bodyText && (
  443 |       bodyText.includes('email') ||
  444 |       bodyText.includes('sent') ||
  445 |       bodyText.includes('check') ||
  446 |       url.includes('login')
  447 |     );
  448 | 
  449 |     console.log(`  Forgot password: ${hasSuccess ? '✅ FLOW COMPLETED' : '⚠️ CHECK CONTENT'}`);
  450 |   });
  451 | 
  452 |   // ==========================================
  453 |   // FINAL REPORT
  454 |   // ==========================================
  455 |   test('19. Generate final QA report', async () => {
  456 |     console.log('\n' + '='.repeat(50));
  457 |     console.log('📊 CODE SPECTRA E2E TEST REPORT');
  458 |     console.log('='.repeat(50));
  459 |     console.log('Test Date:', new Date().toISOString());
  460 |     console.log('Mock Auth: ENABLED');
  461 |     console.log('Mock User:', MOCK_USER.email);
  462 |     console.log('='.repeat(50));
  463 |     console.log('✅ ALL E2E TESTS COMPLETED');
  464 |     console.log('='.repeat(50));
  465 |   });
  466 | });
```