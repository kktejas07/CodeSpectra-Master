# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/auth/auth.spec.ts >> Authentication Tests >> Login >> should display login form correctly
- Location: tests/auth/auth.spec.ts:17:9

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('input[name="email"], input[type="email"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('input[name="email"], input[type="email"]')

```

```yaml
- alert
```

# Test source

```ts
  1   | import { test, expect } from '../../fixtures/test-fixtures';
  2   | import { LoginPage, SignupPage, ForgotPasswordPage, ResetPasswordPage, LogoutPage } from '../../pages/auth-pages';
  3   | import { DataGenerator, ValidationHelper } from '../../helpers/utilities';
  4   | 
  5   | test.describe('Authentication Tests', () => {
  6   |   let loginPage: LoginPage;
  7   |   let signupPage: SignupPage;
  8   |   let forgotPasswordPage: ForgotPasswordPage;
  9   | 
  10  |   test.beforeEach(async ({ page }) => {
  11  |     loginPage = new LoginPage(page);
  12  |     signupPage = new SignupPage(page);
  13  |     forgotPasswordPage = new ForgotPasswordPage(page);
  14  |   });
  15  | 
  16  |   test.describe('Login', () => {
  17  |     test('should display login form correctly', async ({ page }) => {
  18  |       await loginPage.navigate();
  19  |       
> 20  |       await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
      |                                                                              ^ Error: expect(locator).toBeVisible() failed
  21  |       await expect(page.locator('input[name="password"], input[type="password"]')).toBeVisible();
  22  |       await expect(page.locator('button[type="submit"]')).toBeVisible();
  23  |     });
  24  | 
  25  |     test('should login with valid credentials', async ({ page }) => {
  26  |       await loginPage.login('test@codespectra.io', 'Test@123456');
  27  |       await page.waitForLoadState('networkidle');
  28  |       
  29  |       const currentUrl = page.url();
  30  |       expect(currentUrl).not.toContain('/login');
  31  |     });
  32  | 
  33  |     test('should fail login with invalid credentials', async ({ page }) => {
  34  |       await loginPage.navigate();
  35  |       await loginPage.emailInput.fill('invalid@test.com');
  36  |       await loginPage.passwordInput.fill('wrongpassword');
  37  |       await loginPage.submitButton.click();
  38  |       
  39  |       await page.waitForTimeout(1000);
  40  |       const errorVisible = await loginPage.errorMessage.isVisible().catch(() => false);
  41  |       expect(errorVisible || page.url().includes('/login')).toBeTruthy();
  42  |     });
  43  | 
  44  |     test('should fail login with empty email', async ({ page }) => {
  45  |       await loginPage.navigate();
  46  |       await loginPage.passwordInput.fill('Test@123456');
  47  |       await loginPage.submitButton.click();
  48  |       
  49  |       await expect(page.locator('input[name="email"], input[type="email"]')).toBeInvalid();
  50  |     });
  51  | 
  52  |     test('should fail login with empty password', async ({ page }) => {
  53  |       await loginPage.navigate();
  54  |       await loginPage.emailInput.fill('test@codespectra.io');
  55  |       await loginPage.submitButton.click();
  56  |       
  57  |       await expect(page.locator('input[name="password"], input[type="password"]')).toBeInvalid();
  58  |     });
  59  | 
  60  |     test('should fail login with invalid email format', async ({ page }) => {
  61  |       await loginPage.navigate();
  62  |       await loginPage.emailInput.fill('notanemail');
  63  |       await loginPage.passwordInput.fill('Test@123456');
  64  |       await loginPage.submitButton.click();
  65  |       
  66  |       await page.waitForTimeout(500);
  67  |       expect(ValidationHelper.isValidEmail('notanemail')).toBe(false);
  68  |     });
  69  | 
  70  |     test('should show remember me checkbox', async ({ page }) => {
  71  |       await loginPage.navigate();
  72  |       const rememberMe = page.locator('input[name="remember"], input[type="checkbox"]');
  73  |       await expect(rememberMe).toBeVisible();
  74  |     });
  75  | 
  76  |     test('should have forgot password link', async ({ page }) => {
  77  |       await loginPage.navigate();
  78  |       await expect(loginPage.forgotPasswordLink).toBeVisible();
  79  |     });
  80  | 
  81  |     test('should navigate to forgot password page', async ({ page }) => {
  82  |       await loginPage.navigate();
  83  |       await loginPage.forgotPasswordLink.click();
  84  |       await page.waitForLoadState('networkidle');
  85  |       expect(page.url()).toContain('/forgot');
  86  |     });
  87  | 
  88  |     test('should have signup link', async ({ page }) => {
  89  |       await loginPage.navigate();
  90  |       await expect(loginPage.signupLink).toBeVisible();
  91  |     });
  92  | 
  93  |     test('should navigate to signup page', async ({ page }) => {
  94  |       await loginPage.navigate();
  95  |       await loginPage.signupLink.click();
  96  |       await page.waitForLoadState('networkidle');
  97  |       expect(page.url()).toContain('/signup');
  98  |     });
  99  | 
  100 |     test('should login with remember me checked', async ({ page }) => {
  101 |       await loginPage.navigate();
  102 |       await loginPage.emailInput.fill('test@codespectra.io');
  103 |       await loginPage.passwordInput.fill('Test@123456');
  104 |       await loginPage.rememberMeCheckbox.check();
  105 |       await loginPage.submitButton.click();
  106 |       
  107 |       await page.waitForLoadState('networkidle');
  108 |       expect(page.url()).not.toContain('/login');
  109 |     });
  110 |   });
  111 | 
  112 |   test.describe('Signup/Registration', () => {
  113 |     test('should display signup form correctly', async ({ page }) => {
  114 |       await signupPage.navigate();
  115 |       
  116 |       await expect(page.locator('input[name="name"]')).toBeVisible();
  117 |       await expect(page.locator('input[name="email"]')).toBeVisible();
  118 |       await expect(page.locator('input[name="password"]')).toBeVisible();
  119 |       await expect(page.locator('button[type="submit"]')).toBeVisible();
  120 |     });
```