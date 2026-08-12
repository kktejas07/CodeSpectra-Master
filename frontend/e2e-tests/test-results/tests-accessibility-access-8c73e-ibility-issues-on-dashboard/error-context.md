# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/accessibility/accessibility.spec.ts >> Accessibility Tests >> Axe Core Accessibility >> should have no critical accessibility issues on dashboard
- Location: tests/accessibility/accessibility.spec.ts:6:9

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/dashboard
Call log:
  - navigating to "http://localhost:3000/dashboard", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect } from '../../fixtures/test-fixtures';
  2   | import AxeBuilder from '@axe-core/playwright';
  3   | 
  4   | test.describe('Accessibility Tests', () => {
  5   |   test.describe('Axe Core Accessibility', () => {
  6   |     test('should have no critical accessibility issues on dashboard', async ({ page, authenticatedPage }) => {
> 7   |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      |                               ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/dashboard
  8   |       await authenticatedPage.waitForLoadState('networkidle');
  9   |       
  10  |       const accessibilityScan = await new AxeBuilder({ page: authenticatedPage })
  11  |         .withTags(['wcag2a', 'wcag2aa'])
  12  |         .analyze();
  13  |       
  14  |       const criticalIssues = accessibilityScan.violations.filter(v => v.impact === 'critical');
  15  |       console.log(`Critical accessibility issues: ${criticalIssues.length}`);
  16  |       
  17  |       accessibilityScan.violations.forEach(v => {
  18  |         console.log(`${v.impact}: ${v.description} - ${v.nodes.length} nodes`);
  19  |       });
  20  |       
  21  |       expect(criticalIssues.length).toBe(0);
  22  |     });
  23  | 
  24  |     test('should have no accessibility issues on login page', async ({ page }) => {
  25  |       await page.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/login`);
  26  |       await page.waitForLoadState('networkidle');
  27  |       
  28  |       const accessibilityScan = await new AxeBuilder({ page })
  29  |         .withTags(['wcag2a', 'wcag2aa'])
  30  |         .analyze();
  31  |       
  32  |       console.log(`Total accessibility violations: ${accessibilityScan.violations.length}`);
  33  |       
  34  |       accessibilityScan.violations.slice(0, 5).forEach(v => {
  35  |         console.log(`${v.impact}: ${v.description}`);
  36  |       });
  37  |     });
  38  | 
  39  |     test('should have no accessibility issues on problems page', async ({ page, authenticatedPage }) => {
  40  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
  41  |       await authenticatedPage.waitForLoadState('networkidle');
  42  |       
  43  |       const accessibilityScan = await new AxeBuilder({ page: authenticatedPage })
  44  |         .withTags(['wcag2a', 'wcag2aa'])
  45  |         .analyze();
  46  |       
  47  |       console.log(`Problems page violations: ${accessibilityScan.violations.length}`);
  48  |     });
  49  |   });
  50  | 
  51  |   test.describe('Missing Labels', () => {
  52  |     test('should have labels for all form inputs', async ({ page, authenticatedPage }) => {
  53  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/profile`);
  54  |       await authenticatedPage.waitForLoadState('networkidle');
  55  |       
  56  |       const inputsWithoutLabels = await authenticatedPage.evaluate(() => {
  57  |         const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])'));
  58  |         return inputs
  59  |           .filter(input => {
  60  |             const id = input.id;
  61  |             const hasLabel = id && document.querySelector(`label[for="${id}"]`);
  62  |             const hasAriaLabel = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
  63  |             return !hasLabel && !hasAriaLabel && !input.title;
  64  |           })
  65  |           .map(input => ({
  66  |             id: input.id || input.name || 'unnamed',
  67  |             type: input.type,
  68  |           }));
  69  |       });
  70  |       
  71  |       console.log(`Inputs without labels: ${inputsWithoutLabels.length}`);
  72  |       expect(inputsWithoutLabels.length).toBe(0);
  73  |     });
  74  | 
  75  |     test('should have accessible names for buttons', async ({ page, authenticatedPage }) => {
  76  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  77  |       await authenticatedPage.waitForLoadState('networkidle');
  78  |       
  79  |       const buttonsWithoutNames = await authenticatedPage.evaluate(() => {
  80  |         const buttons = Array.from(document.querySelectorAll('button'));
  81  |         return buttons
  82  |           .filter(btn => {
  83  |             const hasText = btn.textContent?.trim();
  84  |             const hasAriaLabel = btn.getAttribute('aria-label');
  85  |             return !hasText && !hasAriaLabel;
  86  |           })
  87  |           .map(btn => btn.className);
  88  |       });
  89  |       
  90  |       console.log(`Buttons without accessible names: ${buttonsWithoutNames.length}`);
  91  |       expect(buttonsWithoutNames.length).toBe(0);
  92  |     });
  93  |   });
  94  | 
  95  |   test.describe('Color Contrast', () => {
  96  |     test('should have sufficient color contrast', async ({ page, authenticatedPage }) => {
  97  |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  98  |       await authenticatedPage.waitForLoadState('networkidle');
  99  |       
  100 |       const accessibilityScan = await new AxeBuilder({ page: authenticatedPage })
  101 |         .withTags(['wcag2aa'])
  102 |         .analyze();
  103 |       
  104 |       const contrastIssues = accessibilityScan.violations.filter(v => 
  105 |         v.description.toLowerCase().includes('contrast')
  106 |       );
  107 |       
```