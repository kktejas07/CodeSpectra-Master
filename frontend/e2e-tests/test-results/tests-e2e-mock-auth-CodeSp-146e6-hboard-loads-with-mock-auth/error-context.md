# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/e2e-mock-auth.spec.ts >> CodeSpectra E2E with Mock Auth >> 4. Dashboard loads with mock auth
- Location: tests/e2e-mock-auth.spec.ts:157:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/dashboard
Call log:
  - navigating to "http://localhost:3000/dashboard", waiting until "networkidle"

```

# Test source

```ts
  58  |     await page.route('**/api/auth/signup', async (route) => {
  59  |       await route.fulfill({
  60  |         status: 200,
  61  |         contentType: 'application/json',
  62  |         body: JSON.stringify({
  63  |           user: { id: MOCK_USER.uid, email: MOCK_USER.email, name: MOCK_USER.fullName },
  64  |         }),
  65  |       });
  66  |     });
  67  | 
  68  |     await page.route('**/api/problems*', async (route) => {
  69  |       await route.fulfill({
  70  |         status: 200,
  71  |         contentType: 'application/json',
  72  |         body: JSON.stringify({ problems: [], total: 0 }),
  73  |       });
  74  |     });
  75  | 
  76  |     // Mock dashboard data endpoints
  77  |     await page.route('**/api/dashboard*', async (route) => {
  78  |       await route.fulfill({
  79  |         status: 200,
  80  |         contentType: 'application/json',
  81  |         body: JSON.stringify({ stats: {}, recentActivity: [] }),
  82  |       });
  83  |     });
  84  | 
  85  |     console.log('✅ Mock auth configured');
  86  |   });
  87  | 
  88  |   test.afterAll(async () => {
  89  |     await browser.close();
  90  |   });
  91  | 
  92  |   test.afterEach(async () => {
  93  |     await page.screenshot({ path: `../screenshots/e2e_after_test.png`, fullPage: true }).catch(() => {});
  94  |   });
  95  | 
  96  |   // ==========================================
  97  |   // PUBLIC PAGES
  98  |   // ==========================================
  99  |   test('1. Landing page loads correctly', async () => {
  100 |     await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  101 |     await page.waitForTimeout(2000);
  102 | 
  103 |     const title = await page.title();
  104 |     expect(title).toContain('CodeSpectra');
  105 | 
  106 |     const h1 = await page.locator('h1').first().textContent();
  107 |     expect(h1).toBeTruthy();
  108 | 
  109 |     // Check for main CTA
  110 |     const ctaButtons = await page.locator('button:has-text("Start"), button:has-text("Get Started")').count();
  111 |     console.log(`  CTA buttons found: ${ctaButtons}`);
  112 | 
  113 |     console.log(`  ✅ Landing page: "${title}"`);
  114 |   });
  115 | 
  116 |   test('2. Auth pages render correctly', async () => {
  117 |     // Login page
  118 |     await page.goto('http://localhost:3000/auth/login', { waitUntil: 'networkidle' });
  119 |     await page.waitForTimeout(2000);
  120 |     expect(await page.locator('#email').isVisible()).toBeTruthy();
  121 |     expect(await page.locator('#password').isVisible()).toBeTruthy();
  122 |     console.log('  Login page: ✅');
  123 | 
  124 |     // Signup page
  125 |     await page.goto('http://localhost:3000/auth/signup', { waitUntil: 'networkidle' });
  126 |     await page.waitForTimeout(2000);
  127 |     expect(await page.locator('#name').isVisible()).toBeTruthy();
  128 |     expect(await page.locator('#email').isVisible()).toBeTruthy();
  129 |     expect(await page.locator('#password').isVisible()).toBeTruthy();
  130 |     console.log('  Signup page: ✅');
  131 | 
  132 |     // Forgot password page
  133 |     await page.goto('http://localhost:3000/auth/forgot-password', { waitUntil: 'networkidle' });
  134 |     await page.waitForTimeout(2000);
  135 |     expect(await page.locator('#email').isVisible()).toBeTruthy();
  136 |     console.log('  Forgot password page: ✅');
  137 |   });
  138 | 
  139 |   test('3. Auth form validation works', async () => {
  140 |     await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
  141 |     await page.waitForTimeout(3000);
  142 | 
  143 |     // Test empty form submission
  144 |     await page.locator('button[type="submit"]').click();
  145 |     await page.waitForTimeout(500);
  146 | 
  147 |     // Test invalid email
  148 |     await page.locator('#email').fill('invalid-email');
  149 |     await page.locator('#password').fill('password');
  150 |     const isValid = await page.locator('#email').evaluate(el => el.checkValidity());
  151 |     console.log(`  Email validation: ${isValid ? 'WORKING' : 'NOT WORKING'}`);
  152 |   });
  153 | 
  154 |   // ==========================================
  155 |   // DASHBOARD (AUTHENTICATED)
  156 |   // ==========================================
  157 |   test('4. Dashboard loads with mock auth', async () => {
> 158 |     await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
      |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/dashboard
  159 |     await page.waitForTimeout(3000);
  160 | 
  161 |     // Should show dashboard, not redirect to login
  162 |     const url = page.url();
  163 |     console.log(`  Dashboard URL: ${url}`);
  164 | 
  165 |     // Check for dashboard elements
  166 |     await page.waitForTimeout(2000);
  167 |     const sidebar = await page.locator('aside, nav, [class*="sidebar"]').first().isVisible().catch(() => false);
  168 |     const mainContent = await page.locator('main, [class*="content"], [class*="dashboard"]').first().isVisible().catch(() => false);
  169 | 
  170 |     console.log(`  Sidebar: ${sidebar ? 'VISIBLE' : 'NOT FOUND'}`);
  171 |     console.log(`  Main content: ${mainContent ? 'VISIBLE' : 'NOT FOUND'}`);
  172 |     console.log(`  URL contains /dashboard: ${url.includes('/dashboard')}`);
  173 |   });
  174 | 
  175 |   test('5. Dashboard navigation works', async () => {
  176 |     await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  177 |     await page.waitForTimeout(3000);
  178 | 
  179 |     // Look for any navigation links
  180 |     const navLinks = await page.locator('a[href*="/dashboard"], nav a').all();
  181 |     console.log(`  Dashboard nav links: ${navLinks.length}`);
  182 | 
  183 |     // Check for user menu/profile
  184 |     const userMenu = await page.locator('[class*="user"], [class*="profile"], button:has-text("User")').first().isVisible().catch(() => false);
  185 |     console.log(`  User menu: ${userMenu ? 'VISIBLE' : 'NOT FOUND'}`);
  186 |   });
  187 | 
  188 |   // ==========================================
  189 |   // PROBLEMS PAGE
  190 |   // ==========================================
  191 |   test('6. Problems page loads', async () => {
  192 |     await page.goto('http://localhost:3000/dashboard/problems', { waitUntil: 'networkidle' });
  193 |     await page.waitForTimeout(3000);
  194 | 
  195 |     const url = page.url();
  196 |     console.log(`  Problems URL: ${url}`);
  197 | 
  198 |     // Check for problem-related content
  199 |     const pageContent = await page.locator('body').textContent();
  200 |     const hasProblems = pageContent && (
  201 |       pageContent.toLowerCase().includes('problem') ||
  202 |       pageContent.toLowerCase().includes('challenge') ||
  203 |       pageContent.toLowerCase().includes('coding')
  204 |     );
  205 |     console.log(`  Has problem content: ${hasProblems ? 'YES' : 'NO'}`);
  206 |   });
  207 | 
  208 |   // ==========================================
  209 |   // SUBMISSIONS PAGE
  210 |   // ==========================================
  211 |   test('7. Submissions page loads', async () => {
  212 |     await page.goto('http://localhost:3000/dashboard/submissions', { waitUntil: 'networkidle' });
  213 |     await page.waitForTimeout(3000);
  214 | 
  215 |     const url = page.url();
  216 |     console.log(`  Submissions URL: ${url}`);
  217 | 
  218 |     const pageContent = await page.locator('body').textContent();
  219 |     const hasContent = pageContent && pageContent.length > 100;
  220 |     console.log(`  Has content: ${hasContent ? 'YES' : 'NO'}`);
  221 |   });
  222 | 
  223 |   // ==========================================
  224 |   // LEADERBOARD PAGE
  225 |   // ==========================================
  226 |   test('8. Leaderboard page loads', async () => {
  227 |     await page.goto('http://localhost:3000/dashboard/leaderboard', { waitUntil: 'networkidle' });
  228 |     await page.waitForTimeout(3000);
  229 | 
  230 |     const url = page.url();
  231 |     console.log(`  Leaderboard URL: ${url}`);
  232 | 
  233 |     const pageContent = await page.locator('body').textContent();
  234 |     const hasLeaderboard = pageContent && (
  235 |       pageContent.toLowerCase().includes('rank') ||
  236 |       pageContent.toLowerCase().includes('leaderboard') ||
  237 |       pageContent.toLowerCase().includes('score')
  238 |     );
  239 |     console.log(`  Has leaderboard content: ${hasLeaderboard ? 'YES' : 'NO'}`);
  240 |   });
  241 | 
  242 |   // ==========================================
  243 |   // SETTINGS PAGE
  244 |   // ==========================================
  245 |   test('9. Settings page loads', async () => {
  246 |     await page.goto('http://localhost:3000/dashboard/settings', { waitUntil: 'networkidle' });
  247 |     await page.waitForTimeout(3000);
  248 | 
  249 |     const url = page.url();
  250 |     console.log(`  Settings URL: ${url}`);
  251 | 
  252 |     const pageContent = await page.locator('body').textContent();
  253 |     const hasSettings = pageContent && (
  254 |       pageContent.toLowerCase().includes('setting') ||
  255 |       pageContent.toLowerCase().includes('profile') ||
  256 |       pageContent.toLowerCase().includes('account')
  257 |     );
  258 |     console.log(`  Has settings content: ${hasSettings ? 'YES' : 'NO'}`);
```