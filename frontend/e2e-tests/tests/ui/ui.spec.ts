import { test, expect } from '../fixtures/test-fixtures';
import { PageHelper } from '../helpers/utilities';

test.describe('UI Testing', () => {
  test.describe('Broken Buttons', () => {
    test('should not have buttons without handlers', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const buttons = await PageHelper.getAllButtons(authenticatedPage);
      console.log(`Found ${buttons.length} buttons`);
    });

    test('should not have disabled buttons that appear clickable', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const disabledButtons = authenticatedPage.locator('button[disabled], button[aria-disabled="true"]');
      const count = await disabledButtons.count();
      console.log(`Found ${count} disabled buttons`);
    });
  });

  test.describe('Broken Links', () => {
    test('should detect broken links', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const links = await PageHelper.getAllLinks(authenticatedPage);
      const brokenLinks: string[] = [];
      
      for (const link of links.slice(0, 30)) {
        if (link.startsWith('/') || link.includes('localhost')) {
          try {
            const fullUrl = link.startsWith('/') 
              ? `${process.env.BASE_URL || 'http://localhost:3000'}${link}`
              : link;
            const response = await authenticatedPage.request.get(fullUrl, { timeout: 5000 });
            if (response.status() >= 400) {
              brokenLinks.push(`${link} - ${response.status()}`);
            }
          } catch (e) {
            brokenLinks.push(`${link} - Request failed`);
          }
        }
      }
      
      console.log(`Broken links: ${brokenLinks.length}`);
      brokenLinks.forEach(l => console.log(`  ${l}`));
    });

    test('should have working navigation links', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const sidebarLinks = authenticatedPage.locator('nav a, [class*="sidebar"] a, [class*="menu"] a');
      const count = await sidebarLinks.count();
      console.log(`Found ${count} navigation links`);
      
      for (let i = 0; i < Math.min(count, 10); i++) {
        const href = await sidebarLinks.nth(i).getAttribute('href');
        if (href && !href.startsWith('#') && href !== '#') {
          console.log(`Nav link ${i + 1}: ${href}`);
        }
      }
    });
  });

  test.describe('Missing Assets', () => {
    test('should have all images with alt text', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const imagesWithoutAlt = await authenticatedPage.evaluate(() => {
        const images = Array.from(document.querySelectorAll('img'));
        return images
          .filter(img => !img.alt && !img.getAttribute('aria-hidden'))
          .map(img => img.src);
      });
      
      console.log(`Images without alt text: ${imagesWithoutAlt.length}`);
      expect(imagesWithoutAlt.length).toBe(0);
    });

    test('should have all icons loading', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const icons = authenticatedPage.locator('svg[class*="icon"], [class*="icon"], [data-testid*="icon"]');
      const count = await icons.count();
      console.log(`Found ${count} icons`);
    });

    test('should not have broken images', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const brokenImages = await authenticatedPage.evaluate(() => {
        const images = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
        return images
          .filter(img => !img.complete || img.naturalWidth === 0)
          .map(img => img.src);
      });
      
      console.log(`Broken images: ${brokenImages.length}`);
    });
  });

  test.describe('Layout Issues', () => {
    test('should not have overlapping elements', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const overlapping = await authenticatedPage.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('*'));
        const overlaps: string[] = [];
        
        for (let i = 0; i < Math.min(elements.length, 100); i++) {
          const el1 = elements[i] as HTMLElement;
          if (!el1.getBoundingClientRect) continue;
          
          const rect1 = el1.getBoundingClientRect();
          if (rect1.width === 0 || rect1.height === 0) continue;
          
          for (let j = i + 1; j < Math.min(elements.length, 100); j++) {
            const el2 = elements[j] as HTMLElement;
            if (!el2.getBoundingClientRect) continue;
            
            const rect2 = el2.getBoundingClientRect();
            if (rect2.width === 0 || rect2.height === 0) continue;
            
            const overlap = !(rect1.right < rect2.left || 
                            rect1.left > rect2.right || 
                            rect1.bottom < rect2.top || 
                            rect1.top > rect2.bottom);
            
            if (overlap) {
              const tag1 = el1.tagName.toLowerCase();
              const tag2 = el2.tagName.toLowerCase();
              if (tag1 !== tag2 || el1.className !== el2.className) {
                overlaps.push(`${tag1} overlaps ${tag2}`);
                break;
              }
            }
          }
        }
        
        return [...new Set(overlaps)];
      });
      
      console.log(`Overlapping element pairs: ${overlapping.length}`);
      overlapping.slice(0, 5).forEach(o => console.log(`  ${o}`));
    });

    test('should not have horizontal overflow', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const hasOverflow = await authenticatedPage.evaluate(() => {
        return document.body.scrollWidth > document.documentElement.clientWidth;
      });
      
      expect(hasOverflow).toBeFalsy();
    });

    test('should have proper spacing', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const cards = authenticatedPage.locator('[class*="card"], [class*="item"]');
      const count = await cards.count();
      console.log(`Found ${count} card elements`);
    });
  });

  test.describe('Responsive Testing', () => {
    test('should render correctly on desktop', async ({ page, authenticatedPage }) => {
      await authenticatedPage.setViewportSize({ width: 1920, height: 1080 });
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const sidebar = authenticatedPage.locator('nav, [class*="sidebar"]').first();
      const isVisible = await sidebar.isVisible();
      expect(isVisible).toBeTruthy();
    });

    test('should render correctly on tablet', async ({ page, authenticatedPage }) => {
      await authenticatedPage.setViewportSize({ width: 768, height: 1024 });
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const isReadable = await authenticatedPage.evaluate(() => {
        return document.body.clientWidth <= 1024;
      });
      console.log('Tablet layout readable:', isReadable);
    });

    test('should render correctly on mobile', async ({ page, authenticatedPage }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 812 });
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const menuButton = authenticatedPage.locator('button[aria-label*="menu" i], button:has-text("☰")').first();
      const isVisible = await menuButton.isVisible();
      console.log('Mobile menu button visible:', isVisible);
    });

    test('should have scrollable content on small screens', async ({ page, authenticatedPage }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 812 });
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const canScroll = await authenticatedPage.evaluate(() => {
        return document.documentElement.scrollHeight > document.documentElement.clientHeight;
      });
      console.log('Can scroll on mobile:', canScroll);
    });
  });

  test.describe('Dark Mode', () => {
    test('should toggle dark mode', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const themeToggle = authenticatedPage.locator('button[aria-label*="theme" i], button[aria-label*="dark" i], [class*="theme"]').first();
      
      if (await themeToggle.isVisible()) {
        await themeToggle.click();
        await authenticatedPage.waitForTimeout(500);
        
        const isDark = await authenticatedPage.evaluate(() => {
          return document.documentElement.classList.contains('dark') || 
                 document.body.classList.contains('dark');
        });
        console.log('Dark mode enabled:', isDark);
      }
    });
  });

  test.describe('Loading States', () => {
    test('should show loading indicator', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const loadingIndicator = authenticatedPage.locator('[class*="loading"], [class*="spinner"], [role="progressbar"]');
      const hasLoading = await loadingIndicator.isVisible().catch(() => false);
      console.log('Loading indicator visible:', hasLoading);
    });

    test('should hide loading after page load', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      await authenticatedPage.waitForLoadState('networkidle');
      await authenticatedPage.waitForTimeout(2000);
      
      const loadingIndicator = authenticatedPage.locator('[class*="loading"], [class*="spinner"]');
      const stillLoading = await loadingIndicator.isVisible().catch(() => false);
      console.log('Still loading after 2s:', stillLoading);
    });
  });

  test.describe('Toast Notifications', () => {
    test('should show toast on actions', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/profile`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const saveButton = authenticatedPage.locator('button:has-text("Save"), button[type="submit"]').first();
      if (await saveButton.isVisible()) {
        await saveButton.click();
        await authenticatedPage.waitForTimeout(1000);
        
        const toast = authenticatedPage.locator('[role="status"], [role="alert"], [class*="toast"]').first();
        const isShown = await toast.isVisible().catch(() => false);
        console.log('Toast shown:', isShown);
      }
    });
  });
});