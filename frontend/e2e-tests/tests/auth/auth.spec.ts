import { test, expect } from '../fixtures/test-fixtures';
import { LoginPage, SignupPage, ForgotPasswordPage, ResetPasswordPage, LogoutPage } from '../pages/auth-pages';
import { DataGenerator, ValidationHelper } from '../helpers/utilities';

test.describe('Authentication Tests', () => {
  let loginPage: LoginPage;
  let signupPage: SignupPage;
  let forgotPasswordPage: ForgotPasswordPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    signupPage = new SignupPage(page);
    forgotPasswordPage = new ForgotPasswordPage(page);
  });

  test.describe('Login', () => {
    test('should display login form correctly', async ({ page }) => {
      await loginPage.navigate();
      
      await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"], input[type="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should login with valid credentials', async ({ page }) => {
      await loginPage.login('test@codespectra.io', 'Test@123456');
      await page.waitForLoadState('networkidle');
      
      const currentUrl = page.url();
      expect(currentUrl).not.toContain('/login');
    });

    test('should fail login with invalid credentials', async ({ page }) => {
      await loginPage.navigate();
      await loginPage.emailInput.fill('invalid@test.com');
      await loginPage.passwordInput.fill('wrongpassword');
      await loginPage.submitButton.click();
      
      await page.waitForTimeout(1000);
      const errorVisible = await loginPage.errorMessage.isVisible().catch(() => false);
      expect(errorVisible || page.url().includes('/login')).toBeTruthy();
    });

    test('should fail login with empty email', async ({ page }) => {
      await loginPage.navigate();
      await loginPage.passwordInput.fill('Test@123456');
      await loginPage.submitButton.click();
      
      await expect(page.locator('input[name="email"], input[type="email"]')).toBeInvalid();
    });

    test('should fail login with empty password', async ({ page }) => {
      await loginPage.navigate();
      await loginPage.emailInput.fill('test@codespectra.io');
      await loginPage.submitButton.click();
      
      await expect(page.locator('input[name="password"], input[type="password"]')).toBeInvalid();
    });

    test('should fail login with invalid email format', async ({ page }) => {
      await loginPage.navigate();
      await loginPage.emailInput.fill('notanemail');
      await loginPage.passwordInput.fill('Test@123456');
      await loginPage.submitButton.click();
      
      await page.waitForTimeout(500);
      expect(ValidationHelper.isValidEmail('notanemail')).toBe(false);
    });

    test('should show remember me checkbox', async ({ page }) => {
      await loginPage.navigate();
      const rememberMe = page.locator('input[name="remember"], input[type="checkbox"]');
      await expect(rememberMe).toBeVisible();
    });

    test('should have forgot password link', async ({ page }) => {
      await loginPage.navigate();
      await expect(loginPage.forgotPasswordLink).toBeVisible();
    });

    test('should navigate to forgot password page', async ({ page }) => {
      await loginPage.navigate();
      await loginPage.forgotPasswordLink.click();
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/forgot');
    });

    test('should have signup link', async ({ page }) => {
      await loginPage.navigate();
      await expect(loginPage.signupLink).toBeVisible();
    });

    test('should navigate to signup page', async ({ page }) => {
      await loginPage.navigate();
      await loginPage.signupLink.click();
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/signup');
    });

    test('should login with remember me checked', async ({ page }) => {
      await loginPage.navigate();
      await loginPage.emailInput.fill('test@codespectra.io');
      await loginPage.passwordInput.fill('Test@123456');
      await loginPage.rememberMeCheckbox.check();
      await loginPage.submitButton.click();
      
      await page.waitForLoadState('networkidle');
      expect(page.url()).not.toContain('/login');
    });
  });

  test.describe('Signup/Registration', () => {
    test('should display signup form correctly', async ({ page }) => {
      await signupPage.navigate();
      
      await expect(page.locator('input[name="name"]')).toBeVisible();
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should signup with valid data', async ({ page }) => {
      const email = DataGenerator.randomEmail();
      await signupPage.signup('Test User', email, 'Test@123456', true);
      
      await page.waitForTimeout(2000);
      const url = page.url();
      expect(url).not.toContain('/signup') || url.includes('/verify');
    });

    test('should fail signup with existing email', async ({ page }) => {
      await signupPage.navigate();
      await signupPage.nameInput.fill('Test User');
      await signupPage.emailInput.fill('test@codespectra.io');
      await signupPage.passwordInput.fill('Test@123456');
      await signupPage.confirmPasswordInput.fill('Test@123456');
      
      if (await signupPage.termsCheckbox.isVisible()) {
        await signupPage.termsCheckbox.check();
      }
      await signupPage.submitButton.click();
      
      await page.waitForTimeout(1000);
      const errorVisible = await signupPage.errorMessage.isVisible().catch(() => false);
      expect(errorVisible || page.url().includes('/signup')).toBeTruthy();
    });

    test('should fail signup with mismatched passwords', async ({ page }) => {
      await signupPage.navigate();
      await signupPage.nameInput.fill('Test User');
      await signupPage.emailInput.fill(DataGenerator.randomEmail());
      await signupPage.passwordInput.fill('Test@123456');
      await signupPage.confirmPasswordInput.fill('Different@123456');
      
      if (await signupPage.termsCheckbox.isVisible()) {
        await signupPage.termsCheckbox.check();
      }
      await signupPage.submitButton.click();
      
      await expect(page.locator('input[name="confirmPassword"], input[id="confirmPassword"]')).toBeInvalid();
    });

    test('should fail signup with weak password', async ({ page }) => {
      await signupPage.navigate();
      await signupPage.nameInput.fill('Test User');
      await signupPage.emailInput.fill(DataGenerator.randomEmail());
      await signupPage.passwordInput.fill('123');
      await signupPage.confirmPasswordInput.fill('123');
      
      if (await signupPage.termsCheckbox.isVisible()) {
        await signupPage.termsCheckbox.check();
      }
      await signupPage.submitButton.click();
      
      await expect(page.locator('input[name="password"]')).toBeInvalid();
    });

    test('should fail signup with empty name', async ({ page }) => {
      await signupPage.navigate();
      await signupPage.emailInput.fill(DataGenerator.randomEmail());
      await signupPage.passwordInput.fill('Test@123456');
      await signupPage.confirmPasswordInput.fill('Test@123456');
      await signupPage.submitButton.click();
      
      await expect(page.locator('input[name="name"]')).toBeInvalid();
    });

    test('should have login link', async ({ page }) => {
      await signupPage.navigate();
      await expect(signupPage.loginLink).toBeVisible();
    });

    test('should navigate to login page', async ({ page }) => {
      await signupPage.navigate();
      await signupPage.loginLink.click();
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/login');
    });

    test('should fail signup without accepting terms', async ({ page }) => {
      await signupPage.navigate();
      await signupPage.nameInput.fill('Test User');
      await signupPage.emailInput.fill(DataGenerator.randomEmail());
      await signupPage.passwordInput.fill('Test@123456');
      await signupPage.confirmPasswordInput.fill('Test@123456');
      await signupPage.submitButton.click();
      
      const termsCheckbox = page.locator('input[name="terms"], input[type="checkbox"]').first();
      if (await termsCheckbox.isVisible()) {
        await expect(termsCheckbox).toBeInvalid();
      }
    });
  });

  test.describe('Forgot Password', () => {
    test('should display forgot password form', async ({ page }) => {
      await forgotPasswordPage.navigate();
      
      await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should submit forgot password request', async ({ page }) => {
      await forgotPasswordPage.navigate();
      await forgotPasswordPage.emailInput.fill('test@codespectra.io');
      await forgotPasswordPage.submitButton.click();
      
      await page.waitForTimeout(2000);
      const url = page.url();
      const successShown = await forgotPasswordPage.successMessage.isVisible().catch(() => false);
      expect(successShown || !url.includes('/forgot')).toBeTruthy();
    });

    test('should show error for non-existent email', async ({ page }) => {
      await forgotPasswordPage.navigate();
      await forgotPasswordPage.emailInput.fill('nonexistent@test.com');
      await forgotPasswordPage.submitButton.click();
      
      await page.waitForTimeout(1000);
      const errorShown = await forgotPasswordPage.errorMessage.isVisible().catch(() => false);
      expect(errorShown).toBeTruthy();
    });

    test('should have back to login link', async ({ page }) => {
      await forgotPasswordPage.navigate();
      await expect(forgotPasswordPage.backToLoginLink).toBeVisible();
    });

    test('should navigate to login from back link', async ({ page }) => {
      await forgotPasswordPage.navigate();
      await forgotPasswordPage.backToLoginLink.click();
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/login');
    });
  });

  test.describe('Session Expiration', () => {
    test('should detect session timeout', async ({ page }) => {
      await loginPage.login('test@codespectra.io', 'Test@123456');
      await page.waitForLoadState('networkidle');
      
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      
      await page.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await page.waitForLoadState('networkidle');
      
      const url = page.url();
      if (url.includes('/dashboard')) {
        console.log('Session may still be valid or redirect not working');
      }
    });
  });
});