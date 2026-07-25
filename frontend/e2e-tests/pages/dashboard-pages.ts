import { Page, Locator } from '@playwright/test';
import { BasePage } from './base-page';

export class DashboardPage extends BasePage {
  readonly sidebar: Locator;
  readonly userMenu: Locator;
  readonly notificationsBell: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    super(page, '/dashboard');
    this.sidebar = page.locator('[data-testid="sidebar"], nav, [class*="sidebar"]').first();
    this.userMenu = page.locator('[data-testid="user-menu"], [aria-label*="user" i], button:has-text("Profile")').first();
    this.notificationsBell = page.locator('[data-testid="notifications"], [aria-label*="notification" i]').first();
    this.searchInput = page.locator('[data-testid="search-input"], input[placeholder*="search" i]').first();
  }

  async getMenuItems(): Promise<string[]> {
    return this.page.evaluate(() => {
      const menuItems: string[] = [];
      document.querySelectorAll('nav a, [class*="menu"] a, [class*="sidebar"] a').forEach(item => {
        const text = item.textContent?.trim();
        if (text) menuItems.push(text);
      });
      return menuItems;
    });
  }

  async isSidebarVisible(): Promise<boolean> {
    return this.sidebar.isVisible();
  }

  async openUserMenu(): Promise<void> {
    await this.userMenu.click();
  }

  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.page.keyboard.press('Enter');
    await this.page.waitForLoadState('networkidle');
  }
}

export class AdminPage extends BasePage {
  readonly adminMenu: Locator;
  readonly usersLink: Locator;
  readonly settingsLink: Locator;
  readonly analyticsLink: Locator;

  constructor(page: Page) {
    super(page, '/dashboard/admin');
    this.adminMenu = page.locator('[data-testid="admin-menu"], nav:has-text("Admin")').first();
    this.usersLink = page.locator('a[href*="/admin/users"]').first();
    this.settingsLink = page.locator('a[href*="/admin/settings"]').first();
    this.analyticsLink = page.locator('a[href*="/admin/analytics"]').first();
  }

  async navigateToUsers(): Promise<void> {
    await this.usersLink.click();
    await this.page.waitForLoadState('networkidle');
  }

  async navigateToSettings(): Promise<void> {
    await this.settingsLink.click();
    await this.page.waitForLoadState('networkidle');
  }
}

export class ProfilePage extends BasePage {
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly saveButton: Locator;
  readonly avatarUpload: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    super(page, '/dashboard/profile');
    this.nameInput = page.locator('input[name="name"], input[id="name"]');
    this.emailInput = page.locator('input[name="email"], input[type="email"]');
    this.saveButton = page.locator('button:has-text("Save"), button[type="submit"]');
    this.avatarUpload = page.locator('input[type="file"], input[accept*="image"]');
    this.successMessage = page.locator('.success, [role="status"]:has-text("saved")');
  }

  async updateProfile(name: string): Promise<void> {
    await this.nameInput.fill(name);
    await this.saveButton.click();
    await this.page.waitForLoadState('networkidle');
  }
}

export class SettingsPage extends BasePage {
  readonly settingsTabs: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    super(page, '/dashboard/settings');
    this.settingsTabs = page.locator('[role="tablist"], .tabs, [class*="tab"]').first();
    this.saveButton = page.locator('button:has-text("Save"), button[type="submit"]').first();
  }

  async getAvailableTabs(): Promise<string[]> {
    return this.settingsTabs.locator('[role="tab"], button, a').allTextContents();
  }

  async clickTab(tabName: string): Promise<void> {
    await this.settingsTabs.locator(`[role="tab"]:has-text("${tabName}"), button:has-text("${tabName}")`).click();
    await this.page.waitForLoadState('networkidle');
  }
}

export class ProblemsPage extends BasePage {
  readonly problemList: Locator;
  readonly createButton: Locator;
  readonly searchInput: Locator;
  readonly filterDropdown: Locator;

  constructor(page: Page) {
    super(page, '/dashboard/problems');
    this.problemList = page.locator('[data-testid="problem-list"], table, [class*="problem"]').first();
    this.createButton = page.locator('button:has-text("Create"), a:has-text("New Problem")').first();
    this.searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first();
    this.filterDropdown = page.locator('select, [role="combobox"]').first();
  }

  async getProblemCount(): Promise<number> {
    return this.problemList.locator('tr, [class*="item"]').count();
  }

  async searchProblem(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(500);
  }

  async clickProblem(index = 0): Promise<void> {
    await this.problemList.locator('tr, [class*="item"]').nth(index).click();
    await this.page.waitForLoadState('networkidle');
  }
}

export class ArenaPage extends BasePage {
  readonly challengeList: Locator;
  readonly startChallengeButton: Locator;
  readonly codeEditor: Locator;
  readonly runButton: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    super(page, '/dashboard/arena');
    this.challengeList = page.locator('[data-testid="challenge-list"], [class*="challenge"]').first();
    this.startChallengeButton = page.locator('button:has-text("Start"), a:has-text("Start Challenge")').first();
    this.codeEditor = page.locator('.monaco-editor, [data-testid="code-editor"], textarea').first();
    this.runButton = page.locator('button:has-text("Run"), button[aria-label*="run" i]').first();
    this.submitButton = page.locator('button:has-text("Submit"), button[aria-label*="submit" i]').first();
  }

  async isEditorVisible(): Promise<boolean> {
    return this.codeEditor.isVisible();
  }

  async runCode(): Promise<void> {
    await this.runButton.click();
    await this.page.waitForTimeout(2000);
  }

  async submitCode(): Promise<void> {
    await this.submitButton.click();
    await this.page.waitForLoadState('networkidle');
  }
}

export class HackathonsPage extends BasePage {
  readonly hackathonList: Locator;
  readonly createButton: Locator;
  readonly registerButton: Locator;

  constructor(page: Page) {
    super(page, '/dashboard/hackathons');
    this.hackathonList = page.locator('[data-testid="hackathon-list"], [class*="hackathon"]').first();
    this.createButton = page.locator('button:has-text("Create"), a:has-text("New Hackathon")').first();
    this.registerButton = page.locator('button:has-text("Register"), a:has-text("Join")').first();
  }

  async getHackathonCount(): Promise<number> {
    return this.hackathonList.locator('[class*="card"], [class*="item"]').count();
  }

  async registerForHackathon(index = 0): Promise<void> {
    await this.registerButton.nth(index).click();
    await this.page.waitForLoadState('networkidle');
  }
}

export class JobsPage extends BasePage {
  readonly jobList: Locator;
  readonly createButton: Locator;
  readonly applyButton: Locator;

  constructor(page: Page) {
    super(page, '/dashboard/jobs');
    this.jobList = page.locator('[data-testid="job-list"], [class*="job"]').first();
    this.createButton = page.locator('button:has-text("Post Job"), a:has-text("Create Job")').first();
    this.applyButton = page.locator('button:has-text("Apply")').first();
  }

  async getJobCount(): Promise<number> {
    return this.jobList.locator('[class*="card"], [class*="item"]').count();
  }

  async applyToJob(index = 0): Promise<void> {
    await this.applyButton.nth(index).click();
    await this.page.waitForLoadState('networkidle');
  }
}

export class InterviewsPage extends BasePage {
  readonly interviewList: Locator;
  readonly scheduleButton: Locator;
  readonly feedbackButton: Locator;

  constructor(page: Page) {
    super(page, '/dashboard/interviews');
    this.interviewList = page.locator('[data-testid="interview-list"], [class*="interview"]').first();
    this.scheduleButton = page.locator('button:has-text("Schedule"), a:has-text("Schedule Interview")').first();
    this.feedbackButton = page.locator('a:has-text("Feedback"), button:has-text("Feedback")').first();
  }

  async getInterviewCount(): Promise<number> {
    return this.interviewList.locator('[class*="card"], [class*="item"]').count();
  }

  async scheduleInterview(): Promise<void> {
    await this.scheduleButton.click();
    await this.page.waitForLoadState('networkidle');
  }
}

export class CertificationsPage extends BasePage {
  readonly certificationList: Locator;
  readonly startButton: Locator;

  constructor(page: Page) {
    super(page, '/dashboard/certifications');
    this.certificationList = page.locator('[data-testid="certification-list"], [class*="certification"]').first();
    this.startButton = page.locator('button:has-text("Start"), a:has-text("Start")').first();
  }

  async getCertificationCount(): Promise<number> {
    return this.certificationList.locator('[class*="card"], [class*="item"]').count();
  }

  async startCertification(index = 0): Promise<void> {
    await this.startButton.nth(index).click();
    await this.page.waitForLoadState('networkidle');
  }
}

export class AchievementsPage extends BasePage {
  readonly achievementList: Locator;
  readonly earnedBadge: Locator;

  constructor(page: Page) {
    super(page, '/dashboard/achievements');
    this.achievementList = page.locator('[data-testid="achievement-list"], [class*="achievement"]').first();
    this.earnedBadge = page.locator('[class*="earned"], [class*="unlocked"]').first();
  }

  async getAchievementCount(): Promise<number> {
    return this.achievementList.locator('[class*="card"], [class*="item"]').count();
  }

  async getEarnedCount(): Promise<number> {
    return this.earnedBadge.count();
  }
}

export class LeaderboardPage extends BasePage {
  readonly leaderboardTable: Locator;
  readonly timeFilter: Locator;

  constructor(page: Page) {
    super(page, '/dashboard/leaderboard');
    this.leaderboardTable = page.locator('table, [data-testid="leaderboard"]').first();
    this.timeFilter = page.locator('select, [role="combobox"]').first();
  }

  async getTopUsers(count = 10): Promise<string[]> {
    return this.leaderboardTable.locator('tr:first-child, [class*="rank-1"]').allTextContents();
  }

  async filterByTime(timeRange: string): Promise<void> {
    await this.timeFilter.selectOption(timeRange);
    await this.page.waitForLoadState('networkidle');
  }
}