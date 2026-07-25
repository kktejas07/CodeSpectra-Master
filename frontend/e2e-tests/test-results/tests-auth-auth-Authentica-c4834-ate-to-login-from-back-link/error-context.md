# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/auth/auth.spec.ts >> Authentication Tests >> Forgot Password >> should navigate to login from back link
- Location: tests/auth/auth.spec.ts:249:9

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('a:has-text("Back to Login"), a[href*="login"]')
    - waiting for "http://localhost:3000/auth/forgot-password" navigation to finish...
    - navigated to "http://localhost:3000/auth/forgot-password"

```

# Test source

```ts
  151 |       await signupPage.emailInput.fill(DataGenerator.randomEmail());
  152 |       await signupPage.passwordInput.fill('Test@123456');
  153 |       await signupPage.confirmPasswordInput.fill('Different@123456');
  154 |       
  155 |       if (await signupPage.termsCheckbox.isVisible()) {
  156 |         await signupPage.termsCheckbox.check();
  157 |       }
  158 |       await signupPage.submitButton.click();
  159 |       
  160 |       await expect(page.locator('input[name="confirmPassword"], input[id="confirmPassword"]')).toBeInvalid();
  161 |     });
  162 | 
  163 |     test('should fail signup with weak password', async ({ page }) => {
  164 |       await signupPage.navigate();
  165 |       await signupPage.nameInput.fill('Test User');
  166 |       await signupPage.emailInput.fill(DataGenerator.randomEmail());
  167 |       await signupPage.passwordInput.fill('123');
  168 |       await signupPage.confirmPasswordInput.fill('123');
  169 |       
  170 |       if (await signupPage.termsCheckbox.isVisible()) {
  171 |         await signupPage.termsCheckbox.check();
  172 |       }
  173 |       await signupPage.submitButton.click();
  174 |       
  175 |       await expect(page.locator('input[name="password"]')).toBeInvalid();
  176 |     });
  177 | 
  178 |     test('should fail signup with empty name', async ({ page }) => {
  179 |       await signupPage.navigate();
  180 |       await signupPage.emailInput.fill(DataGenerator.randomEmail());
  181 |       await signupPage.passwordInput.fill('Test@123456');
  182 |       await signupPage.confirmPasswordInput.fill('Test@123456');
  183 |       await signupPage.submitButton.click();
  184 |       
  185 |       await expect(page.locator('input[name="name"]')).toBeInvalid();
  186 |     });
  187 | 
  188 |     test('should have login link', async ({ page }) => {
  189 |       await signupPage.navigate();
  190 |       await expect(signupPage.loginLink).toBeVisible();
  191 |     });
  192 | 
  193 |     test('should navigate to login page', async ({ page }) => {
  194 |       await signupPage.navigate();
  195 |       await signupPage.loginLink.click();
  196 |       await page.waitForLoadState('networkidle');
  197 |       expect(page.url()).toContain('/login');
  198 |     });
  199 | 
  200 |     test('should fail signup without accepting terms', async ({ page }) => {
  201 |       await signupPage.navigate();
  202 |       await signupPage.nameInput.fill('Test User');
  203 |       await signupPage.emailInput.fill(DataGenerator.randomEmail());
  204 |       await signupPage.passwordInput.fill('Test@123456');
  205 |       await signupPage.confirmPasswordInput.fill('Test@123456');
  206 |       await signupPage.submitButton.click();
  207 |       
  208 |       const termsCheckbox = page.locator('input[name="terms"], input[type="checkbox"]').first();
  209 |       if (await termsCheckbox.isVisible()) {
  210 |         await expect(termsCheckbox).toBeInvalid();
  211 |       }
  212 |     });
  213 |   });
  214 | 
  215 |   test.describe('Forgot Password', () => {
  216 |     test('should display forgot password form', async ({ page }) => {
  217 |       await forgotPasswordPage.navigate();
  218 |       
  219 |       await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
  220 |       await expect(page.locator('button[type="submit"]')).toBeVisible();
  221 |     });
  222 | 
  223 |     test('should submit forgot password request', async ({ page }) => {
  224 |       await forgotPasswordPage.navigate();
  225 |       await forgotPasswordPage.emailInput.fill('test@codespectra.io');
  226 |       await forgotPasswordPage.submitButton.click();
  227 |       
  228 |       await page.waitForTimeout(2000);
  229 |       const url = page.url();
  230 |       const successShown = await forgotPasswordPage.successMessage.isVisible().catch(() => false);
  231 |       expect(successShown || !url.includes('/forgot')).toBeTruthy();
  232 |     });
  233 | 
  234 |     test('should show error for non-existent email', async ({ page }) => {
  235 |       await forgotPasswordPage.navigate();
  236 |       await forgotPasswordPage.emailInput.fill('nonexistent@test.com');
  237 |       await forgotPasswordPage.submitButton.click();
  238 |       
  239 |       await page.waitForTimeout(1000);
  240 |       const errorShown = await forgotPasswordPage.errorMessage.isVisible().catch(() => false);
  241 |       expect(errorShown).toBeTruthy();
  242 |     });
  243 | 
  244 |     test('should have back to login link', async ({ page }) => {
  245 |       await forgotPasswordPage.navigate();
  246 |       await expect(forgotPasswordPage.backToLoginLink).toBeVisible();
  247 |     });
  248 | 
  249 |     test('should navigate to login from back link', async ({ page }) => {
  250 |       await forgotPasswordPage.navigate();
> 251 |       await forgotPasswordPage.backToLoginLink.click();
      |                                                ^ Error: locator.click: Test timeout of 30000ms exceeded.
  252 |       await page.waitForLoadState('networkidle');
  253 |       expect(page.url()).toContain('/login');
  254 |     });
  255 |   });
  256 | 
  257 |   test.describe('Session Expiration', () => {
  258 |     test('should detect session timeout', async ({ page }) => {
  259 |       await loginPage.login('test@codespectra.io', 'Test@123456');
  260 |       await page.waitForLoadState('networkidle');
  261 |       
  262 |       await page.evaluate(() => {
  263 |         localStorage.clear();
  264 |         sessionStorage.clear();
  265 |       });
  266 |       
  267 |       await page.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  268 |       await page.waitForLoadState('networkidle');
  269 |       
  270 |       const url = page.url();
  271 |       if (url.includes('/dashboard')) {
  272 |         console.log('Session may still be valid or redirect not working');
  273 |       }
  274 |     });
  275 |   });
  276 | });
```