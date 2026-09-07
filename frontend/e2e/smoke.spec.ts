import { test, expect, type Page } from '@playwright/test';

// Pages that should be accessible without authentication
const PUBLIC_PAGES = [
  { path: '/', name: 'Home' },
  { path: '/pricing', name: 'Pricing' },
  { path: '/docs', name: 'Docs' },
  { path: '/blog', name: 'Blog' },
  { path: '/status', name: 'Status' },
  { path: '/companies', name: 'Companies' },
];

// Pages that require authentication — tested via cookie injection
// To populate: curl -c cookies.txt -X POST http://localhost:3000/api/auth/login -d '{"email":"...","password":"..."}'
// Then paste the session cookie value below.
const AUTH_COOKIE_NAME = 'next-auth.session-token'; // or your session cookie name
const AUTH_COOKIE_VALUE = process.env.E2E_SESSION_COOKIE || '';

const AUTH_PAGES = [
  { path: '/dashboard', name: 'Dashboard' },
  { path: '/dashboard/admin/system', name: 'Admin System' },
  { path: '/dashboard/admin/settings', name: 'Admin Settings' },
  { path: '/dashboard/interviews/feedback', name: 'Interviews Feedback' },
  { path: '/dashboard/problems', name: 'Problems' },
  { path: '/dashboard/courses', name: 'Courses' },
  { path: '/dashboard/assessments', name: 'Assessments' },
];

async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test.describe('Smoke test — public pages', () => {
  for (const { path, name } of PUBLIC_PAGES) {
    test(`${name} (${path}) loads without error`, async ({ page }) => {
      const errors = await collectConsoleErrors(page);
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });

      // Screenshot every page
      await page.screenshot({ path: `e2e/screenshots${path.replace(/\//g, '_') || '_home'}.png` });

      // Must not be a server error
      expect(response?.status(), `${path} returned ${response?.status()}`).toBeLessThan(500);

      // No uncaught JS errors
      expect(errors, `JS errors on ${path}`).toEqual([]);
    });
  }
});

test.describe('Smoke test — auth-required pages', () => {
  test.skip(!AUTH_COOKIE_VALUE, 'Set E2E_SESSION_COOKIE env var to run auth page tests');

  for (const { path, name } of AUTH_PAGES) {
    test(`${name} (${path}) loads without error`, async ({ page }) => {
      // Inject auth cookie before navigating
      await page.context().addCookies([
        {
          name: AUTH_COOKIE_NAME,
          value: AUTH_COOKIE_VALUE,
          domain: 'localhost',
          path: '/',
        },
      ]);

      const errors = await collectConsoleErrors(page);
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });

      await page.screenshot({ path: `e2e/screenshots${path.replace(/\//g, '_')}.png` });

      // Accept 200 or 302 (redirect to login if cookie expired)
      const status = response?.status() ?? 0;
      expect(
        [200, 302].includes(status),
        `${path} returned ${status} — cookie may be expired or page broken`,
      ).toBeTruthy();

      expect(errors, `JS errors on ${path}`).toEqual([]);
    });
  }
});
