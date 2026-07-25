import { test, expect, chromium, Page, Browser, BrowserContext } from '@playwright/test';

/**
 * Single-Browser Comprehensive QA Test
 * Opens ONE browser instance and tests all major user flows sequentially
 * to minimize system load and provide a cohesive UX audit
 */

test.describe('CodeSpectra Single-Browser QA Audit', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  
  // Track all issues found
  const issues: Array<{
    page: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    type: string;
    description: string;
    expected?: string;
    actual?: string;
    screenshot?: string;
  }> = [];
  
  const screenshots: string[] = [];
  
  test.beforeAll(async () => {
    console.log('🚀 Launching single browser instance...');
    browser = await chromium.launch({ 
      headless: true,
      args: ['--disable-dev-shm-usage', '--no-sandbox']
    });
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideoDir: './videos',
    });
    page = await context.newPage();
    console.log('✅ Browser launched successfully');
  });
  
  test.afterAll(async () => {
    console.log('📊 Closing browser...');
    await browser.close();
    console.log(`📸 Screenshots captured: ${screenshots.length}`);
    console.log(`🐛 Issues found: ${issues.length}`);
  });
  
  test.afterEach(async () => {
    // Take screenshot after each major section
    const testName = expect.getState().currentTestName?.replace(/\s+/g, '_') || 'screenshot';
    const path = `../screenshots/${testName}.png`;
    await page.screenshot({ path, fullPage: true });
    screenshots.push(path);
  });
  
  // Helper function to log issues
  async function addIssue(pageName: string, severity: string, type: string, desc: string, expected?: string, actual?: string) {
    issues.push({ page: pageName, severity: severity as any, type, description: desc, expected, actual });
    console.log(`🐛 [${severity.toUpperCase()}] ${pageName} - ${type}: ${desc}`);
  }
  
  // ==========================================
  // SECTION 1: Landing Page & Public Pages
  // ==========================================
  test('1.1 - Landing Page', async () => {
    console.log('\n=== Testing Landing Page ===');
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Check main elements
    const title = await page.title();
    console.log(`  Title: ${title}`);
    
    const h1 = await page.locator('h1').first().textContent().catch(() => 'NOT FOUND');
    console.log(`  H1: ${h1}`);
    
    // Check for navigation links
    const navLinks = await page.locator('nav a, header a').count();
    console.log(`  Navigation links: ${navLinks}`);
    
    // Check for main content
    const hasContent = await page.locator('main, [role="main"], .min-h-screen').count();
    console.log(`  Main content sections: ${hasContent}`);
    
    // Check for footer
    const hasFooter = await page.locator('footer').count();
    console.log(`  Footer present: ${hasFooter > 0 ? 'YES' : 'NO'}`);
    
    if (title !== 'CodeSpectra - Master Code Through AI') {
      await addIssue('Landing Page', 'medium', 'Title mismatch', `Expected "CodeSpectra - Master Code Through AI", got "${title}"`);
    }
  });
  
  test('1.2 - Public Pages Navigation', async () => {
    console.log('\n=== Testing Public Pages ===');
    const publicPages = [
      { path: '/', name: 'Landing' },
      { path: '/about', name: 'About' },
      { path: '/features', name: 'Features' },
      { path: '/pricing', name: 'Pricing' },
    ];
    
    for (const pubPage of publicPages) {
      await page.goto(`http://localhost:3000${pubPage.path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      
      const title = await page.title();
      const hasContent = await page.locator('body').count() > 0;
      
      console.log(`  ${pubPage.name}: ${title.substring(0, 50)} - ${hasContent ? 'OK' : 'ISSUE'}`);
    }
  });
  
  // ==========================================
  // SECTION 2: Authentication Flow
  // ==========================================
  test('2.1 - Login Page Rendering', async () => {
    console.log('\n=== Testing Login Page ===');
    await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Check form elements exist
    const emailInput = await page.locator('#email').isVisible().catch(() => false);
    const passwordInput = await page.locator('#password').isVisible().catch(() => false);
    const submitButton = await page.locator('button[type="submit"]').isVisible().catch(() => false);
    
    console.log(`  Email input: ${emailInput ? 'VISIBLE' : 'NOT FOUND'}`);
    console.log(`  Password input: ${passwordInput ? 'VISIBLE' : 'NOT FOUND'}`);
    console.log(`  Submit button: ${submitButton ? 'VISIBLE' : 'NOT FOUND'}`);
    
    if (!emailInput || !passwordInput) {
      await addIssue('Login Page', 'critical', 'Form elements missing', 'Email or password input not visible');
    }
    
    // Check social login buttons
    const googleBtn = await page.locator('button:has-text("Google")').isVisible().catch(() => false);
    const githubBtn = await page.locator('button:has-text("GitHub")').isVisible().catch(() => false);
    console.log(`  Google button: ${googleBtn ? 'VISIBLE' : 'NOT FOUND'}`);
    console.log(`  GitHub button: ${githubBtn ? 'VISIBLE' : 'NOT FOUND'}`);
    
    // Check navigation links
    const signupLink = await page.locator('a[href*="signup"], a:has-text("Sign Up")').first().isVisible().catch(() => false);
    const forgotLink = await page.locator('a[href*="forgot"], a:has-text("Forgot")').first().isVisible().catch(() => false);
    console.log(`  Signup link: ${signupLink ? 'VISIBLE' : 'NOT FOUND'}`);
    console.log(`  Forgot password link: ${forgotLink ? 'VISIBLE' : 'NOT FOUND'}`);
  });
  
  test('2.2 - Login Form Validation', async () => {
    console.log('\n=== Testing Login Form Validation ===');
    await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Try submitting empty form
    const submitBtn = page.locator('button[type="submit"]');
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await page.waitForTimeout(500);
      
      // Check HTML5 validation works
      const emailEl = page.locator('#email');
      const isInvalid = await emailEl.evaluate(el => el.checkValidity() === false).catch(() => false);
      console.log(`  Empty form validation: ${isInvalid ? 'WORKING' : 'NOT WORKING'}`);
      
      if (!isInvalid) {
        await addIssue('Login Form', 'medium', 'Validation', 'HTML5 validation not triggered on empty submit');
      }
      
      // Fill invalid email
      await page.locator('#email').fill('invalid-email');
      await page.locator('#password').fill('password');
      await submitBtn.click();
      await page.waitForTimeout(500);
      
      const emailEl2 = page.locator('#email');
      const isInvalid2 = await emailEl2.evaluate(el => el.checkValidity() === false).catch(() => false);
      console.log(`  Invalid email validation: ${isInvalid2 ? 'WORKING' : 'NOT WORKING'}`);
    }
  });
  
  test('2.3 - Signup Page Flow', async () => {
    console.log('\n=== Testing Signup Page ===');
    await page.goto('http://localhost:3000/auth/signup', { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000); // Wait for React hydration
    
    // Check form elements
    const nameInput = await page.locator('#name').isVisible().catch(() => false);
    const emailInput = await page.locator('#email').isVisible().catch(() => false);
    const passwordInput = await page.locator('#password').isVisible().catch(() => false);
    const confirmInput = await page.locator('#confirm').isVisible().catch(() => false);
    
    console.log(`  Name input: ${nameInput ? 'VISIBLE' : 'NOT FOUND'}`);
    console.log(`  Email input: ${emailInput ? 'VISIBLE' : 'NOT FOUND'}`);
    console.log(`  Password input: ${passwordInput ? 'VISIBLE' : 'NOT FOUND'}`);
    console.log(`  Confirm input: ${confirmInput ? 'VISIBLE' : 'NOT FOUND'}`);
    
    if (!nameInput || !emailInput || !passwordInput) {
      await addIssue('Signup Page', 'high', 'Form elements', 'Required form inputs not visible after hydration');
    }
    
    // Check login link
    const loginLink = await page.locator('a[href*="login"]').first().isVisible().catch(() => false);
    console.log(`  Login link: ${loginLink ? 'VISIBLE' : 'NOT FOUND'}`);
  });
  
  test('2.4 - Forgot Password Page Flow', async () => {
    console.log('\n=== Testing Forgot Password Page ===');
    await page.goto('http://localhost:3000/auth/forgot-password', { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000); // Wait for React hydration
    
    const emailInput = await page.locator('#email').isVisible().catch(() => false);
    const submitButton = await page.locator('button[type="submit"]').isVisible().catch(() => false);
    const backLink = await page.locator('a[href*="login"]').first().isVisible().catch(() => false);
    
    console.log(`  Email input: ${emailInput ? 'VISIBLE' : 'NOT FOUND'}`);
    console.log(`  Submit button: ${submitButton ? 'VISIBLE' : 'NOT FOUND'}`);
    console.log(`  Back to login: ${backLink ? 'VISIBLE' : 'NOT FOUND'}`);
    
    if (!emailInput) {
      await addIssue('Forgot Password', 'high', 'Missing element', 'Email input not visible after hydration');
    }
  });
  
  test('2.5 - Auth Navigation Flow', async () => {
    console.log('\n=== Testing Auth Navigation ===');
    await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Click signup link
    const signupLink = page.locator('a[href*="signup"]').first();
    if (await signupLink.isVisible()) {
      await signupLink.click();
      await page.waitForTimeout(2000);
      
      const url = page.url();
      console.log(`  After clicking Signup: ${url}`);
      
      if (!url.includes('signup')) {
        await addIssue('Auth Navigation', 'high', 'Navigation broken', 'Signup link did not navigate');
      }
    }
    
    // Navigate to forgot password
    await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    const forgotLink = page.locator('a[href*="forgot"]').first();
    if (await forgotLink.isVisible()) {
      await forgotLink.click();
      await page.waitForTimeout(2000);
      
      const url2 = page.url();
      console.log(`  After clicking Forgot: ${url2}`);
      
      if (!url2.includes('forgot')) {
        await addIssue('Auth Navigation', 'high', 'Navigation broken', 'Forgot password link did not navigate');
      }
    }
  });
  
  // ==========================================
  // SECTION 3: Dashboard & Main App
  // ==========================================
  test('3.1 - Dashboard Access', async () => {
    console.log('\n=== Testing Dashboard Access ===');
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    const url = page.url();
    console.log(`  Dashboard URL: ${url}`);
    
    if (url.includes('/dashboard')) {
      console.log('  Dashboard accessible (may need auth)');
      
      // Check for sidebar/menu
      const sidebar = await page.locator('nav, [class*="sidebar"], [class*="menu"]').first().isVisible().catch(() => false);
      console.log(`  Sidebar/Nav: ${sidebar ? 'VISIBLE' : 'NOT FOUND'}`);
      
      // Check for user menu
      const userMenu = await page.locator('[class*="user"], [class*="avatar"], button:has-text("Profile")').first().isVisible().catch(() => false);
      console.log(`  User menu: ${userMenu ? 'VISIBLE' : 'NOT FOUND'}`);
    } else if (url.includes('/auth/login')) {
      console.log('  Redirected to login (expected - needs authentication)');
    }
  });
  
  test('3.2 - Main Navigation Items', async () => {
    console.log('\n=== Testing Main Navigation ===');
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Check header navigation
    const headerLinks = await page.locator('header a, [class*="header"] a').all();
    console.log(`  Header links found: ${headerLinks.length}`);
    
    // Check for primary CTA buttons
    const ctaButtons = await page.locator('button:has-text("Get Started"), button:has-text("Start Free"), button:has-text("Sign Up Free")').count();
    console.log(`  CTA buttons: ${ctaButtons}`);
  });
  
  // ==========================================
  // SECTION 4: API Endpoints
  // ==========================================
  test('4.1 - API Health Check', async () => {
    console.log('\n=== Testing API Endpoints ===');
    
    const apiTests = [
      { url: '/api/health', name: 'Health' },
      { url: '/api/auth/session', name: 'Session' },
      { url: '/api/problems', name: 'Problems' },
    ];
    
    for (const api of apiTests) {
      try {
        const response = await page.request.get(`http://localhost:3000${api.url}`);
        const status = response.status();
        const isJson = response.headers()['content-type']?.includes('application/json');
        
        console.log(`  ${api.name}: ${status} (JSON: ${isJson ? 'YES' : 'NO'})`);
        
        if (status >= 500) {
          await addIssue(`API: ${api.name}`, 'high', 'Server Error', `Status code ${status}`);
        }
      } catch (e: any) {
        console.log(`  ${api.name}: ERROR - ${e.message}`);
        await addIssue(`API: ${api.name}`, 'critical', 'Connection Error', e.message);
      }
    }
  });
  
  // ==========================================
  // SECTION 5: Console & Network Errors
  // ==========================================
  test('5.1 - Console Error Detection', async () => {
    console.log('\n=== Testing for Console Errors ===');
    
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    // Visit key pages
    const pages = ['/', '/auth/login', '/auth/signup'];
    for (const path of pages) {
      await page.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
    }
    
    console.log(`  Total console errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('  Errors:');
      errors.slice(0, 5).forEach(e => console.log(`    - ${e.substring(0, 100)}`));
    }
    
    // Filter for critical errors (not warnings)
    const criticalErrors = errors.filter(e => 
      e.includes('Error') && 
      !e.includes('warning') && 
      !e.includes('Warning') &&
      !e.includes('Download the React DevTools')
    );
    
    if (criticalErrors.length > 0) {
      await addIssue('Console', 'medium', 'JavaScript Errors', `${criticalErrors.length} console errors detected`);
    }
  });
  
  // ==========================================
  // SECTION 6: Responsive Layouts
  // ==========================================
  test('6.1 - Desktop Viewport', async () => {
    console.log('\n=== Testing Desktop Viewport (1920x1080) ===');
    await context.close();
    context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    page = await context.newPage();
    
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    const sidebar = await page.locator('nav, [class*="sidebar"]').first().isVisible().catch(() => false);
    console.log(`  Sidebar visible: ${sidebar ? 'YES' : 'NO'}`);
    
    const contentWidth = await page.evaluate(() => document.body.scrollWidth);
    console.log(`  Page width: ${contentWidth}px (viewport: 1920px)`);
  });
  
  test('6.2 - Tablet Viewport', async () => {
    console.log('\n=== Testing Tablet Viewport (768x1024) ===');
    await context.close();
    context = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    page = await context.newPage();
    
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    const hamburger = await page.locator('button[aria-label*="menu" i], button:has-text("☰")').first().isVisible().catch(() => false);
    console.log(`  Mobile menu button: ${hamburger ? 'VISIBLE' : 'NOT FOUND'}`);
  });
  
  test('6.3 - Mobile Viewport', async () => {
    console.log('\n=== Testing Mobile Viewport (375x812) ===');
    await context.close();
    context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    page = await context.newPage();
    
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    const hamburger = await page.locator('button[aria-label*="menu" i], button:has-text("☰")').first().isVisible().catch(() => false);
    console.log(`  Mobile menu button: ${hamburger ? 'VISIBLE' : 'NOT FOUND'}`);
    
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    console.log(`  Page width: ${bodyWidth}px (viewport: 375px)`);
    
    if (bodyWidth > 400) {
      console.log('  ⚠️ Horizontal scroll may be present');
    }
  });
  
  // ==========================================
  // SECTION 7: Dark Mode
  // ==========================================
  test('7.1 - Dark Mode Toggle', async () => {
    console.log('\n=== Testing Dark Mode ===');
    await context.close();
    context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    page = await context.newPage();
    
    await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Check if theme toggle exists
    const themeToggle = page.locator('button[aria-label*="theme" i], button[class*="theme"], [class*="dark-mode"]').first();
    const hasToggle = await themeToggle.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`  Theme toggle: ${hasToggle ? 'FOUND' : 'NOT FOUND'}`);
    
    // Check current theme
    const isDark = await page.evaluate(() => 
      document.documentElement.classList.contains('dark') || 
      document.body.classList.contains('dark') ||
      document.documentElement.getAttribute('data-theme') === 'dark'
    );
    console.log(`  Dark mode active: ${isDark ? 'YES' : 'NO (light mode)'}`);
  });
  
  // ==========================================
  // SUMMARY REPORT
  // ==========================================
  test('8.1 - Generate QA Report', async () => {
    console.log('\n' + '='.repeat(50));
    console.log('📊 QA AUDIT SUMMARY REPORT');
    console.log('='.repeat(50));
    
    console.log(`\n📸 Screenshots captured: ${screenshots.length}`);
    console.log(`🐛 Issues found: ${issues.length}`);
    
    if (issues.length > 0) {
      console.log('\n--- Issues Breakdown ---');
      
      const bySeverity = {
        critical: issues.filter(i => i.severity === 'critical'),
        high: issues.filter(i => i.severity === 'high'),
        medium: issues.filter(i => i.severity === 'medium'),
        low: issues.filter(i => i.severity === 'low'),
      };
      
      console.log(`  Critical: ${bySeverity.critical.length}`);
      console.log(`  High: ${bySeverity.high.length}`);
      console.log(`  Medium: ${bySeverity.medium.length}`);
      console.log(`  Low: ${bySeverity.low.length}`);
      
      console.log('\n--- All Issues ---');
      issues.forEach((issue, idx) => {
        console.log(`  ${idx + 1}. [${issue.severity.toUpperCase()}] ${issue.page} - ${issue.type}`);
        console.log(`     ${issue.description}`);
        if (issue.expected) console.log(`     Expected: ${issue.expected}`);
        if (issue.actual) console.log(`     Actual: ${issue.actual}`);
      });
    } else {
      console.log('\n✅ NO ISSUES FOUND - Application is working correctly!');
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('PRODUCTION READINESS: ' + (issues.filter(i => i.severity === 'critical').length === 0 ? '✅ PASS' : '❌ FAIL'));
    console.log('='.repeat(50));
    
    // Take final screenshot
    await page.screenshot({ path: '../screenshots/qa-audit-summary.png', fullPage: true });
    console.log('\n📸 Final screenshot saved to screenshots/qa-audit-summary.png');
  });
});