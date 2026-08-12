# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/navigation/navigation.spec.ts >> Navigation Tests >> Sidebar Navigation >> should navigate to dashboard home
- Location: tests/navigation/navigation.spec.ts:27:9

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/dashboard
Call log:
  - navigating to "http://localhost:3000/dashboard", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect } from '../../fixtures/test-fixtures';
  2   | import { DashboardPage } from '../../pages/dashboard-pages';
  3   | import { PageHelper, NavigationHelper } from '../../helpers/utilities';
  4   | 
  5   | test.describe('Navigation Tests', () => {
  6   |   let dashboardPage: DashboardPage;
  7   | 
  8   |   test.beforeEach(async ({ page }) => {
  9   |     dashboardPage = new DashboardPage(page);
  10  |   });
  11  | 
  12  |   test.describe('Sidebar Navigation', () => {
  13  |     test('should display sidebar on dashboard', async ({ page }) => {
  14  |       await dashboardPage.navigate();
  15  |       const sidebarVisible = await dashboardPage.isSidebarVisible();
  16  |       expect(sidebarVisible).toBeTruthy();
  17  |     });
  18  | 
  19  |     test('should have all menu items accessible', async ({ page, authenticatedPage }) => {
  20  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  21  |       await authenticatedPage.waitForLoadState('networkidle');
  22  |       
  23  |       const menuItems = await dashboardPage.getMenuItems();
  24  |       expect(menuItems.length).toBeGreaterThan(0);
  25  |     });
  26  | 
  27  |     test('should navigate to dashboard home', async ({ page, authenticatedPage }) => {
> 28  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      |                               ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/dashboard
  29  |       await authenticatedPage.waitForLoadState('networkidle');
  30  |       
  31  |       const homeLink = authenticatedPage.locator('a[href="/dashboard"], nav a:has-text("Dashboard")').first();
  32  |       if (await homeLink.isVisible()) {
  33  |         await homeLink.click();
  34  |         await authenticatedPage.waitForLoadState('networkidle');
  35  |         expect(authenticatedPage.url()).toContain('/dashboard');
  36  |       }
  37  |     });
  38  | 
  39  |     test('should navigate to problems page', async ({ page, authenticatedPage }) => {
  40  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
  41  |       await authenticatedPage.waitForLoadState('networkidle');
  42  |       expect(authenticatedPage.url()).toContain('/problems');
  43  |     });
  44  | 
  45  |     test('should navigate to challenges page', async ({ page, authenticatedPage }) => {
  46  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/challenges`);
  47  |       await authenticatedPage.waitForLoadState('networkidle');
  48  |       expect(authenticatedPage.url()).toContain('/challenges');
  49  |     });
  50  | 
  51  |     test('should navigate to leaderboard', async ({ page, authenticatedPage }) => {
  52  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/leaderboard`);
  53  |       await authenticatedPage.waitForLoadState('networkidle');
  54  |       expect(authenticatedPage.url()).toContain('/leaderboard');
  55  |     });
  56  | 
  57  |     test('should navigate to achievements', async ({ page, authenticatedPage }) => {
  58  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/achievements`);
  59  |       await authenticatedPage.waitForLoadState('networkidle');
  60  |       expect(authenticatedPage.url()).toContain('/achievements');
  61  |     });
  62  | 
  63  |     test('should navigate to profile', async ({ page, authenticatedPage }) => {
  64  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/profile`);
  65  |       await authenticatedPage.waitForLoadState('networkidle');
  66  |       expect(authenticatedPage.url()).toContain('/profile');
  67  |     });
  68  | 
  69  |     test('should navigate to settings', async ({ page, authenticatedPage }) => {
  70  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/settings`);
  71  |       await authenticatedPage.waitForLoadState('networkidle');
  72  |       expect(authenticatedPage.url()).toContain('/settings');
  73  |     });
  74  | 
  75  |     test('should navigate to notifications', async ({ page, authenticatedPage }) => {
  76  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/notifications`);
  77  |       await authenticatedPage.waitForLoadState('networkidle');
  78  |       expect(authenticatedPage.url()).toContain('/notifications');
  79  |     });
  80  | 
  81  |     test('should navigate to billing', async ({ page, authenticatedPage }) => {
  82  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/billing`);
  83  |       await authenticatedPage.waitForLoadState('networkidle');
  84  |       expect(authenticatedPage.url()).toContain('/billing');
  85  |     });
  86  |   });
  87  | 
  88  |   test.describe('Breadcrumbs', () => {
  89  |     test('should display breadcrumbs on inner pages', async ({ page, authenticatedPage }) => {
  90  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
  91  |       await authenticatedPage.waitForLoadState('networkidle');
  92  |       
  93  |       const breadcrumbs = authenticatedPage.locator('[class*="breadcrumb"], [class*="Breadcrumb"], nav[aria-label*="breadcrumb"]');
  94  |       const hasBreadcrumbs = await breadcrumbs.count() > 0;
  95  |       expect(hasBreadcrumbs).toBeTruthy();
  96  |     });
  97  | 
  98  |     test('should have working breadcrumb links', async ({ page, authenticatedPage }) => {
  99  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
  100 |       await authenticatedPage.waitForLoadState('networkidle');
  101 |       
  102 |       const breadcrumbLinks = authenticatedPage.locator('[class*="breadcrumb"] a, [class*="Breadcrumb"] a');
  103 |       const count = await breadcrumbLinks.count();
  104 |       
  105 |       for (let i = 0; i < Math.min(count, 3); i++) {
  106 |         const link = breadcrumbLinks.nth(i);
  107 |         const href = await link.getAttribute('href');
  108 |         if (href && !href.startsWith('#') && href !== '#') {
  109 |           await link.click();
  110 |           await authenticatedPage.waitForLoadState('networkidle');
  111 |           break;
  112 |         }
  113 |       }
  114 |     });
  115 |   });
  116 | 
  117 |   test.describe('Internal Links', () => {
  118 |     test('should have no broken internal links', async ({ page, authenticatedPage }) => {
  119 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  120 |       await authenticatedPage.waitForLoadState('networkidle');
  121 |       
  122 |       const links = await PageHelper.getAllLinks(authenticatedPage);
  123 |       const brokenLinks: string[] = [];
  124 |       
  125 |       for (const link of links.slice(0, 20)) {
  126 |         if (link.startsWith('/') || link.includes('localhost')) {
  127 |           try {
  128 |             const response = await authenticatedPage.request.get(link.startsWith('/') ? `${process.env.BASE_URL || 'http://localhost:3000'}${link}` : link);
```