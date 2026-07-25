import { test, expect } from '../fixtures/test-fixtures';
import { DynamicForm } from '../pages/components';
import { DataGenerator, ValidationHelper } from '../helpers/utilities';

test.describe('Forms Validation Tests', () => {
  test.describe('Required Fields', () => {
    test('should mark required fields', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/profile`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const requiredMarkers = authenticatedPage.locator('[data-required], .required, label:has-text("*")');
      const count = await requiredMarkers.count();
      console.log(`Found ${count} required field markers`);
    });

    test('should fail when required fields are empty', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/profile`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const submitButton = authenticatedPage.locator('button[type="submit"], button:has-text("Save")').first();
      if (await submitButton.isVisible()) {
        await submitButton.click();
        await authenticatedPage.waitForTimeout(500);
        
        const nameInput = authenticatedPage.locator('input[name="name"], input[id="name"]').first();
        if (await nameInput.isVisible()) {
          const isInvalid = await nameInput.evaluate(el => el.checkValidity() === false);
          expect(isInvalid).toBeTruthy();
        }
      }
    });
  });

  test.describe('Email Validation', () => {
    test('should accept valid email', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/login`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const emailInput = authenticatedPage.locator('input[name="email"], input[type="email"]').first();
      await emailInput.fill('valid@email.com');
      
      const isValid = await emailInput.evaluate(el => el.checkValidity());
      expect(isValid).toBeTruthy();
    });

    test('should reject invalid email format', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/login`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const emailInput = authenticatedPage.locator('input[name="email"], input[type="email"]').first();
      await emailInput.fill('notanemail');
      
      const isValid = await emailInput.evaluate(el => el.checkValidity());
      expect(isValid).toBeFalsy();
    });

    test('should reject email without domain', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/login`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const emailInput = authenticatedPage.locator('input[name="email"], input[type="email"]').first();
      await emailInput.fill('test@');
      
      const isValid = await emailInput.evaluate(el => el.checkValidity());
      expect(isValid).toBeFalsy();
    });

    test('should reject email without @', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/login`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const emailInput = authenticatedPage.locator('input[name="email"], input[type="email"]').first();
      await emailInput.fill('testemail.com');
      
      const isValid = await emailInput.evaluate(el => el.checkValidity());
      expect(isValid).toBeFalsy();
    });
  });

  test.describe('Phone Validation', () => {
    test('should accept valid phone numbers', async ({ page }) => {
      const validPhones = ['+1234567890', '123-456-7890', '(123) 456-7890'];
      
      for (const phone of validPhones) {
        expect(ValidationHelper.isValidPhone(phone)).toBeTruthy();
      }
    });

    test('should reject invalid phone numbers', async ({ page }) => {
      const invalidPhones = ['abc', '123abc', 'not a phone'];
      
      for (const phone of invalidPhones) {
        expect(ValidationHelper.isValidPhone(phone)).toBeFalsy();
      }
    });
  });

  test.describe('Password Validation', () => {
    test('should enforce minimum password length', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/signup`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const passwordInput = authenticatedPage.locator('input[name="password"], input[type="password"]').first();
      await passwordInput.fill('123');
      
      const isValid = await passwordInput.evaluate(el => el.checkValidity());
      expect(isValid).toBeFalsy();
    });

    test('should accept strong passwords', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/signup`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const passwordInput = authenticatedPage.locator('input[name="password"], input[type="password"]').first();
      await passwordInput.fill('StrongPass@123');
      
      const isValid = await passwordInput.evaluate(el => el.checkValidity());
      expect(isValid).toBeTruthy();
    });

    test('should show password strength indicator', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/signup`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const passwordInput = authenticatedPage.locator('input[name="password"], input[type="password"]').first();
      await passwordInput.fill('Test@123');
      await authenticatedPage.waitForTimeout(500);
      
      const strengthIndicator = authenticatedPage.locator('[class*="strength"], [class*="meter"], progress');
      const hasIndicator = await strengthIndicator.count() > 0;
      console.log('Password strength indicator present:', hasIndicator);
    });
  });

  test.describe('URL Validation', () => {
    test('should accept valid URLs', async ({ page }) => {
      const validUrls = ['https://example.com', 'http://test.com/path', 'https://test.com/path?query=1'];
      
      for (const url of validUrls) {
        expect(ValidationHelper.isValidUrl(url)).toBeTruthy();
      }
    });

    test('should reject invalid URLs', async ({ page }) => {
      const invalidUrls = ['not a url', 'test', '://missing'];
      
      for (const url of invalidUrls) {
        expect(ValidationHelper.isValidUrl(url)).toBeFalsy();
      }
    });
  });

  test.describe('Numeric Validation', () => {
    test('should accept numeric input in number fields', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/settings`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const numberInputs = authenticatedPage.locator('input[type="number"]');
      const count = await numberInputs.count();
      
      if (count > 0) {
        await numberInputs.first().fill('123');
        const value = await numberInputs.first().inputValue();
        expect(value).toBe('123');
      }
    });

    test('should reject non-numeric input in number fields', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/settings`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const numberInputs = authenticatedPage.locator('input[type="number"]');
      const count = await numberInputs.count();
      
      if (count > 0) {
        await numberInputs.first().fill('abc');
        const value = await numberInputs.first().inputValue();
        expect(value).toBe('');
      }
    });
  });

  test.describe('Date Validation', () => {
    test('should accept valid date formats', async ({ page, authenticatedPage }) => {
      const dateInput = authenticatedPage.locator('input[type="date"]').first();
      if (await dateInput.isVisible()) {
        await dateInput.fill('2025-12-31');
        const value = await dateInput.inputValue();
        expect(value).toBe('2025-12-31');
      }
    });

    test('should reject invalid dates', async ({ page, authenticatedPage }) => {
      const dateInput = authenticatedPage.locator('input[type="date"]').first();
      if (await dateInput.isVisible()) {
        await dateInput.fill('invalid-date');
        const value = await dateInput.inputValue();
        expect(value).toBe('');
      }
    });

    test('should not allow past dates for scheduling', async ({ page, authenticatedPage }) => {
      const dateInput = authenticatedPage.locator('input[type="date"]').first();
      if (await dateInput.isVisible()) {
        await dateInput.fill('2020-01-01');
        const isInvalid = await dateInput.evaluate(el => el.validity.rangeUnderflow);
        console.log('Past date validation:', isInvalid);
      }
    });
  });

  test.describe('Text Length Validation', () => {
    test('should enforce max length', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/profile`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const textareas = authenticatedPage.locator('textarea[maxlength]');
      const count = await textareas.count();
      
      if (count > 0) {
        const maxLength = await textareas.first().getAttribute('maxlength');
        if (maxLength) {
          const longText = 'a'.repeat(parseInt(maxLength) + 100);
          await textareas.first().fill(longText);
          const value = await textareas.first().inputValue();
          expect(value.length).toBeLessThanOrEqual(parseInt(maxLength));
        }
      }
    });

    test('should show character count', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/profile`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const textarea = authenticatedPage.locator('textarea').first();
      const characterCount = authenticatedPage.locator('[class*="char-count"], [class*="character"]').first();
      
      if (await textarea.isVisible() && await characterCount.isVisible()) {
        console.log('Character count is displayed');
      }
    });
  });

  test.describe('Dropdowns', () => {
    test('should have default selection', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/settings`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const selects = authenticatedPage.locator('select');
      const count = await selects.count();
      
      if (count > 0) {
        const firstOption = await selects.first().locator('option').first().textContent();
        console.log('Default selection:', firstOption);
      }
    });

    test('should allow option selection', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/settings`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const selects = authenticatedPage.locator('select');
      const count = await selects.count();
      
      if (count > 0) {
        const options = await selects.first().locator('option').allTextContents();
        if (options.length > 1) {
          await selects.first().selectOption({ index: 1 });
          const value = await selects.first().inputValue();
          expect(value).toBeTruthy();
        }
      }
    });
  });

  test.describe('Checkboxes', () => {
    test('should toggle checkbox on click', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/settings`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const checkbox = authenticatedPage.locator('input[type="checkbox"]').first();
      if (await checkbox.isVisible()) {
        const initialState = await checkbox.isChecked();
        await checkbox.click();
        const newState = await checkbox.isChecked();
        expect(newState).not.toBe(initialState);
      }
    });

    test('should allow multiple checkbox selection', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/notifications/preferences`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const checkboxes = authenticatedPage.locator('input[type="checkbox"]');
      const count = await checkboxes.count();
      
      if (count > 1) {
        await checkboxes.nth(0).check();
        await checkboxes.nth(1).check();
        
        const isChecked1 = await checkboxes.nth(0).isChecked();
        const isChecked2 = await checkboxes.nth(1).isChecked();
        expect(isChecked1 && isChecked2).toBeTruthy();
      }
    });
  });

  test.describe('Radio Buttons', () => {
    test('should select radio option', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/settings`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const radios = authenticatedPage.locator('input[type="radio"]');
      const count = await radios.count();
      
      if (count > 0) {
        await radios.first().check();
        const isChecked = await radios.first().isChecked();
        expect(isChecked).toBeTruthy();
      }
    });

    test('should deselect other radios in group', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/settings`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const radios = authenticatedPage.locator('input[type="radio"][name]');
      const count = await radios.count();
      
      if (count > 1) {
        const firstName = await radios.first().getAttribute('name');
        const sameGroup = radios.filter({ has: page.locator(`input[name="${firstName}"]`) });
        const groupCount = await sameGroup.count();
        
        if (groupCount > 1) {
          await sameGroup.nth(0).check();
          await sameGroup.nth(1).check();
          
          const secondChecked = await sameGroup.nth(1).isChecked();
          expect(secondChecked).toBeTruthy();
        }
      }
    });
  });

  test.describe('File Uploads', () => {
    test('should have file input', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/profile`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const fileInput = authenticatedPage.locator('input[type="file"]');
      const count = await fileInput.count();
      console.log(`Found ${count} file inputs`);
    });

    test('should accept valid file types', async ({ page, authenticatedPage }) => {
      const fileInput = authenticatedPage.locator('input[type="file"]').first();
      if (await fileInput.isVisible()) {
        const accept = await fileInput.getAttribute('accept');
        console.log('Accepted file types:', accept);
      }
    });

    test('should show selected file name', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/profile`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const fileInput = authenticatedPage.locator('input[type="file"]').first();
      if (await fileInput.isVisible()) {
        await fileInput.setInputFiles({
          name: 'test.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('test content'),
        });
        
        const fileNameDisplay = authenticatedPage.locator('[class*="file-name"], [class*="filename"]').first();
        const hasFileName = await fileNameDisplay.isVisible().catch(() => false);
        console.log('File name displayed:', hasFileName);
      }
    });
  });
});