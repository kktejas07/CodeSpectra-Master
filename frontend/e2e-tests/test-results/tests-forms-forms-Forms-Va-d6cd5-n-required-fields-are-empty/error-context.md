# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/forms/forms.spec.ts >> Forms Validation Tests >> Required Fields >> should fail when required fields are empty
- Location: tests/forms/forms.spec.ts:16:9

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
Call log:
  - navigating to "http://localhost:3000/dashboard/profile", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect } from '../../fixtures/test-fixtures';
  2   | import { DynamicForm } from '../../pages/components';
  3   | import { DataGenerator, ValidationHelper } from '../../helpers/utilities';
  4   | 
  5   | test.describe('Forms Validation Tests', () => {
  6   |   test.describe('Required Fields', () => {
  7   |     test('should mark required fields', async ({ page, authenticatedPage }) => {
  8   |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/profile`);
  9   |       await authenticatedPage.waitForLoadState('networkidle');
  10  |       
  11  |       const requiredMarkers = authenticatedPage.locator('[data-required], .required, label:has-text("*")');
  12  |       const count = await requiredMarkers.count();
  13  |       console.log(`Found ${count} required field markers`);
  14  |     });
  15  | 
  16  |     test('should fail when required fields are empty', async ({ page, authenticatedPage }) => {
> 17  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/profile`);
      |                               ^ Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
  18  |       await authenticatedPage.waitForLoadState('networkidle');
  19  |       
  20  |       const submitButton = authenticatedPage.locator('button[type="submit"], button:has-text("Save")').first();
  21  |       if (await submitButton.isVisible()) {
  22  |         await submitButton.click();
  23  |         await authenticatedPage.waitForTimeout(500);
  24  |         
  25  |         const nameInput = authenticatedPage.locator('input[name="name"], input[id="name"]').first();
  26  |         if (await nameInput.isVisible()) {
  27  |           const isInvalid = await nameInput.evaluate(el => el.checkValidity() === false);
  28  |           expect(isInvalid).toBeTruthy();
  29  |         }
  30  |       }
  31  |     });
  32  |   });
  33  | 
  34  |   test.describe('Email Validation', () => {
  35  |     test('should accept valid email', async ({ page, authenticatedPage }) => {
  36  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/login`);
  37  |       await authenticatedPage.waitForLoadState('networkidle');
  38  |       
  39  |       const emailInput = authenticatedPage.locator('input[name="email"], input[type="email"]').first();
  40  |       await emailInput.fill('valid@email.com');
  41  |       
  42  |       const isValid = await emailInput.evaluate(el => el.checkValidity());
  43  |       expect(isValid).toBeTruthy();
  44  |     });
  45  | 
  46  |     test('should reject invalid email format', async ({ page, authenticatedPage }) => {
  47  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/login`);
  48  |       await authenticatedPage.waitForLoadState('networkidle');
  49  |       
  50  |       const emailInput = authenticatedPage.locator('input[name="email"], input[type="email"]').first();
  51  |       await emailInput.fill('notanemail');
  52  |       
  53  |       const isValid = await emailInput.evaluate(el => el.checkValidity());
  54  |       expect(isValid).toBeFalsy();
  55  |     });
  56  | 
  57  |     test('should reject email without domain', async ({ page, authenticatedPage }) => {
  58  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/login`);
  59  |       await authenticatedPage.waitForLoadState('networkidle');
  60  |       
  61  |       const emailInput = authenticatedPage.locator('input[name="email"], input[type="email"]').first();
  62  |       await emailInput.fill('test@');
  63  |       
  64  |       const isValid = await emailInput.evaluate(el => el.checkValidity());
  65  |       expect(isValid).toBeFalsy();
  66  |     });
  67  | 
  68  |     test('should reject email without @', async ({ page, authenticatedPage }) => {
  69  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/login`);
  70  |       await authenticatedPage.waitForLoadState('networkidle');
  71  |       
  72  |       const emailInput = authenticatedPage.locator('input[name="email"], input[type="email"]').first();
  73  |       await emailInput.fill('testemail.com');
  74  |       
  75  |       const isValid = await emailInput.evaluate(el => el.checkValidity());
  76  |       expect(isValid).toBeFalsy();
  77  |     });
  78  |   });
  79  | 
  80  |   test.describe('Phone Validation', () => {
  81  |     test('should accept valid phone numbers', async ({ page }) => {
  82  |       const validPhones = ['+1234567890', '123-456-7890', '(123) 456-7890'];
  83  |       
  84  |       for (const phone of validPhones) {
  85  |         expect(ValidationHelper.isValidPhone(phone)).toBeTruthy();
  86  |       }
  87  |     });
  88  | 
  89  |     test('should reject invalid phone numbers', async ({ page }) => {
  90  |       const invalidPhones = ['abc', '123abc', 'not a phone'];
  91  |       
  92  |       for (const phone of invalidPhones) {
  93  |         expect(ValidationHelper.isValidPhone(phone)).toBeFalsy();
  94  |       }
  95  |     });
  96  |   });
  97  | 
  98  |   test.describe('Password Validation', () => {
  99  |     test('should enforce minimum password length', async ({ page, authenticatedPage }) => {
  100 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/signup`);
  101 |       await authenticatedPage.waitForLoadState('networkidle');
  102 |       
  103 |       const passwordInput = authenticatedPage.locator('input[name="password"], input[type="password"]').first();
  104 |       await passwordInput.fill('123');
  105 |       
  106 |       const isValid = await passwordInput.evaluate(el => el.checkValidity());
  107 |       expect(isValid).toBeFalsy();
  108 |     });
  109 | 
  110 |     test('should accept strong passwords', async ({ page, authenticatedPage }) => {
  111 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/signup`);
  112 |       await authenticatedPage.waitForLoadState('networkidle');
  113 |       
  114 |       const passwordInput = authenticatedPage.locator('input[name="password"], input[type="password"]').first();
  115 |       await passwordInput.fill('StrongPass@123');
  116 |       
  117 |       const isValid = await passwordInput.evaluate(el => el.checkValidity());
```