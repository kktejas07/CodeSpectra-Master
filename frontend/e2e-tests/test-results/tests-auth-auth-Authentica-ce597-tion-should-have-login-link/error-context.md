# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/auth/auth.spec.ts >> Authentication Tests >> Signup/Registration >> should have login link
- Location: tests/auth/auth.spec.ts:194:9

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('a:has-text("Login"), a[href*="login"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('a:has-text("Login"), a[href*="login"]')

```

# Page snapshot

```yaml
- button "Open Next.js Dev Tools" [ref=e8] [cursor=pointer]:
  - generic [ref=e11]:
    - text: Compiling
    - generic [ref=e12]:
      - generic [ref=e13]: .
      - generic [ref=e14]: .
      - generic [ref=e15]: .
```

# Test source

```ts
  96  |     });
  97  | 
  98  |     test('should navigate to signup page', async ({ page }) => {
  99  |       await loginPage.navigate();
  100 |       await loginPage.signupLink.click();
  101 |       await page.waitForLoadState('networkidle');
  102 |       expect(page.url()).toContain('/signup');
  103 |     });
  104 | 
  105 |     test('should login with remember me checked', async ({ page }) => {
  106 |       await loginPage.navigate();
  107 |       await loginPage.emailInput.fill('admin@codespectra.io');
  108 |       await loginPage.passwordInput.fill('Admin@123456');
  109 |       await loginPage.rememberMeCheckbox.check();
  110 |       await loginPage.submitButton.click();
  111 |       
  112 |       await page.waitForLoadState('networkidle');
  113 |       expect(page.url()).not.toContain('/auth/login');
  114 |     });
  115 |   });
  116 | 
  117 |   test.describe('Signup/Registration', () => {
  118 |     test('should display signup form correctly', async ({ page }) => {
  119 |       await signupPage.navigate();
  120 |       
  121 |       await expect(page.locator('#name, input[id="name"], input[placeholder*="name" i]')).toBeVisible();
  122 |       await expect(page.locator('#email, input[name="email"], input[type="email"]')).toBeVisible();
  123 |       await expect(page.locator('#password, input[id="password"], input[type="password"]')).toBeVisible();
  124 |       await expect(page.locator('button[type="submit"]')).toBeVisible();
  125 |     });
  126 | 
  127 |     test('should signup with valid data', async ({ page }) => {
  128 |       const email = DataGenerator.randomEmail();
  129 |       await signupPage.signup('Test User', email, 'Test@123456', true);
  130 |       
  131 |       await page.waitForTimeout(2000);
  132 |       const url = page.url();
  133 |       expect(url).not.toContain('/signup') || url.includes('/verify');
  134 |     });
  135 | 
  136 |     test('should fail signup with existing email', async ({ page }) => {
  137 |       await signupPage.navigate();
  138 |       await signupPage.nameInput.fill('Test User');
  139 |       await signupPage.emailInput.fill('admin@codespectra.io');
  140 |       await signupPage.passwordInput.fill('Test@123456');
  141 |       await signupPage.confirmPasswordInput.fill('Test@123456');
  142 |       
  143 |       if (await signupPage.termsCheckbox.isVisible()) {
  144 |         await signupPage.termsCheckbox.check();
  145 |       }
  146 |       await signupPage.submitButton.click();
  147 |       
  148 |       await page.waitForTimeout(1000);
  149 |       const errorVisible = await signupPage.errorMessage.isVisible().catch(() => false);
  150 |       expect(errorVisible || page.url().includes('/signup')).toBeTruthy();
  151 |     });
  152 | 
  153 |     test('should fail signup with mismatched passwords', async ({ page }) => {
  154 |       await signupPage.navigate();
  155 |       await signupPage.nameInput.fill('Test User');
  156 |       await signupPage.emailInput.fill(DataGenerator.randomEmail());
  157 |       await signupPage.passwordInput.fill('Test@123456');
  158 |       await signupPage.confirmPasswordInput.fill('Different@123456');
  159 |       
  160 |       if (await signupPage.termsCheckbox.isVisible()) {
  161 |         await signupPage.termsCheckbox.check();
  162 |       }
  163 |       await signupPage.submitButton.click();
  164 |       
  165 |       const confirmInput = page.locator('#confirm, input[id="confirm"], input[placeholder*="confirm" i]');
  166 |       const isInvalid = await confirmInput.evaluate(el => el.checkValidity() === false);
  167 |       expect(isInvalid).toBe(true);
  168 |     });
  169 | 
  170 |     test('should fail signup with weak password', async ({ page }) => {
  171 |       await signupPage.navigate();
  172 |       await signupPage.nameInput.fill('Test User');
  173 |       await signupPage.emailInput.fill(DataGenerator.randomEmail());
  174 |       await signupPage.passwordInput.fill('123');
  175 |       await signupPage.confirmPasswordInput.fill('123');
  176 |       
  177 |       const passwordInput = page.locator('#password, input[id="password"], input[type="password"]');
  178 |       const isInvalid = await passwordInput.evaluate(el => el.checkValidity() === false);
  179 |       expect(isInvalid).toBe(true);
  180 |     });
  181 | 
  182 |     test('should fail signup with empty name', async ({ page }) => {
  183 |       await signupPage.navigate();
  184 |       await signupPage.emailInput.fill(DataGenerator.randomEmail());
  185 |       await signupPage.passwordInput.fill('Test@123456');
  186 |       await signupPage.confirmPasswordInput.fill('Test@123456');
  187 |       await signupPage.submitButton.click();
  188 |       
  189 |       const nameInput = page.locator('#name, input[id="name"], input[placeholder*="name" i]');
  190 |       const isInvalid = await nameInput.evaluate(el => el.checkValidity() === false);
  191 |       expect(isInvalid).toBe(true);
  192 |     });
  193 | 
  194 |     test('should have login link', async ({ page }) => {
  195 |       await signupPage.navigate();
> 196 |       await expect(signupPage.loginLink).toBeVisible();
      |                                          ^ Error: expect(locator).toBeVisible() failed
  197 |     });
  198 | 
  199 |     test('should navigate to login page', async ({ page }) => {
  200 |       await signupPage.navigate();
  201 |       await signupPage.loginLink.click();
  202 |       await page.waitForLoadState('networkidle');
  203 |       expect(page.url()).toContain('/login');
  204 |     });
  205 | 
  206 |     test('should fail signup without accepting terms', async ({ page }) => {
  207 |       await signupPage.navigate();
  208 |       await signupPage.nameInput.fill('Test User');
  209 |       await signupPage.emailInput.fill(DataGenerator.randomEmail());
  210 |       await signupPage.passwordInput.fill('Test@123456');
  211 |       await signupPage.confirmPasswordInput.fill('Test@123456');
  212 |       await signupPage.submitButton.click();
  213 |       
  214 |       const termsCheckbox = page.locator('#terms, input[name="terms"], input[type="checkbox"]').first();
  215 |       if (await termsCheckbox.isVisible()) {
  216 |         const isChecked = await termsCheckbox.isChecked();
  217 |         expect(isChecked).toBe(false);
  218 |       }
  219 |     });
  220 |   });
  221 | 
  222 |   test.describe('Forgot Password', () => {
  223 |     test('should display forgot password form', async ({ page }) => {
  224 |       await forgotPasswordPage.navigate();
  225 |       
  226 |       await expect(page.locator('#email, input[name="email"], input[type="email"]')).toBeVisible();
  227 |       await expect(page.locator('button[type="submit"]')).toBeVisible();
  228 |     });
  229 | 
  230 |     test('should submit forgot password request', async ({ page }) => {
  231 |       await forgotPasswordPage.navigate();
  232 |       await forgotPasswordPage.emailInput.fill('admin@codespectra.io');
  233 |       await forgotPasswordPage.submitButton.click();
  234 |       
  235 |       await page.waitForTimeout(2000);
  236 |       const url = page.url();
  237 |       const successShown = await forgotPasswordPage.successMessage.isVisible().catch(() => false);
  238 |       expect(successShown || !url.includes('/forgot')).toBeTruthy();
  239 |     });
  240 | 
  241 |     test('should show error for non-existent email', async ({ page }) => {
  242 |       await forgotPasswordPage.navigate();
  243 |       await forgotPasswordPage.emailInput.fill('nonexistent@test.com');
  244 |       await forgotPasswordPage.submitButton.click();
  245 |       
  246 |       await page.waitForTimeout(1000);
  247 |       const errorShown = await forgotPasswordPage.errorMessage.isVisible().catch(() => false);
  248 |       expect(errorShown).toBeTruthy();
  249 |     });
  250 | 
  251 |     test('should have back to login link', async ({ page }) => {
  252 |       await forgotPasswordPage.navigate();
  253 |       await expect(forgotPasswordPage.backToLoginLink).toBeVisible();
  254 |     });
  255 | 
  256 |     test('should navigate to login from back link', async ({ page }) => {
  257 |       await forgotPasswordPage.navigate();
  258 |       await forgotPasswordPage.backToLoginLink.click();
  259 |       await page.waitForLoadState('networkidle');
  260 |       expect(page.url()).toContain('/login');
  261 |     });
  262 |   });
  263 | 
  264 |   test.describe('Session Expiration', () => {
  265 |     test('should detect session timeout', async ({ page }) => {
  266 |       await loginPage.login('admin@codespectra.io', 'Admin@123456');
  267 |       await page.waitForLoadState('networkidle');
  268 |       
  269 |       await page.evaluate(() => {
  270 |         localStorage.clear();
  271 |         sessionStorage.clear();
  272 |       });
  273 |       
  274 |       await page.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  275 |       await page.waitForLoadState('networkidle');
  276 |       
  277 |       const url = page.url();
  278 |       if (url.includes('/dashboard')) {
  279 |         console.log('Session may still be valid or redirect not working');
  280 |       }
  281 |     });
  282 |   });
  283 | });
```