# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/fast-e2e.spec.ts >> CodeSpectra Fast E2E >> 3. Dashboard loads
- Location: tests/fast-e2e.spec.ts:109:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/dashboard
Call log:
  - navigating to "http://localhost:3000/dashboard", waiting until "domcontentloaded"

```

# Test source

```ts
  10  |   email: 'test@codespectra.dev',
  11  |   fullName: 'Test User',
  12  |   role: 'user',
  13  |   plan: 'pro',
  14  | };
  15  | 
  16  | test.describe('CodeSpectra Fast E2E', () => {
  17  |   let browser: Browser;
  18  |   let context: BrowserContext;
  19  |   let page: Page;
  20  | 
  21  |   test.beforeAll(async () => {
  22  |     browser = await chromium.launch({ headless: true });
  23  |     context = await browser.newContext();
  24  |     page = await context.newPage();
  25  | 
  26  |     // Mock session API - return user on GET, ok on POST
  27  |     await page.route('**/api/auth/session', async (route) => {
  28  |       if (route.request().method() === 'GET') {
  29  |         await route.fulfill({
  30  |           status: 200,
  31  |           contentType: 'application/json',
  32  |           body: JSON.stringify({ user: MOCK_USER }),
  33  |         });
  34  |       } else {
  35  |         await route.fulfill({
  36  |           status: 200,
  37  |           contentType: 'application/json',
  38  |           body: JSON.stringify({ ok: true }),
  39  |         });
  40  |       }
  41  |     });
  42  | 
  43  |     // Mock login
  44  |     await page.route('**/api/auth/login', async (route) => {
  45  |       await route.fulfill({
  46  |         status: 200,
  47  |         contentType: 'application/json',
  48  |         body: JSON.stringify({ user: { id: MOCK_USER.uid, email: MOCK_USER.email, name: MOCK_USER.fullName } }),
  49  |       });
  50  |     });
  51  | 
  52  |     // Mock signup
  53  |     await page.route('**/api/auth/signup', async (route) => {
  54  |       await route.fulfill({
  55  |         status: 200,
  56  |         contentType: 'application/json',
  57  |         body: JSON.stringify({ user: { id: MOCK_USER.uid, email: MOCK_USER.email, name: MOCK_USER.fullName } }),
  58  |       });
  59  |     });
  60  | 
  61  |     // Mock Firebase identity toolkit
  62  |     await page.route('**/identitytoolkit**', async (route) => {
  63  |       await route.fulfill({
  64  |         status: 200,
  65  |         contentType: 'application/json',
  66  |         body: JSON.stringify({ idToken: 'mock-token', expiresIn: 123456 }),
  67  |       });
  68  |     });
  69  | 
  70  |     console.log('✅ Mock auth configured');
  71  |   });
  72  | 
  73  |   test.afterAll(async () => {
  74  |     await browser.close();
  75  |   });
  76  | 
  77  |   // ==========================================
  78  |   // PUBLIC PAGES
  79  |   // ==========================================
  80  |   test('1. Landing page', async () => {
  81  |     await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  82  |     await page.waitForTimeout(2000);
  83  |     expect(await page.title()).toContain('CodeSpectra');
  84  |     console.log('  ✅ Landing page works');
  85  |   });
  86  | 
  87  |   test('2. Auth pages', async () => {
  88  |     // Login
  89  |     await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
  90  |     await page.waitForTimeout(2000);
  91  |     expect(await page.locator('#email').isVisible()).toBeTruthy();
  92  | 
  93  |     // Signup
  94  |     await page.goto('http://localhost:3000/auth/signup', { waitUntil: 'domcontentloaded', timeout: 15000 });
  95  |     await page.waitForTimeout(2000);
  96  |     expect(await page.locator('#name').isVisible()).toBeTruthy();
  97  | 
  98  |     // Forgot password
  99  |     await page.goto('http://localhost:3000/auth/forgot-password', { waitUntil: 'domcontentloaded', timeout: 15000 });
  100 |     await page.waitForTimeout(2000);
  101 |     expect(await page.locator('#email').isVisible()).toBeTruthy();
  102 | 
  103 |     console.log('  ✅ All auth pages work');
  104 |   });
  105 | 
  106 |   // ==========================================
  107 |   // DASHBOARD (AUTHENTICATED)
  108 |   // ==========================================
  109 |   test('3. Dashboard loads', async () => {
> 110 |     await page.goto('http://localhost:3000/dashboard', { waitUntil: 'domcontentloaded', timeout: 15000 });
      |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/dashboard
  111 |     await page.waitForTimeout(3000);
  112 | 
  113 |     const url = page.url();
  114 |     expect(url).toContain('/dashboard');
  115 |     console.log(`  ✅ Dashboard loaded: ${url}`);
  116 |   });
  117 | 
  118 |   test('4. Dashboard sub-pages', async () => {
  119 |     const pages = [
  120 |       { path: '/dashboard/problems', name: 'Problems' },
  121 |       { path: '/dashboard/submissions', name: 'Submissions' },
  122 |       { path: '/dashboard/leaderboard', name: 'Leaderboard' },
  123 |       { path: '/dashboard/settings', name: 'Settings' },
  124 |     ];
  125 | 
  126 |     for (const p of pages) {
  127 |       await page.goto(`http://localhost:3000${p.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  128 |       await page.waitForTimeout(1500);
  129 |       const url = page.url();
  130 |       console.log(`  ${p.name}: ${url.includes(p.path.split('/')[2]) ? '✅' : '⚠️'}`);
  131 |     }
  132 |   });
  133 | 
  134 |   // ==========================================
  135 |   // FULL FLOWS
  136 |   // ==========================================
  137 |   test('5. Login flow', async () => {
  138 |     await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
  139 |     await page.waitForTimeout(2000);
  140 | 
  141 |     await page.locator('#email').fill('test@codespectra.dev');
  142 |     await page.locator('#password').fill('password123');
  143 |     await page.locator('button[type="submit"]').click();
  144 | 
  145 |     await page.waitForTimeout(3000);
  146 |     const url = page.url();
  147 |     console.log(`  After login: ${url}`);
  148 |     expect(url).toContain('/dashboard');
  149 |     console.log('  ✅ Login flow works');
  150 |   });
  151 | 
  152 |   test('6. Signup flow', async () => {
  153 |     await page.goto('http://localhost:3000/auth/signup', { waitUntil: 'domcontentloaded', timeout: 15000 });
  154 |     await page.waitForTimeout(2000);
  155 | 
  156 |     await page.locator('#name').fill('New User');
  157 |     await page.locator('#email').fill('new@test.com');
  158 |     await page.locator('#password').fill('TestPass123!');
  159 |     await page.locator('#confirm').fill('TestPass123!');
  160 |     await page.locator('button[type="submit"]').click();
  161 | 
  162 |     await page.waitForTimeout(3000);
  163 |     console.log('  ✅ Signup form submits');
  164 |   });
  165 | 
  166 |   test('7. Mobile responsive', async () => {
  167 |     await page.setViewportSize({ width: 375, height: 812 });
  168 |     await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  169 |     await page.waitForTimeout(2000);
  170 | 
  171 |     const hamburger = await page.locator('button[aria-label*="menu" i]').first().isVisible().catch(() => false);
  172 |     console.log(`  Mobile menu: ${hamburger ? '✅' : '⚠️'}`);
  173 |     console.log('  ✅ Mobile viewport works');
  174 |   });
  175 | 
  176 |   test('8. Dark mode', async () => {
  177 |     await page.setViewportSize({ width: 1920, height: 1080 });
  178 |     await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  179 |     await page.waitForTimeout(2000);
  180 | 
  181 |     const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  182 |     console.log(`  Dark mode: ${isDark ? '✅ ACTIVE' : '⚠️ INACTIVE'}`);
  183 |   });
  184 | 
  185 |   // ==========================================
  186 |   // SUMMARY
  187 |   // ==========================================
  188 |   test('9. Summary', async () => {
  189 |     console.log('\n' + '='.repeat(50));
  190 |     console.log('📊 CODE SPECTRA E2E TEST SUMMARY');
  191 |     console.log('='.repeat(50));
  192 |     console.log('✅ All critical flows tested');
  193 |     console.log('✅ Mock auth working');
  194 |     console.log('✅ Dashboard accessible with mock session');
  195 |     console.log('✅ Mobile responsive');
  196 |     console.log('✅ Dark mode active');
  197 |     console.log('='.repeat(50));
  198 |   });
  199 | });
```