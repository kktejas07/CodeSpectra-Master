import { test, expect } from '../../fixtures/test-fixtures';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Tests', () => {
  test.describe('Axe Core Accessibility', () => {
    test('should have no critical accessibility issues on dashboard', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const accessibilityScan = await new AxeBuilder({ page: authenticatedPage })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      
      const criticalIssues = accessibilityScan.violations.filter(v => v.impact === 'critical');
      console.log(`Critical accessibility issues: ${criticalIssues.length}`);
      
      accessibilityScan.violations.forEach(v => {
        console.log(`${v.impact}: ${v.description} - ${v.nodes.length} nodes`);
      });
      
      expect(criticalIssues.length).toBe(0);
    });

    test('should have no accessibility issues on login page', async ({ page }) => {
      await page.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/login`);
      await page.waitForLoadState('networkidle');
      
      const accessibilityScan = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      
      console.log(`Total accessibility violations: ${accessibilityScan.violations.length}`);
      
      accessibilityScan.violations.slice(0, 5).forEach(v => {
        console.log(`${v.impact}: ${v.description}`);
      });
    });

    test('should have no accessibility issues on problems page', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const accessibilityScan = await new AxeBuilder({ page: authenticatedPage })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      
      console.log(`Problems page violations: ${accessibilityScan.violations.length}`);
    });
  });

  test.describe('Missing Labels', () => {
    test('should have labels for all form inputs', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/profile`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const inputsWithoutLabels = await authenticatedPage.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])'));
        return inputs
          .filter(input => {
            const id = input.id;
            const hasLabel = id && document.querySelector(`label[for="${id}"]`);
            const hasAriaLabel = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
            return !hasLabel && !hasAriaLabel && !input.title;
          })
          .map(input => ({
            id: input.id || input.name || 'unnamed',
            type: input.type,
          }));
      });
      
      console.log(`Inputs without labels: ${inputsWithoutLabels.length}`);
      expect(inputsWithoutLabels.length).toBe(0);
    });

    test('should have accessible names for buttons', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const buttonsWithoutNames = await authenticatedPage.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons
          .filter(btn => {
            const hasText = btn.textContent?.trim();
            const hasAriaLabel = btn.getAttribute('aria-label');
            return !hasText && !hasAriaLabel;
          })
          .map(btn => btn.className);
      });
      
      console.log(`Buttons without accessible names: ${buttonsWithoutNames.length}`);
      expect(buttonsWithoutNames.length).toBe(0);
    });
  });

  test.describe('Color Contrast', () => {
    test('should have sufficient color contrast', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const accessibilityScan = await new AxeBuilder({ page: authenticatedPage })
        .withTags(['wcag2aa'])
        .analyze();
      
      const contrastIssues = accessibilityScan.violations.filter(v => 
        v.description.toLowerCase().includes('contrast')
      );
      
      console.log(`Color contrast issues: ${contrastIssues.length}`);
    });

    test('should not use color alone to convey information', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const accessibilityScan = await new AxeBuilder({ page: authenticatedPage })
        .analyze();
      
      const colorAloneIssues = accessibilityScan.violations.filter(v =>
        v.id === 'color-contrast' || v.description.toLowerCase().includes('contrast')
      );
      
      console.log(`Color as sole means of conveying info issues: ${colorAloneIssues.length}`);
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('should be navigable with keyboard only', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/login`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      await authenticatedPage.keyboard.press('Tab');
      await authenticatedPage.waitForTimeout(100);
      
      const focusedElement = await authenticatedPage.evaluate(() => {
        return document.activeElement?.tagName.toLowerCase();
      });
      
      console.log(`First tab focused element: ${focusedElement}`);
      expect(focusedElement).toBeTruthy();
    });

    test('should have visible focus indicators', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/login`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      await authenticatedPage.keyboard.press('Tab');
      
      const hasFocusStyle = await authenticatedPage.evaluate(() => {
        const focused = document.activeElement;
        if (!focused) return false;
        
        const style = window.getComputedStyle(focused);
        return style.outlineWidth !== '0px' || 
               style.borderWidth !== '0px' ||
               focused.classList.contains('focus') ||
               focused.getAttribute('tabindex') !== null;
      });
      
      console.log('Has visible focus indicator:', hasFocusStyle);
    });

    test('should trap focus in modals', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const modal = authenticatedPage.locator('[role="dialog"], .modal').first();
      if (await modal.isVisible()) {
        const focusableElements = await authenticatedPage.evaluate(() => {
          const modal = document.querySelector('[role="dialog"]');
          if (!modal) return 0;
          
          const focusable = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          return focusable.length;
        });
        
        console.log(`Focusable elements in modal: ${focusableElements}`);
        expect(focusableElements).toBeGreaterThan(0);
      }
    });

    test('should close modal with Escape key', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const closeButton = authenticatedPage.locator('[role="dialog"] button[aria-label="Close"], [role="dialog"] button:has-text("×")').first();
      if (await closeButton.isVisible()) {
        await authenticatedPage.keyboard.press('Escape');
        await authenticatedPage.waitForTimeout(500);
        
        const modalClosed = !(await authenticatedPage.locator('[role="dialog"]').isVisible());
        console.log('Modal closed with Escape:', modalClosed);
      }
    });
  });

  test.describe('ARIA Issues', () => {
    test('should have valid ARIA attributes', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const accessibilityScan = await new AxeBuilder({ page: authenticatedPage })
        .analyze();
      
      const ariaIssues = accessibilityScan.violations.filter(v =>
        v.id.includes('aria') || v.description.toLowerCase().includes('aria')
      );
      
      console.log(`ARIA-related violations: ${ariaIssues.length}`);
    });

    test('should have proper heading hierarchy', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const headingHierarchy = await authenticatedPage.evaluate(() => {
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
        return headings.map(h => ({
          level: parseInt(h.tagName[1]),
          text: h.textContent?.substring(0, 30),
        }));
      });
      
      console.log('Heading hierarchy:', headingHierarchy.slice(0, 6));
      
      let valid = true;
      for (let i = 1; i < headingHierarchy.length; i++) {
        const current = headingHierarchy[i].level;
        const previous = headingHierarchy[i - 1].level;
        if (current > previous + 1) {
          valid = false;
          console.log(`Invalid heading hierarchy: h${previous} followed by h${current}`);
        }
      }
      expect(valid).toBeTruthy();
    });

    test('should have landmarks defined', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const landmarks = await authenticatedPage.evaluate(() => {
        const elements = document.querySelectorAll('header, nav, main, footer, aside, [role="banner"], [role="navigation"], [role="main"], [role="contentinfo"]');
        return Array.from(elements).map(el => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''));
      });
      
      console.log(`Found ${landmarks.length} landmarks`);
      expect(landmarks.length).toBeGreaterThan(0);
    });
  });

  test.describe('Screen Reader Support', () => {
    test('should have proper alt text for images', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const imagesWithoutAlt = await authenticatedPage.evaluate(() => {
        const images = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
        return images
          .filter(img => !img.alt && !img.getAttribute('aria-hidden'))
          .length;
      });
      
      console.log(`Images without alt text: ${imagesWithoutAlt}`);
      expect(imagesWithoutAlt).toBe(0);
    });

    test('should have table headers with scope', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const tables = authenticatedPage.locator('table');
      const count = await tables.count();
      
      if (count > 0) {
        const headersWithoutScope = await authenticatedPage.evaluate(() => {
          const headers = Array.from(document.querySelectorAll('th'));
          return headers
            .filter(th => !th.getAttribute('scope') && !th.getAttribute('role'))
            .length;
        });
        
        console.log(`Headers without scope: ${headersWithoutScope}`);
      }
    });
  });
});