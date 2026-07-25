# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/accessibility/accessibility.spec.ts >> Accessibility Tests >> Color Contrast >> should not use color alone to convey information
- Location: tests/accessibility/accessibility.spec.ts:111:9

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
Call log:
  - navigating to "http://localhost:3000/dashboard", waiting until "load"

```

# Test source

```ts
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
  108 |       console.log(`Color contrast issues: ${contrastIssues.length}`);
  109 |     });
  110 | 
  111 |     test('should not use color alone to convey information', async ({ page, authenticatedPage }) => {
> 112 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      |                               ^ Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
  113 |       await authenticatedPage.waitForLoadState('networkidle');
  114 |       
  115 |       const accessibilityScan = await new AxeBuilder({ page: authenticatedPage })
  116 |         .analyze();
  117 |       
  118 |       const colorAloneIssues = accessibilityScan.violations.filter(v =>
  119 |         v.id === 'color-contrast' || v.description.toLowerCase().includes('contrast')
  120 |       );
  121 |       
  122 |       console.log(`Color as sole means of conveying info issues: ${colorAloneIssues.length}`);
  123 |     });
  124 |   });
  125 | 
  126 |   test.describe('Keyboard Navigation', () => {
  127 |     test('should be navigable with keyboard only', async ({ page, authenticatedPage }) => {
  128 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/login`);
  129 |       await authenticatedPage.waitForLoadState('networkidle');
  130 |       
  131 |       await authenticatedPage.keyboard.press('Tab');
  132 |       await authenticatedPage.waitForTimeout(100);
  133 |       
  134 |       const focusedElement = await authenticatedPage.evaluate(() => {
  135 |         return document.activeElement?.tagName.toLowerCase();
  136 |       });
  137 |       
  138 |       console.log(`First tab focused element: ${focusedElement}`);
  139 |       expect(focusedElement).toBeTruthy();
  140 |     });
  141 | 
  142 |     test('should have visible focus indicators', async ({ page, authenticatedPage }) => {
  143 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/login`);
  144 |       await authenticatedPage.waitForLoadState('networkidle');
  145 |       
  146 |       await authenticatedPage.keyboard.press('Tab');
  147 |       
  148 |       const hasFocusStyle = await authenticatedPage.evaluate(() => {
  149 |         const focused = document.activeElement;
  150 |         if (!focused) return false;
  151 |         
  152 |         const style = window.getComputedStyle(focused);
  153 |         return style.outlineWidth !== '0px' || 
  154 |                style.borderWidth !== '0px' ||
  155 |                focused.classList.contains('focus') ||
  156 |                focused.getAttribute('tabindex') !== null;
  157 |       });
  158 |       
  159 |       console.log('Has visible focus indicator:', hasFocusStyle);
  160 |     });
  161 | 
  162 |     test('should trap focus in modals', async ({ page, authenticatedPage }) => {
  163 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  164 |       await authenticatedPage.waitForLoadState('networkidle');
  165 |       
  166 |       const modal = authenticatedPage.locator('[role="dialog"], .modal').first();
  167 |       if (await modal.isVisible()) {
  168 |         const focusableElements = await authenticatedPage.evaluate(() => {
  169 |           const modal = document.querySelector('[role="dialog"]');
  170 |           if (!modal) return 0;
  171 |           
  172 |           const focusable = modal.querySelectorAll(
  173 |             'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  174 |           );
  175 |           return focusable.length;
  176 |         });
  177 |         
  178 |         console.log(`Focusable elements in modal: ${focusableElements}`);
  179 |         expect(focusableElements).toBeGreaterThan(0);
  180 |       }
  181 |     });
  182 | 
  183 |     test('should close modal with Escape key', async ({ page, authenticatedPage }) => {
  184 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  185 |       await authenticatedPage.waitForLoadState('networkidle');
  186 |       
  187 |       const closeButton = authenticatedPage.locator('[role="dialog"] button[aria-label="Close"], [role="dialog"] button:has-text("×")').first();
  188 |       if (await closeButton.isVisible()) {
  189 |         await authenticatedPage.keyboard.press('Escape');
  190 |         await authenticatedPage.waitForTimeout(500);
  191 |         
  192 |         const modalClosed = !(await authenticatedPage.locator('[role="dialog"]').isVisible());
  193 |         console.log('Modal closed with Escape:', modalClosed);
  194 |       }
  195 |     });
  196 |   });
  197 | 
  198 |   test.describe('ARIA Issues', () => {
  199 |     test('should have valid ARIA attributes', async ({ page, authenticatedPage }) => {
  200 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  201 |       await authenticatedPage.waitForLoadState('networkidle');
  202 |       
  203 |       const accessibilityScan = await new AxeBuilder({ page: authenticatedPage })
  204 |         .analyze();
  205 |       
  206 |       const ariaIssues = accessibilityScan.violations.filter(v =>
  207 |         v.id.includes('aria') || v.description.toLowerCase().includes('aria')
  208 |       );
  209 |       
  210 |       console.log(`ARIA-related violations: ${ariaIssues.length}`);
  211 |     });
  212 | 
```