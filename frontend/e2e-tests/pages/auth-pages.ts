import { Page, Locator } from '@playwright/test';
import { BasePage } from './base-page';

export class LoginPage extends BasePage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly forgotPasswordLink: Locator;
  readonly signupLink: Locator;
  readonly rememberMeCheckbox: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    super(page, '/login');
    this.emailInput = page.locator('input[name="email"], input[type="email"]');
    this.passwordInput = page.locator('input[name="password"], input[type="password"]');
    this.submitButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
    this.forgotPasswordLink = page.locator('a:has-text("Forgot"), a[href*="forgot"]');
    this.signupLink = page.locator('a:has-text("Sign Up"), a[href*="signup"]');
    this.rememberMeCheckbox = page.locator('input[name="remember"], input[type="checkbox"]');
    this.errorMessage = page.locator('[data-error], .error, [role="alert"]:has-text("error"), .text-red');
    this.successMessage = page.locator('.success, [role="status"]:has-text("success")');
  }

  async login(email: string, password: string, rememberMe = false): Promise<void> {
    await this.navigate();
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    if (rememberMe) {
      await this.rememberMeCheckbox.check();
    }
    await this.submitButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async getErrorMessage(): Promise<string> {
    return (await this.errorMessage.textContent()) || '';
  }

  async isLoginSuccessful(): Promise<boolean> {
    const currentUrl = this.page.url();
    return !currentUrl.includes('/login');
  }
}

export class SignupPage extends BasePage {
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;
  readonly loginLink: Locator;
  readonly termsCheckbox: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page, '/signup');
    this.nameInput = page.locator('input[name="name"], input[id="name"], input[placeholder*="name" i]');
    this.emailInput = page.locator('input[name="email"], input[type="email"]');
    this.passwordInput = page.locator('input[name="password"], input[type="password"]');
    this.confirmPasswordInput = page.locator('input[name="confirmPassword"], input[id="confirmPassword"], input[placeholder*="confirm" i]');
    this.submitButton = page.locator('button[type="submit"], button:has-text("Sign Up"), button:has-text("Register")');
    this.loginLink = page.locator('a:has-text("Login"), a[href*="login"]');
    this.termsCheckbox = page.locator('input[name="terms"], input[type="checkbox"]');
    this.errorMessage = page.locator('[data-error], .error, [role="alert"]');
  }

  async signup(name: string, email: string, password: string, acceptTerms = true): Promise<void> {
    await this.navigate();
    await this.nameInput.fill(name);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.confirmPasswordInput.fill(password);
    if (acceptTerms && await this.termsCheckbox.isVisible()) {
      await this.termsCheckbox.check();
    }
    await this.submitButton.click();
    await this.page.waitForLoadState('networkidle');
  }
}

export class ForgotPasswordPage extends BasePage {
  readonly emailInput: Locator;
  readonly submitButton: Locator;
  readonly backToLoginLink: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page, '/auth/forgot-password');
    this.emailInput = page.locator('input[name="email"], input[type="email"]');
    this.submitButton = page.locator('button[type="submit"], button:has-text("Send"), button:has-text("Reset")');
    this.backToLoginLink = page.locator('a:has-text("Back to Login"), a[href*="login"]');
    this.successMessage = page.locator('.success, [role="status"], :has-text("sent"), :has-text("email sent")');
    this.errorMessage = page.locator('[data-error], .error, [role="alert"]');
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.navigate();
    await this.emailInput.fill(email);
    await this.submitButton.click();
    await this.page.waitForLoadState('networkidle');
  }
}

export class ResetPasswordPage extends BasePage {
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page, '/auth/reset-password');
    this.passwordInput = page.locator('input[name="password"], input[type="password"]');
    this.confirmPasswordInput = page.locator('input[name="confirmPassword"], input[id="confirmPassword"]');
    this.submitButton = page.locator('button[type="submit"], button:has-text("Reset"), button:has-text("Update")');
    this.successMessage = page.locator('.success, [role="status"]');
    this.errorMessage = page.locator('[data-error], .error, [role="alert"]');
  }

  async resetPassword(password: string, confirmPassword?: string): Promise<void> {
    await this.passwordInput.fill(password);
    const cpw = confirmPassword || password;
    // @ts-expect-error - TypeScript resolves as string|Locator but this.confirmPasswordInput is always a Locator
    await (confirmPassword ? cpw : this.confirmPasswordInput).fill(cpw);
    await this.submitButton.click();
    await this.page.waitForLoadState('networkidle');
  }
}

export class LogoutPage extends BasePage {
  constructor(page: Page) {
    super(page, '/');
  }

  async logout(): Promise<void> {
    const logoutButton = this.page.locator('button:has-text("Logout"), button:has-text("Sign Out"), a[href*="logout"]').first();
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
    } else {
      await this.page.goto(`${this.url}/api/auth/logout`);
    }
    await this.page.waitForLoadState('networkidle');
  }
}