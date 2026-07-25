# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/auth/auth.spec.ts >> Authentication Tests >> Signup/Registration >> should signup with valid data
- Location: tests/auth/auth.spec.ts:122:9

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('input[name="name"], input[id="name"], input[placeholder*="name" i]')

```

# Test source

```ts
  1   | import { Page, Locator } from '@playwright/test';
  2   | import { BasePage } from './base-page';
  3   | 
  4   | export class LoginPage extends BasePage {
  5   |   readonly emailInput: Locator;
  6   |   readonly passwordInput: Locator;
  7   |   readonly submitButton: Locator;
  8   |   readonly forgotPasswordLink: Locator;
  9   |   readonly signupLink: Locator;
  10  |   readonly rememberMeCheckbox: Locator;
  11  |   readonly errorMessage: Locator;
  12  |   readonly successMessage: Locator;
  13  | 
  14  |   constructor(page: Page) {
  15  |     super(page, '/login');
  16  |     this.emailInput = page.locator('input[name="email"], input[type="email"]');
  17  |     this.passwordInput = page.locator('input[name="password"], input[type="password"]');
  18  |     this.submitButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
  19  |     this.forgotPasswordLink = page.locator('a:has-text("Forgot"), a[href*="forgot"]');
  20  |     this.signupLink = page.locator('a:has-text("Sign Up"), a[href*="signup"]');
  21  |     this.rememberMeCheckbox = page.locator('input[name="remember"], input[type="checkbox"]');
  22  |     this.errorMessage = page.locator('[data-error], .error, [role="alert"]:has-text("error"), .text-red');
  23  |     this.successMessage = page.locator('.success, [role="status"]:has-text("success")');
  24  |   }
  25  | 
  26  |   async login(email: string, password: string, rememberMe = false): Promise<void> {
  27  |     await this.navigate();
  28  |     await this.emailInput.fill(email);
  29  |     await this.passwordInput.fill(password);
  30  |     if (rememberMe) {
  31  |       await this.rememberMeCheckbox.check();
  32  |     }
  33  |     await this.submitButton.click();
  34  |     await this.page.waitForLoadState('networkidle');
  35  |   }
  36  | 
  37  |   async getErrorMessage(): Promise<string> {
  38  |     return this.errorMessage.textContent() || '';
  39  |   }
  40  | 
  41  |   async isLoginSuccessful(): Promise<boolean> {
  42  |     const currentUrl = this.page.url();
  43  |     return !currentUrl.includes('/login');
  44  |   }
  45  | }
  46  | 
  47  | export class SignupPage extends BasePage {
  48  |   readonly nameInput: Locator;
  49  |   readonly emailInput: Locator;
  50  |   readonly passwordInput: Locator;
  51  |   readonly confirmPasswordInput: Locator;
  52  |   readonly submitButton: Locator;
  53  |   readonly loginLink: Locator;
  54  |   readonly termsCheckbox: Locator;
  55  |   readonly errorMessage: Locator;
  56  | 
  57  |   constructor(page: Page) {
  58  |     super(page, '/signup');
  59  |     this.nameInput = page.locator('input[name="name"], input[id="name"], input[placeholder*="name" i]');
  60  |     this.emailInput = page.locator('input[name="email"], input[type="email"]');
  61  |     this.passwordInput = page.locator('input[name="password"], input[type="password"]');
  62  |     this.confirmPasswordInput = page.locator('input[name="confirmPassword"], input[id="confirmPassword"], input[placeholder*="confirm" i]');
  63  |     this.submitButton = page.locator('button[type="submit"], button:has-text("Sign Up"), button:has-text("Register")');
  64  |     this.loginLink = page.locator('a:has-text("Login"), a[href*="login"]');
  65  |     this.termsCheckbox = page.locator('input[name="terms"], input[type="checkbox"]');
  66  |     this.errorMessage = page.locator('[data-error], .error, [role="alert"]');
  67  |   }
  68  | 
  69  |   async signup(name: string, email: string, password: string, acceptTerms = true): Promise<void> {
  70  |     await this.navigate();
> 71  |     await this.nameInput.fill(name);
      |                          ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  72  |     await this.emailInput.fill(email);
  73  |     await this.passwordInput.fill(password);
  74  |     await this.confirmPasswordInput.fill(password);
  75  |     if (acceptTerms && await this.termsCheckbox.isVisible()) {
  76  |       await this.termsCheckbox.check();
  77  |     }
  78  |     await this.submitButton.click();
  79  |     await this.page.waitForLoadState('networkidle');
  80  |   }
  81  | }
  82  | 
  83  | export class ForgotPasswordPage extends BasePage {
  84  |   readonly emailInput: Locator;
  85  |   readonly submitButton: Locator;
  86  |   readonly backToLoginLink: Locator;
  87  |   readonly successMessage: Locator;
  88  |   readonly errorMessage: Locator;
  89  | 
  90  |   constructor(page: Page) {
  91  |     super(page, '/auth/forgot-password');
  92  |     this.emailInput = page.locator('input[name="email"], input[type="email"]');
  93  |     this.submitButton = page.locator('button[type="submit"], button:has-text("Send"), button:has-text("Reset")');
  94  |     this.backToLoginLink = page.locator('a:has-text("Back to Login"), a[href*="login"]');
  95  |     this.successMessage = page.locator('.success, [role="status"], :has-text("sent"), :has-text("email sent")');
  96  |     this.errorMessage = page.locator('[data-error], .error, [role="alert"]');
  97  |   }
  98  | 
  99  |   async requestPasswordReset(email: string): Promise<void> {
  100 |     await this.navigate();
  101 |     await this.emailInput.fill(email);
  102 |     await this.submitButton.click();
  103 |     await this.page.waitForLoadState('networkidle');
  104 |   }
  105 | }
  106 | 
  107 | export class ResetPasswordPage extends BasePage {
  108 |   readonly passwordInput: Locator;
  109 |   readonly confirmPasswordInput: Locator;
  110 |   readonly submitButton: Locator;
  111 |   readonly successMessage: Locator;
  112 |   readonly errorMessage: Locator;
  113 | 
  114 |   constructor(page: Page) {
  115 |     super(page, '/auth/reset-password');
  116 |     this.passwordInput = page.locator('input[name="password"], input[type="password"]');
  117 |     this.confirmPasswordInput = page.locator('input[name="confirmPassword"], input[id="confirmPassword"]');
  118 |     this.submitButton = page.locator('button[type="submit"], button:has-text("Reset"), button:has-text("Update")');
  119 |     this.successMessage = page.locator('.success, [role="status"]');
  120 |     this.errorMessage = page.locator('[data-error], .error, [role="alert"]');
  121 |   }
  122 | 
  123 |   async resetPassword(password: string, confirmPassword?: string): Promise<void> {
  124 |     await this.passwordInput.fill(password);
  125 |     await (confirmPassword || this.confirmPasswordInput).fill(confirmPassword || password);
  126 |     await this.submitButton.click();
  127 |     await this.page.waitForLoadState('networkidle');
  128 |   }
  129 | }
  130 | 
  131 | export class LogoutPage extends BasePage {
  132 |   constructor(page: Page) {
  133 |     super(page, '/');
  134 |   }
  135 | 
  136 |   async logout(): Promise<void> {
  137 |     const logoutButton = this.page.locator('button:has-text("Logout"), button:has-text("Sign Out"), a[href*="logout"]').first();
  138 |     if (await logoutButton.isVisible()) {
  139 |       await logoutButton.click();
  140 |     } else {
  141 |       await this.page.goto(`${this.url}/api/auth/logout`);
  142 |     }
  143 |     await this.page.waitForLoadState('networkidle');
  144 |   }
  145 | }
```