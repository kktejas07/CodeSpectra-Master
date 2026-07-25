export const testConfig = {
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  timeout: {
    small: 5000,
    medium: 10000,
    large: 30000,
  },
  slowThreshold: 3000,
  apiSlowThreshold: 5000,
  retries: {
    runOnFirstFailure: 1,
    runOnAllFailures: 2,
  },
  viewport: {
    desktop: { width: 1920, height: 1080 },
    tablet: { width: 768, height: 1024 },
    mobile: { width: 375, height: 812 },
  },
  credentials: {
    valid: {
      email: process.env.TEST_USER_EMAIL || 'test@codespectra.io',
      password: process.env.TEST_USER_PASSWORD || 'Test@123456',
    },
    invalid: {
      email: 'invalid@test.com',
      password: 'wrongpassword',
    },
  },
  testData: {
    randomEmail: () => `test_${Date.now()}@codespectra.io`,
    randomName: () => `Test User ${Date.now()}`,
    randomSlug: () => `test-${Date.now()}`,
  },
};