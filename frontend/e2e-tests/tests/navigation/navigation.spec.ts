import { test, expect } from '../../fixtures/test-fixtures';
import { DashboardPage } from '../../pages/dashboard-pages';
import { PageHelper, NavigationHelper } from '../../helpers/utilities';

test.describe('Navigation Tests', () => {
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboardPage = new DashboardPage(page);
  });

  test.describe('Sidebar Navigation', () => {
    test('should display sidebar on dashboard', async ({ page }) => {
      await dashboardPage.navigate();
      const sidebarVisible = await dashboardPage.isSidebarVisible();
      expect(sidebarVisible).toBeTruthy();
    });

    test('should have all menu items accessible', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const menuItems = await dashboardPage.getMenuItems();
      expect(menuItems.length).toBeGreaterThan(0);
    });

    test('should navigate to dashboard home', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const homeLink = authenticatedPage.locator('a[href="/dashboard"], nav a:has-text("Dashboard")').first();
      if (await homeLink.isVisible()) {
        await homeLink.click();
        await authenticatedPage.waitForLoadState('networkidle');
        expect(authenticatedPage.url()).toContain('/dashboard');
      }
    });

    test('should navigate to problems page', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      expect(authenticatedPage.url()).toContain('/problems');
    });

    test('should navigate to challenges page', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/challenges`);
      await authenticatedPage.waitForLoadState('networkidle');
      expect(authenticatedPage.url()).toContain('/challenges');
    });

    test('should navigate to leaderboard', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/leaderboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      expect(authenticatedPage.url()).toContain('/leaderboard');
    });

    test('should navigate to achievements', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/achievements`);
      await authenticatedPage.waitForLoadState('networkidle');
      expect(authenticatedPage.url()).toContain('/achievements');
    });

    test('should navigate to profile', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/profile`);
      await authenticatedPage.waitForLoadState('networkidle');
      expect(authenticatedPage.url()).toContain('/profile');
    });

    test('should navigate to settings', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/settings`);
      await authenticatedPage.waitForLoadState('networkidle');
      expect(authenticatedPage.url()).toContain('/settings');
    });

    test('should navigate to notifications', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/notifications`);
      await authenticatedPage.waitForLoadState('networkidle');
      expect(authenticatedPage.url()).toContain('/notifications');
    });

    test('should navigate to billing', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/billing`);
      await authenticatedPage.waitForLoadState('networkidle');
      expect(authenticatedPage.url()).toContain('/billing');
    });
  });

  test.describe('Breadcrumbs', () => {
    test('should display breadcrumbs on inner pages', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const breadcrumbs = authenticatedPage.locator('[class*="breadcrumb"], [class*="Breadcrumb"], nav[aria-label*="breadcrumb"]');
      const hasBreadcrumbs = await breadcrumbs.count() > 0;
      expect(hasBreadcrumbs).toBeTruthy();
    });

    test('should have working breadcrumb links', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const breadcrumbLinks = authenticatedPage.locator('[class*="breadcrumb"] a, [class*="Breadcrumb"] a');
      const count = await breadcrumbLinks.count();
      
      for (let i = 0; i < Math.min(count, 3); i++) {
        const link = breadcrumbLinks.nth(i);
        const href = await link.getAttribute('href');
        if (href && !href.startsWith('#') && href !== '#') {
          await link.click();
          await authenticatedPage.waitForLoadState('networkidle');
          break;
        }
      }
    });
  });

  test.describe('Internal Links', () => {
    test('should have no broken internal links', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const links = await PageHelper.getAllLinks(authenticatedPage);
      const brokenLinks: string[] = [];
      
      for (const link of links.slice(0, 20)) {
        if (link.startsWith('/') || link.includes('localhost')) {
          try {
            const response = await authenticatedPage.request.get(link.startsWith('/') ? `${process.env.BASE_URL || 'http://localhost:3000'}${link}` : link);
            if (response.status() >= 400) {
              brokenLinks.push(`${link} - ${response.status()}`);
            }
          } catch (e) {
            brokenLinks.push(`${link} - Request failed`);
          }
        }
      }
      
      console.log('Broken links found:', brokenLinks.length);
      expect(brokenLinks.length).toBe(0);
    });

    test('should navigate through public pages', async ({ page }) => {
      const publicPages = ['/', '/about', '/features', '/pricing', '/blog'];
      
      for (const path of publicPages) {
        await page.goto(`${process.env.BASE_URL || 'http://localhost:3000'}${path}`);
        await page.waitForLoadState('networkidle');
        expect(page.url()).toContain(path === '/' ? 'localhost' : path.split('/')[1]);
      }
    });
  });

  test.describe('Browser Back/Forward Navigation', () => {
    test('should work with browser back button', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      await authenticatedPage.goBack();
      await authenticatedPage.waitForLoadState('networkidle');
      
      expect(authenticatedPage.url()).toContain('/dashboard');
    });

    test('should work with browser forward button', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      await authenticatedPage.goBack();
      await authenticatedPage.waitForLoadState('networkidle');
      
      await authenticatedPage.goForward();
      await authenticatedPage.waitForLoadState('networkidle');
      
      expect(authenticatedPage.url()).toContain('/problems');
    });

    test('should refresh page correctly', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      await authenticatedPage.reload();
      await authenticatedPage.waitForLoadState('networkidle');
      
      expect(authenticatedPage.url()).toContain('/dashboard');
    });
  });

  test.describe('Deep Linking', () => {
    test('should access direct URLs', async ({ page, authenticatedPage }) => {
      const directUrls = [
        '/dashboard',
        '/dashboard/problems',
        '/dashboard/challenges',
        '/dashboard/leaderboard',
        '/dashboard/achievements',
      ];
      
      for (const url of directUrls) {
        await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}${url}`);
        await authenticatedPage.waitForLoadState('networkidle');
        expect(authenticatedPage.url()).toContain(url.split('/').pop() || 'dashboard');
      }
    });
  });

  test.describe('Menu Items', () => {
    test('should show all navigation items on desktop', async ({ page, authenticatedPage }) => {
      await authenticatedPage.setViewportSize({ width: 1920, height: 1080 });
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const menuItems = await dashboardPage.getMenuItems();
      expect(menuItems.length).toBeGreaterThan(0);
    });

    test('should collapse menu on tablet', async ({ page, authenticatedPage }) => {
      await authenticatedPage.setViewportSize({ width: 768, height: 1024 });
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const menuButton = authenticatedPage.locator('button[aria-label*="menu" i], button:has-text("☰"), [class*="menu-button"]').first();
      const hasMenuButton = await menuButton.isVisible().catch(() => false);
      expect(hasMenuButton).toBeTruthy();
    });

    test('should show hamburger menu on mobile', async ({ page, authenticatedPage }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 812 });
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const menuButton = authenticatedPage.locator('button[aria-label*="menu" i], button:has-text("☰")').first();
      await expect(menuButton).toBeVisible();
    });
  });
});