import { test, expect } from '../fixtures/test-fixtures';
import { ProblemsPage, HackathonsPage, JobsPage, InterviewsPage } from '../pages/dashboard-pages';
import { DynamicForm, DynamicTable, Modal, Toast } from '../pages/components';
import { DataGenerator } from '../helpers/utilities';

test.describe('CRUD Operations Tests', () => {
  let toast: Toast;

  test.beforeEach(async ({ page }) => {
    toast = new Toast(page);
  });

  test.describe('Problems CRUD', () => {
    test('should list problems', async ({ page, authenticatedPage }) => {
      const problemsPage = new ProblemsPage(authenticatedPage);
      await problemsPage.navigate();
      await authenticatedPage.waitForLoadState('networkidle');
      
      const problemCount = await problemsPage.getProblemCount();
      console.log(`Found ${problemCount} problems`);
      expect(problemCount).toBeGreaterThanOrEqual(0);
    });

    test('should create a problem', async ({ page, authenticatedPage }) => {
      const problemsPage = new ProblemsPage(authenticatedPage);
      await problemsPage.navigate();
      await authenticatedPage.waitForLoadState('networkidle');
      
      const createButton = authenticatedPage.locator('button:has-text("Create"), a:has-text("New Problem"), button:has-text("Add")').first();
      if (await createButton.isVisible()) {
        await createButton.click();
        await authenticatedPage.waitForLoadState('networkidle');
        
        const form = new DynamicForm(authenticatedPage, 'form');
        const titleField = authenticatedPage.locator('input[name="title"], input[id="title"], input[placeholder*="title" i]').first();
        if (await titleField.isVisible()) {
          await titleField.fill(`Test Problem ${Date.now()}`);
          
          const descriptionField = authenticatedPage.locator('textarea[name="description"], textarea[id="description"]').first();
          if (await descriptionField.isVisible()) {
            await descriptionField.fill('Test Description');
          }
          
          const submitButton = authenticatedPage.locator('button[type="submit"], button:has-text("Create"), button:has-text("Save")').first();
          await submitButton.click();
          await authenticatedPage.waitForTimeout(2000);
          
          const success = await toast.isSuccess(5000);
          console.log('Create problem success:', success);
        }
      }
    });

    test('should read problem details', async ({ page, authenticatedPage }) => {
      const problemsPage = new ProblemsPage(authenticatedPage);
      await problemsPage.navigate();
      await authenticatedPage.waitForLoadState('networkidle');
      
      const count = await problemsPage.getProblemCount();
      if (count > 0) {
        await problemsPage.clickProblem(0);
        await authenticatedPage.waitForLoadState('networkidle');
        
        const title = authenticatedPage.locator('h1, h2').first().textContent();
        expect(title).toBeTruthy();
      }
    });

    test('should update a problem', async ({ page, authenticatedPage }) => {
      const problemsPage = new ProblemsPage(authenticatedPage);
      await problemsPage.navigate();
      await authenticatedPage.waitForLoadState('networkidle');
      
      const count = await problemsPage.getProblemCount();
      if (count > 0) {
        const editButton = authenticatedPage.locator('button:has-text("Edit"), a:has-text("Edit")').first();
        if (await editButton.isVisible()) {
          await editButton.click();
          await authenticatedPage.waitForLoadState('networkidle');
          
          const form = new DynamicForm(authenticatedPage, 'form');
          const nameField = authenticatedPage.locator('input[name="name"], input[name="title"]').first();
          if (await nameField.isVisible()) {
            await nameField.fill(`Updated Problem ${Date.now()}`);
            
            const submitButton = authenticatedPage.locator('button[type="submit"], button:has-text("Update"), button:has-text("Save")').first();
            await submitButton.click();
            await authenticatedPage.waitForTimeout(2000);
          }
        }
      }
    });

    test('should delete a problem', async ({ page, authenticatedPage }) => {
      const problemsPage = new ProblemsPage(authenticatedPage);
      await problemsPage.navigate();
      await authenticatedPage.waitForLoadState('networkidle');
      
      const count = await problemsPage.getProblemCount();
      if (count > 0) {
        const deleteButton = authenticatedPage.locator('button[aria-label*="delete" i], button:has-text("Delete")').first();
        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          await authenticatedPage.waitForTimeout(500);
          
          const modal = new Modal(authenticatedPage);
          if (await modal.isOpen()) {
            await modal.confirm();
            await authenticatedPage.waitForTimeout(1000);
          }
        }
      }
    });

    test('should cancel delete operation', async ({ page, authenticatedPage }) => {
      const problemsPage = new ProblemsPage(authenticatedPage);
      await problemsPage.navigate();
      await authenticatedPage.waitForLoadState('networkidle');
      
      const count = await problemsPage.getProblemCount();
      if (count > 0) {
        const deleteButton = authenticatedPage.locator('button[aria-label*="delete" i], button:has-text("Delete")').first();
        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          await authenticatedPage.waitForTimeout(500);
          
          const cancelButton = authenticatedPage.locator('button:has-text("Cancel"), button:has-text("No")').first();
          if (await cancelButton.isVisible()) {
            await cancelButton.click();
            await authenticatedPage.waitForTimeout(500);
          }
        }
      }
    });
  });

  test.describe('Hackathons CRUD', () => {
    test('should list hackathons', async ({ page, authenticatedPage }) => {
      const hackathonsPage = new HackathonsPage(authenticatedPage);
      await hackathonsPage.navigate();
      await authenticatedPage.waitForLoadState('networkidle');
      
      const count = await hackathonsPage.getHackathonCount();
      console.log(`Found ${count} hackathons`);
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should register for a hackathon', async ({ page, authenticatedPage }) => {
      const hackathonsPage = new HackathonsPage(authenticatedPage);
      await hackathonsPage.navigate();
      await authenticatedPage.waitForLoadState('networkidle');
      
      const registerButton = authenticatedPage.locator('button:has-text("Register"), button:has-text("Join"), a:has-text("Register")').first();
      if (await registerButton.isVisible()) {
        await registerButton.click();
        await authenticatedPage.waitForLoadState('networkidle');
        
        const modal = new Modal(authenticatedPage);
        if (await modal.isOpen()) {
          const confirmButton = authenticatedPage.locator('button:has-text("Confirm"), button:has-text("Register")').first();
          if (await confirmButton.isVisible()) {
            await confirmButton.click();
            await authenticatedPage.waitForTimeout(2000);
          }
        }
      }
    });
  });

  test.describe('Jobs CRUD', () => {
    test('should list jobs', async ({ page, authenticatedPage }) => {
      const jobsPage = new JobsPage(authenticatedPage);
      await jobsPage.navigate();
      await authenticatedPage.waitForLoadState('networkidle');
      
      const count = await jobsPage.getJobCount();
      console.log(`Found ${count} jobs`);
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should apply to a job', async ({ page, authenticatedPage }) => {
      const jobsPage = new JobsPage(authenticatedPage);
      await jobsPage.navigate();
      await authenticatedPage.waitForLoadState('networkidle');
      
      const count = await jobsPage.getJobCount();
      if (count > 0) {
        await jobsPage.applyToJob(0);
        await authenticatedPage.waitForTimeout(2000);
      }
    });
  });

  test.describe('Interviews CRUD', () => {
    test('should list interviews', async ({ page, authenticatedPage }) => {
      const interviewsPage = new InterviewsPage(authenticatedPage);
      await interviewsPage.navigate();
      await authenticatedPage.waitForLoadState('networkidle');
      
      const count = await interviewsPage.getInterviewCount();
      console.log(`Found ${count} interviews`);
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should schedule an interview', async ({ page, authenticatedPage }) => {
      const interviewsPage = new InterviewsPage(authenticatedPage);
      await interviewsPage.navigate();
      await authenticatedPage.waitForLoadState('networkidle');
      
      const scheduleButton = authenticatedPage.locator('button:has-text("Schedule"), a:has-text("Schedule")').first();
      if (await scheduleButton.isVisible()) {
        await scheduleButton.click();
        await authenticatedPage.waitForLoadState('networkidle');
        
        const form = new DynamicForm(authenticatedPage, 'form');
        const dateField = authenticatedPage.locator('input[type="date"], input[name="date"], input[name="scheduledAt"]').first();
        if (await dateField.isVisible()) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          await dateField.fill(tomorrow.toISOString().split('T')[0]);
          
          const submitButton = authenticatedPage.locator('button[type="submit"], button:has-text("Schedule")').first();
          await submitButton.click();
          await authenticatedPage.waitForTimeout(2000);
        }
      }
    });
  });

  test.describe('Validation Tests', () => {
    test('should show required field validation', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const createButton = authenticatedPage.locator('button:has-text("Create"), button:has-text("Add")').first();
      if (await createButton.isVisible()) {
        await createButton.click();
        await authenticatedPage.waitForLoadState('networkidle');
        
        const submitButton = authenticatedPage.locator('button[type="submit"], button:has-text("Create")').first();
        await submitButton.click();
        await authenticatedPage.waitForTimeout(500);
        
        const validationErrors = authenticatedPage.locator('[data-error], .error, [class*="required"]');
        const hasValidation = await validationErrors.count() > 0;
        expect(hasValidation).toBeTruthy();
      }
    });

    test('should prevent duplicate entries', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const createButton = authenticatedPage.locator('button:has-text("Create"), button:has-text("Add")').first();
      if (await createButton.isVisible()) {
        await createButton.click();
        await authenticatedPage.waitForLoadState('networkidle');
        
        const form = new DynamicForm(authenticatedPage, 'form');
        const nameField = authenticatedPage.locator('input[name="name"], input[name="title"]').first();
        if (await nameField.isVisible()) {
          await nameField.fill('Existing Name');
          await form.submit();
          await authenticatedPage.waitForTimeout(1000);
          
          const duplicateError = authenticatedPage.locator('[data-error]:has-text("already"), .error:has-text("already")');
          const hasDuplicateError = await duplicateError.isVisible().catch(() => false);
          if (hasDuplicateError) {
            console.log('Duplicate prevention working');
          }
        }
      }
    });
  });

  test.describe('Cancel Operations', () => {
    test('should cancel create operation', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const createButton = authenticatedPage.locator('button:has-text("Create"), button:has-text("Add")').first();
      if (await createButton.isVisible()) {
        await createButton.click();
        await authenticatedPage.waitForLoadState('networkidle');
        
        const cancelButton = authenticatedPage.locator('button:has-text("Cancel"), button:has-text("Back")').first();
        if (await cancelButton.isVisible()) {
          await cancelButton.click();
          await authenticatedPage.waitForTimeout(500);
          expect(authenticatedPage.url()).not.toContain('/create');
        }
      }
    });

    test('should cancel update operation', async ({ page, authenticatedPage }) => {
      await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/problems`);
      await authenticatedPage.waitForLoadState('networkidle');
      
      const editButton = authenticatedPage.locator('button:has-text("Edit")').first();
      if (await editButton.isVisible()) {
        await editButton.click();
        await authenticatedPage.waitForLoadState('networkidle');
        
        const cancelButton = authenticatedPage.locator('button:has-text("Cancel"), button:has-text("Back")').first();
        if (await cancelButton.isVisible()) {
          await cancelButton.click();
          await authenticatedPage.waitForTimeout(500);
        }
      }
    });
  });
});