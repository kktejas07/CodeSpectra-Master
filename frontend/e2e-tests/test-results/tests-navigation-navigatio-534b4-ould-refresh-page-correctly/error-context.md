# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/navigation/navigation.spec.ts >> Navigation Tests >> Browser Back/Forward Navigation >> should refresh page correctly
- Location: tests/navigation/navigation.spec.ts:183:9

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
Call log:
  - navigating to "http://localhost:3000/dashboard", waiting until "load"

```

# Test source

```ts
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
  129 |             if (response.status() >= 400) {
  130 |               brokenLinks.push(`${link} - ${response.status()}`);
  131 |             }
  132 |           } catch (e) {
  133 |             brokenLinks.push(`${link} - Request failed`);
  134 |           }
  135 |         }
  136 |       }
  137 |       
  138 |       console.log('Broken links found:', brokenLinks.length);
  139 |       expect(brokenLinks.length).toBe(0);
  140 |     });
  141 | 
  142 |     test('should navigate through public pages', async ({ page }) => {
  143 |       const publicPages = ['/', '/about', '/features', '/pricing', '/blog'];
  144 |       
  145 |       for (const path of publicPages) {
  146 |         await page.goto(`${process.env.BASE_URL || 'http://localhost:3000'}${path}`);
  147 |         await page.waitForLoadState('networkidle');
  148 |         expect(page.url()).toContain(path === '/' ? 'localhost' : path.split('/')[1]);
  149 |       }
  150 |     });
  151 |   });
  152 | 
  153 |   test.describe('Browser Back/Forward Navigation', () => {
  154 |     test('should work with browser back button', async ({ page, authenticatedPage }) => {
  155 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  156 |       await authenticatedPage.waitForLoadState('networkidle');
  157 |       
  158 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
  159 |       await authenticatedPage.waitForLoadState('networkidle');
  160 |       
  161 |       await authenticatedPage.goBack();
  162 |       await authenticatedPage.waitForLoadState('networkidle');
  163 |       
  164 |       expect(authenticatedPage.url()).toContain('/dashboard');
  165 |     });
  166 | 
  167 |     test('should work with browser forward button', async ({ page, authenticatedPage }) => {
  168 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  169 |       await authenticatedPage.waitForLoadState('networkidle');
  170 |       
  171 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
  172 |       await authenticatedPage.waitForLoadState('networkidle');
  173 |       
  174 |       await authenticatedPage.goBack();
  175 |       await authenticatedPage.waitForLoadState('networkidle');
  176 |       
  177 |       await authenticatedPage.goForward();
  178 |       await authenticatedPage.waitForLoadState('networkidle');
  179 |       
  180 |       expect(authenticatedPage.url()).toContain('/problems');
  181 |     });
  182 | 
  183 |     test('should refresh page correctly', async ({ page, authenticatedPage }) => {
> 184 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      |                               ^ Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
  185 |       await authenticatedPage.waitForLoadState('networkidle');
  186 |       
  187 |       await authenticatedPage.reload();
  188 |       await authenticatedPage.waitForLoadState('networkidle');
  189 |       
  190 |       expect(authenticatedPage.url()).toContain('/dashboard');
  191 |     });
  192 |   });
  193 | 
  194 |   test.describe('Deep Linking', () => {
  195 |     test('should access direct URLs', async ({ page, authenticatedPage }) => {
  196 |       const directUrls = [
  197 |         '/dashboard',
  198 |         '/dashboard/problems',
  199 |         '/dashboard/challenges',
  200 |         '/dashboard/leaderboard',
  201 |         '/dashboard/achievements',
  202 |       ];
  203 |       
  204 |       for (const url of directUrls) {
  205 |         await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}${url}`);
  206 |         await authenticatedPage.waitForLoadState('networkidle');
  207 |         expect(authenticatedPage.url()).toContain(url.split('/').pop() || 'dashboard');
  208 |       }
  209 |     });
  210 |   });
  211 | 
  212 |   test.describe('Menu Items', () => {
  213 |     test('should show all navigation items on desktop', async ({ page, authenticatedPage }) => {
  214 |       await authenticatedPage.setViewportSize({ width: 1920, height: 1080 });
  215 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  216 |       await authenticatedPage.waitForLoadState('networkidle');
  217 |       
  218 |       const menuItems = await dashboardPage.getMenuItems();
  219 |       expect(menuItems.length).toBeGreaterThan(0);
  220 |     });
  221 | 
  222 |     test('should collapse menu on tablet', async ({ page, authenticatedPage }) => {
  223 |       await authenticatedPage.setViewportSize({ width: 768, height: 1024 });
  224 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  225 |       await authenticatedPage.waitForLoadState('networkidle');
  226 |       
  227 |       const menuButton = authenticatedPage.locator('button[aria-label*="menu" i], button:has-text("☰"), [class*="menu-button"]').first();
  228 |       const hasMenuButton = await menuButton.isVisible().catch(() => false);
  229 |       expect(hasMenuButton).toBeTruthy();
  230 |     });
  231 | 
  232 |     test('should show hamburger menu on mobile', async ({ page, authenticatedPage }) => {
  233 |       await authenticatedPage.setViewportSize({ width: 375, height: 812 });
  234 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  235 |       await authenticatedPage.waitForLoadState('networkidle');
  236 |       
  237 |       const menuButton = authenticatedPage.locator('button[aria-label*="menu" i], button:has-text("☰")').first();
  238 |       await expect(menuButton).toBeVisible();
  239 |     });
  240 |   });
  241 | });
```