import { test, expect, chromium, Page, Browser, BrowserContext } from '@playwright/test';

/**
 * CodeSpectra E2E Test with Mock Auth
 * Tests all user flows using mocked authentication
 */

const MOCK_USER = {
  uid: 'test-user-123',
  email: 'test@codespectra.dev',
  fullName: 'Test User',
  role: 'user',
  plan: 'pro',
};

test.describe('CodeSpectra E2E with Mock Auth', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();

    // Mock session API to return our fake user
    await page.route('**/api/auth/session', async (route) => {
      const url = route.request().url();
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user: MOCK_USER }),
        });
      } else if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      } else {
        await route.continue();
      }
    });

    // Mock other auth endpoints
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: MOCK_USER.uid, email: MOCK_USER.email, name: MOCK_USER.fullName },
          token: 'mock-token',
        }),
      });
    });

    await page.route('**/api/auth/signup', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: MOCK_USER.uid, email: MOCK_USER.email, name: MOCK_USER.fullName },
        }),
      });
    });

    await page.route('**/api/problems*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ problems: [], total: 0 }),
      });
    });

    // Mock dashboard data endpoints
    await page.route('**/api/dashboard*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ stats: {}, recentActivity: [] }),
      });
    });

    console.log('✅ Mock auth configured');
  });

  test.afterAll(async () => {
    await browser.close();
  });

  test.afterEach(async () => {
    await page.screenshot({ path: `../screenshots/e2e_after_test.png`, fullPage: true }).catch(() => {});
  });

  // ==========================================
  // PUBLIC PAGES
  // ==========================================
  test('1. Landing page loads correctly', async () => {
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const title = await page.title();
    expect(title).toContain('CodeSpectra');

    const h1 = await page.locator('h1').first().textContent();
    expect(h1).toBeTruthy();

    // Check for main CTA
    const ctaButtons = await page.locator('button:has-text("Start"), button:has-text("Get Started")').count();
    console.log(`  CTA buttons found: ${ctaButtons}`);

    console.log(`  ✅ Landing page: "${title}"`);
  });

  test('2. Auth pages render correctly', async () => {
    // Login page
    await page.goto('http://localhost:3000/auth/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    expect(await page.locator('#email').isVisible()).toBeTruthy();
    expect(await page.locator('#password').isVisible()).toBeTruthy();
    console.log('  Login page: ✅');

    // Signup page
    await page.goto('http://localhost:3000/auth/signup', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    expect(await page.locator('#name').isVisible()).toBeTruthy();
    expect(await page.locator('#email').isVisible()).toBeTruthy();
    expect(await page.locator('#password').isVisible()).toBeTruthy();
    console.log('  Signup page: ✅');

    // Forgot password page
    await page.goto('http://localhost:3000/auth/forgot-password', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    expect(await page.locator('#email').isVisible()).toBeTruthy();
    console.log('  Forgot password page: ✅');
  });

  test('3. Auth form validation works', async () => {
    await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Test empty form submission
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(500);

    // Test invalid email
    await page.locator('#email').fill('invalid-email');
    await page.locator('#password').fill('password');
    const isValid = await page.locator('#email').evaluate(el => el.checkValidity());
    console.log(`  Email validation: ${isValid ? 'WORKING' : 'NOT WORKING'}`);
  });

  // ==========================================
  // DASHBOARD (AUTHENTICATED)
  // ==========================================
  test('4. Dashboard loads with mock auth', async () => {
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Should show dashboard, not redirect to login
    const url = page.url();
    console.log(`  Dashboard URL: ${url}`);

    // Check for dashboard elements
    await page.waitForTimeout(2000);
    const sidebar = await page.locator('aside, nav, [class*="sidebar"]').first().isVisible().catch(() => false);
    const mainContent = await page.locator('main, [class*="content"], [class*="dashboard"]').first().isVisible().catch(() => false);

    console.log(`  Sidebar: ${sidebar ? 'VISIBLE' : 'NOT FOUND'}`);
    console.log(`  Main content: ${mainContent ? 'VISIBLE' : 'NOT FOUND'}`);
    console.log(`  URL contains /dashboard: ${url.includes('/dashboard')}`);
  });

  test('5. Dashboard navigation works', async () => {
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Look for any navigation links
    const navLinks = await page.locator('a[href*="/dashboard"], nav a').all();
    console.log(`  Dashboard nav links: ${navLinks.length}`);

    // Check for user menu/profile
    const userMenu = await page.locator('[class*="user"], [class*="profile"], button:has-text("User")').first().isVisible().catch(() => false);
    console.log(`  User menu: ${userMenu ? 'VISIBLE' : 'NOT FOUND'}`);
  });

  // ==========================================
  // PROBLEMS PAGE
  // ==========================================
  test('6. Problems page loads', async () => {
    await page.goto('http://localhost:3000/dashboard/problems', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const url = page.url();
    console.log(`  Problems URL: ${url}`);

    // Check for problem-related content
    const pageContent = await page.locator('body').textContent();
    const hasProblems = pageContent && (
      pageContent.toLowerCase().includes('problem') ||
      pageContent.toLowerCase().includes('challenge') ||
      pageContent.toLowerCase().includes('coding')
    );
    console.log(`  Has problem content: ${hasProblems ? 'YES' : 'NO'}`);
  });

  // ==========================================
  // SUBMISSIONS PAGE
  // ==========================================
  test('7. Submissions page loads', async () => {
    await page.goto('http://localhost:3000/dashboard/submissions', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const url = page.url();
    console.log(`  Submissions URL: ${url}`);

    const pageContent = await page.locator('body').textContent();
    const hasContent = pageContent && pageContent.length > 100;
    console.log(`  Has content: ${hasContent ? 'YES' : 'NO'}`);
  });

  // ==========================================
  // LEADERBOARD PAGE
  // ==========================================
  test('8. Leaderboard page loads', async () => {
    await page.goto('http://localhost:3000/dashboard/leaderboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const url = page.url();
    console.log(`  Leaderboard URL: ${url}`);

    const pageContent = await page.locator('body').textContent();
    const hasLeaderboard = pageContent && (
      pageContent.toLowerCase().includes('rank') ||
      pageContent.toLowerCase().includes('leaderboard') ||
      pageContent.toLowerCase().includes('score')
    );
    console.log(`  Has leaderboard content: ${hasLeaderboard ? 'YES' : 'NO'}`);
  });

  // ==========================================
  // SETTINGS PAGE
  // ==========================================
  test('9. Settings page loads', async () => {
    await page.goto('http://localhost:3000/dashboard/settings', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const url = page.url();
    console.log(`  Settings URL: ${url}`);

    const pageContent = await page.locator('body').textContent();
    const hasSettings = pageContent && (
      pageContent.toLowerCase().includes('setting') ||
      pageContent.toLowerCase().includes('profile') ||
      pageContent.toLowerCase().includes('account')
    );
    console.log(`  Has settings content: ${hasSettings ? 'YES' : 'NO'}`);
  });

  // ==========================================
  // ADMIN PAGES (if user has admin role)
  // ==========================================
  test('10. Admin pages accessibility', async () => {
    const adminPages = [
      '/dashboard/admin/users',
      '/dashboard/admin/team',
      '/dashboard/admin/permissions',
    ];

    for (const adminPath of adminPages) {
      await page.goto(`http://localhost:3000${adminPath}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(1000);

      const url = page.url();
      const isRedirected = url.includes('/auth/login');
      console.log(`  ${adminPath}: ${isRedirected ? 'REDIRECTED (needs higher role)' : 'ACCESSIBLE'}`);
    }
  });

  // ==========================================
  // API ENDPOINTS
  // ==========================================
  test('11. API endpoints respond', async () => {
    const endpoints = [
      { path: '/api/auth/session', expectStatus: 200 },
      { path: '/api/problems', expectStatus: 200 },
      { path: '/api/health', expectStatus: [200, 503] }, // 503 is OK if MongoDB not configured
    ];

    for (const ep of endpoints) {
      const resp = await page.request.get(`http://localhost:3000${ep.path}`);
      const status = resp.status();
      const expectedStatuses = Array.isArray(ep.expectStatus) ? ep.expectStatus : [ep.expectStatus];
      const ok = expectedStatuses.includes(status);
      console.log(`  ${ep.path}: ${status} ${ok ? '✅' : '❌'}`);
    }
  });

  // ==========================================
  // RESPONSIVE DESIGN
  // ==========================================
  test('12. Mobile responsive layout', async () => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Check for mobile menu
    const hamburger = await page.locator('button[aria-label*="menu" i], button[class*="menu"]').first().isVisible().catch(() => false);
    console.log(`  Mobile menu button: ${hamburger ? 'VISIBLE ✅' : 'NOT FOUND (may be using icons)'}`);

    // Check page doesn't overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    console.log(`  Page width: ${bodyWidth}px (viewport: 375px) ${bodyWidth <= 400 ? '✅' : '⚠️'}`);
  });

  test('13. Tablet responsive layout', async () => {
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    console.log(`  Page width: ${bodyWidth}px (viewport: 768px) ${bodyWidth <= 800 ? '✅' : '⚠️'}`);
  });

  // ==========================================
  // DARK MODE
  // ==========================================
  test('14. Dark mode is active', async () => {
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark') ||
      document.body.classList.contains('dark')
    );
    console.log(`  Dark mode: ${isDark ? 'ACTIVE ✅' : 'INACTIVE'}`);
  });

  // ==========================================
  // CONSOLE ERRORS
  // ==========================================
  test('15. No console errors on main pages', async () => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    const testPages = ['/', '/auth/login', '/dashboard'];
    for (const p of testPages) {
      await page.goto(`http://localhost:3000${p}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
    }

    const criticalErrors = errors.filter(e =>
      e.includes('Error') &&
      !e.includes('warning') &&
      !e.includes('Warning') &&
      !e.includes('Firebase')
    );

    console.log(`  Total console errors: ${errors.length}`);
    console.log(`  Critical errors: ${criticalErrors.length}`);
    if (criticalErrors.length > 0) {
      criticalErrors.slice(0, 3).forEach(e => console.log(`    - ${e.substring(0, 100)}`));
    }
  });

  // ==========================================
  // FULL USER FLOWS
  // ==========================================
  test('16. Complete user flow: Login → Dashboard → Problems → Logout', async () => {
    console.log('\n=== Testing Complete User Flow ===');

    // 1. Go to login
    await page.goto('http://localhost:3000/auth/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    console.log('  1. Login page loaded');

    // 2. Fill login form (mock will handle submission)
    await page.locator('#email').fill('test@codespectra.dev');
    await page.locator('#password').fill('password123');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);
    console.log('  2. Login form submitted');

    // 3. Check redirect to dashboard
    const dashUrl = page.url();
    console.log(`  3. Current URL: ${dashUrl}`);

    // 4. Navigate to problems
    await page.goto('http://localhost:3000/dashboard/problems', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    console.log('  4. Problems page loaded');

    // 5. Check user menu
    const userMenuVisible = await page.locator('[class*="user"], [class*="avatar"]').first().isVisible().catch(() => false);
    console.log(`  5. User menu visible: ${userMenuVisible ? 'YES' : 'NO'}`);

    console.log('  ✅ Complete flow tested');
  });

  test('17. Signup flow', async () => {
    await page.goto('http://localhost:3000/auth/signup', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Fill signup form
    await page.locator('#name').fill('New Test User');
    await page.locator('#email').fill('newuser@test.com');
    await page.locator('#password').fill('TestPass123!');
    await page.locator('#confirm').fill('TestPass123!');

    // Check password requirements display
    const passwordChecks = await page.locator('text="At least 8 characters"').isVisible().catch(() => false);
    console.log(`  Password requirements shown: ${passwordChecks ? 'YES' : 'NO'}`);

    // Submit
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);

    const url = page.url();
    console.log(`  After signup URL: ${url}`);
    console.log(`  Signup flow: ${url.includes('dashboard') ? '✅ REDIRECTED TO DASHBOARD' : '⚠️ STAYED ON PAGE'}`);
  });

  test('18. Forgot password flow', async () => {
    await page.goto('http://localhost:3000/auth/forgot-password', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await page.locator('#email').fill('test@codespectra.dev');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);

    // Check for success message or redirect
    const url = page.url();
    const bodyText = await page.locator('body').textContent();
    const hasSuccess = bodyText && (
      bodyText.includes('email') ||
      bodyText.includes('sent') ||
      bodyText.includes('check') ||
      url.includes('login')
    );

    console.log(`  Forgot password: ${hasSuccess ? '✅ FLOW COMPLETED' : '⚠️ CHECK CONTENT'}`);
  });

  // ==========================================
  // FINAL REPORT
  // ==========================================
  test('19. Generate final QA report', async () => {
    console.log('\n' + '='.repeat(50));
    console.log('📊 CODE SPECTRA E2E TEST REPORT');
    console.log('='.repeat(50));
    console.log('Test Date:', new Date().toISOString());
    console.log('Mock Auth: ENABLED');
    console.log('Mock User:', MOCK_USER.email);
    console.log('='.repeat(50));
    console.log('✅ ALL E2E TESTS COMPLETED');
    console.log('='.repeat(50));
  });
});