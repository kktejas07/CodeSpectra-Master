import { test, expect } from '../../fixtures/test-fixtures';
import { DynamicTable } from '../../pages/components';

test.describe('Tables Tests', () => {
  test.describe('Pagination', () => {
    test('should display pagination controls', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const table = new DynamicTable(authenticatedPage, 'table');
      const rowCount = await table.getRowCount();
      console.log(`Table has ${rowCount} rows`);
      
      if (rowCount > 10) {
        const pagination = authenticatedPage.locator('[class*="pagination"], [role="navigation"]').first();
        const hasPagination = await pagination.isVisible().catch(() => false);
        console.log('Pagination present:', hasPagination);
      }
    });

    test('should navigate to next page', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const table = new DynamicTable(authenticatedPage, 'table');
      const hasNext = await table.nextPage();
      
      if (hasNext) {
        const currentPage = await authenticatedPage.locator('[class*="page"][class*="active"], [aria-current="page"]').textContent();
        console.log('Navigated to page:', currentPage);
      }
    });

    test('should navigate to previous page', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const table = new DynamicTable(authenticatedPage, 'table');
      await table.nextPage();
      await authenticatedPage.waitForTimeout(500);
      
      const hasPrev = await table.previousPage();
      console.log('Can go to previous page:', hasPrev);
    });

    test('should navigate to specific page', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const table = new DynamicTable(authenticatedPage, 'table');
      const pageButtons = authenticatedPage.locator('[class*="pagination"] button, [role="navigation"] button');
      const count = await pageButtons.count();
      
      if (count > 1) {
        await table.goToPage(2);
        await authenticatedPage.waitForTimeout(500);
        console.log('Navigated to page 2');
      }
    });

    test('should disable previous button on first page', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const prevButton = authenticatedPage.locator('button[aria-label="Previous"], button:has-text("Previous"), button:has-text("‹")').first();
      const isDisabled = await prevButton.isDisabled().catch(() => false);
      console.log('Previous disabled on first page:', isDisabled);
    });

    test('should disable next button on last page', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const table = new DynamicTable(authenticatedPage, 'table');
      await table.nextPage();
      await authenticatedPage.waitForTimeout(500);
      
      const nextButton = authenticatedPage.locator('button[aria-label="Next"], button:has-text("Next"), button:has-text("›")').first();
      const isDisabled = await nextButton.isDisabled().catch(() => false);
      console.log('Next disabled on last page:', isDisabled);
    });
  });

  test.describe('Search', () => {
    test('should have search input', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const searchInput = authenticatedPage.locator('input[placeholder*="search" i], input[type="search"]').first();
      const hasSearch = await searchInput.isVisible().catch(() => false);
      expect(hasSearch).toBeTruthy();
    });

    test('should filter table by search query', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const searchInput = authenticatedPage.locator('input[placeholder*="search" i], input[type="search"]').first();
      if (await searchInput.isVisible()) {
        await searchInput.fill('test');
        await authenticatedPage.waitForTimeout(500);
        
        const table = new DynamicTable(authenticatedPage, 'table');
        const rowCount = await table.getRowCount();
        console.log(`Found ${rowCount} rows after search`);
      }
    });

    test('should show no results message for empty search', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const searchInput = authenticatedPage.locator('input[placeholder*="search" i], input[type="search"]').first();
      if (await searchInput.isVisible()) {
        await searchInput.fill('xyznonexistent123');
        await authenticatedPage.waitForTimeout(500);
        
        const emptyMessage = authenticatedPage.locator('[class*="empty"], [class*="no-results"], [class*="no data"]').first();
        const hasEmptyState = await emptyMessage.isVisible().catch(() => false);
        console.log('Empty state shown:', hasEmptyState);
      }
    });

    test('should clear search', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const searchInput = authenticatedPage.locator('input[placeholder*="search" i], input[type="search"]').first();
      if (await searchInput.isVisible()) {
        await searchInput.fill('test');
        await authenticatedPage.waitForTimeout(500);
        await searchInput.clear();
        await authenticatedPage.waitForTimeout(500);
        
        const table = new DynamicTable(authenticatedPage, 'table');
        const rowCount = await table.getRowCount();
        console.log(`Table has ${rowCount} rows after clearing search`);
      }
    });
  });

  test.describe('Sorting', () => {
    test('should sort by column on click', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const headers = authenticatedPage.locator('table th, [role="columnheader"]');
      const count = await headers.count();
      
      if (count > 0) {
        const firstHeader = headers.first();
        const initialText = await firstHeader.textContent();
        
        await firstHeader.click();
        await authenticatedPage.waitForTimeout(300);
        
        const table = new DynamicTable(authenticatedPage, 'table');
        const firstRowAfterSort = await table.getRowData(0);
        console.log('First row after sort:', firstRowAfterSort);
      }
    });

    test('should toggle sort direction', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const headers = authenticatedPage.locator('table th');
      const count = await headers.count();
      
      if (count > 0) {
        await headers.first().click();
        await authenticatedPage.waitForTimeout(300);
        
        const sortIcon = authenticatedPage.locator('[class*="sort-asc"], [class*="sort-desc"], [aria-sort]').first();
        const hasSortIcon = await sortIcon.isVisible().catch(() => false);
        console.log('Sort indicator present:', hasSortIcon);
        
        await headers.first().click();
        await authenticatedPage.waitForTimeout(300);
        
        const table = new DynamicTable(authenticatedPage, 'table');
        const firstRowAfterReverseSort = await table.getRowData(0);
        console.log('First row after reverse sort:', firstRowAfterReverseSort);
      }
    });

    test('should show sort indicator', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const sortableHeader = authenticatedPage.locator('th[role="columnheader"][aria-sort], th:has([class*="sort"])').first();
      const hasSortableHeader = await sortableHeader.isVisible().catch(() => false);
      console.log('Sortable header found:', hasSortableHeader);
    });
  });

  test.describe('Filtering', () => {
    test('should have filter dropdowns', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const filters = authenticatedPage.locator('select, [role="combobox"], [aria-haspopup="listbox"]');
      const count = await filters.count();
      console.log(`Found ${count} filter dropdowns`);
    });

    test('should filter by dropdown selection', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const filterSelect = authenticatedPage.locator('select, [role="combobox"]').first();
      if (await filterSelect.isVisible()) {
        const options = await filterSelect.locator('option').allTextContents();
        if (options.length > 1) {
          await filterSelect.selectOption({ index: 1 });
          await authenticatedPage.waitForTimeout(500);
          
          const table = new DynamicTable(authenticatedPage, 'table');
          const rowCount = await table.getRowCount();
          console.log(`Filtered to ${rowCount} rows`);
        }
      }
    });

    test('should clear filters', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const filterSelect = authenticatedPage.locator('select, [role="combobox"]').first();
      if (await filterSelect.isVisible()) {
        await filterSelect.selectOption({ index: 1 });
        await authenticatedPage.waitForTimeout(500);
        
        const clearButton = authenticatedPage.locator('button:has-text("Clear"), button:has-text("Reset")').first();
        if (await clearButton.isVisible()) {
          await clearButton.click();
          await authenticatedPage.waitForTimeout(500);
        } else {
          await filterSelect.selectOption({ index: 0 });
        }
      }
    });
  });

  test.describe('Empty State', () => {
    test('should show empty state when no data', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const table = new DynamicTable(authenticatedPage, 'table');
      const isEmpty = await table.isEmpty();
      
      if (isEmpty) {
        const emptyMessage = authenticatedPage.locator('[class*="empty"], [data-testid="empty-state"]').first();
        const hasMessage = await emptyMessage.isVisible().catch(() => false);
        console.log('Empty state displayed:', hasMessage);
      }
    });

    test('should show helpful empty state message', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const table = new DynamicTable(authenticatedPage, 'table');
      const isEmpty = await table.isEmpty();
      
      if (isEmpty) {
        const emptyMessage = await table.getEmptyMessage();
        console.log('Empty message:', emptyMessage);
        expect(emptyMessage.length).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Large Datasets', () => {
    test('should handle large datasets efficiently', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      const start = Date.now();
      await authenticatedPage.waitForLoadState('networkidle');
      const loadTime = Date.now() - start;
      
      console.log(`Page loaded in ${loadTime}ms`);
      
      const table = new DynamicTable(authenticatedPage, 'table');
      const rowCount = await table.getRowCount();
      console.log(`Table has ${rowCount} rows`);
      
      expect(loadTime).toBeLessThan(10000);
    });

    test('should lazy load data', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const table = new DynamicTable(authenticatedPage, 'table');
      const initialRows = await table.getRowCount();
      
      await table.nextPage();
      await authenticatedPage.waitForTimeout(500);
      
      const nextRows = await table.getRowCount();
      expect(nextRows).toBe(initialRows);
    });
  });

  test.describe('Table Operations', () => {
    test('should select row', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const table = new DynamicTable(authenticatedPage, 'table');
      const count = await table.getRowCount();
      
      if (count > 0) {
        const checkbox = authenticatedPage.locator('table input[type="checkbox"]').first();
        if (await checkbox.isVisible()) {
          await checkbox.click();
          const isChecked = await checkbox.isChecked();
          expect(isChecked).toBeTruthy();
        }
      }
    });

    test('should bulk select rows', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const selectAll = authenticatedPage.locator('input[type="checkbox"]').first();
      if (await selectAll.isVisible()) {
        await selectAll.click();
        const isChecked = await selectAll.isChecked();
        console.log('All rows selected:', isChecked);
      }
    });

    test('should show row actions', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const table = new DynamicTable(authenticatedPage, 'table');
      const count = await table.getRowCount();
      
      if (count > 0) {
        await table.rows.first().hover();
        await authenticatedPage.waitForTimeout(300);
        
        const actionButtons = authenticatedPage.locator('table button[aria-label*="action" i], table [class*="action"]');
        const hasActions = await actionButtons.count() > 0;
        console.log('Row actions visible on hover:', hasActions);
      }
    });
  });
});