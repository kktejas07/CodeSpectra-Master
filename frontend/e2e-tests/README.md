# CodeSpectra E2E Testing Framework

A comprehensive Playwright-based end-to-end testing framework for CodeSpectra.

## Features

- **Page Object Model (POM)** architecture for maintainable tests
- **Multi-browser testing** (Chromium, Firefox, WebKit)
- **Responsive testing** (Desktop, Tablet, Mobile)
- **API monitoring** and validation
- **Accessibility testing** with Axe Core
- **Performance measurement**
- **Visual regression** testing
- **Console error detection**
- **Detailed reporting** with HTML reports, screenshots, and videos

## Project Structure

```
e2e-tests/
├── config/
│   ├── playwright.config.ts    # Playwright configuration
│   └── test-config.ts          # Test environment configuration
├── fixtures/
│   └── test-fixtures.ts        # Test fixtures for authentication
├── helpers/
│   ├── monitors.ts             # API, Console, and Performance monitors
│   └── utilities.ts           # Data generators and helper functions
├── pages/
│   ├── base-page.ts            # Base page object class
│   ├── auth-pages.ts           # Authentication page objects
│   ├── dashboard-pages.ts      # Dashboard page objects
│   └── components.ts           # Form, Table, Modal, Toast components
├── tests/
│   ├── auth/                   # Authentication tests
│   ├── navigation/             # Navigation tests
│   ├── crud/                   # CRUD operations tests
│   ├── forms/                  # Form validation tests
│   ├── tables/                 # Table/pagination tests
│   ├── api/                    # API validation tests
│   ├── ui/                     # UI component tests
│   ├── accessibility/          # Accessibility tests
│   ├── performance/            # Performance tests
│   └── visual/                 # Visual tests
├── reports/                    # Test reports (generated)
├── screenshots/                # Screenshots (generated)
├── videos/                     # Videos (generated)
├── traces/                     # Trace files (generated)
└── package.json                # Test dependencies and scripts
```

## Prerequisites

- Node.js 18+
- The CodeSpectra application running on localhost:3000

## Installation

```bash
# Install dependencies
cd e2e-tests
npm install

# Install Playwright browsers
npm run test:install
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests with UI mode (interactive)
```bash
npm run test:ui
```

### Run tests with visible browser
```bash
npm run test:headed
```

### Run specific test suite
```bash
npm run test:auth        # Authentication tests
npm run test:api         # API validation tests
npm run test:crud        # CRUD operations tests
npm run test:forms       # Form validation tests
npm run test:tables      # Table/pagination tests
npm run test:accessibility # Accessibility tests
npm run test:performance # Performance tests
npm run test:navigation   # Navigation tests
npm run test:ui          # UI tests
```

### Run on specific browser
```bash
npm run test:chromium    # Chromium only
npm run test:firefox     # Firefox only
npm run test:webkit      # WebKit only
```

### View HTML report
```bash
npm run test:report
```

## Configuration

### Environment Variables

Create a `.env` file or set environment variables:

```bash
BASE_URL=http://localhost:3000
TEST_USER_EMAIL=test@codespectra.io
TEST_USER_PASSWORD=Test@123456
```

### Test Configuration

Edit `config/test-config.ts` to customize:
- Timeouts
- Viewport sizes
- Test credentials
- Slow thresholds

## Test Categories

### Authentication Tests
- Login with valid/invalid credentials
- Signup/Registration
- Forgot Password
- Reset Password
- Session expiration
- Remember Me

### Navigation Tests
- Sidebar navigation
- Breadcrumbs
- Internal links
- Back/Forward navigation
- Deep linking
- Responsive menu

### CRUD Tests
- Create operations
- Read operations
- Update operations
- Delete operations
- Cancel operations
- Validation errors
- Duplicate prevention

### Form Tests
- Required fields
- Email validation
- Phone validation
- Password validation
- URL validation
- Numeric validation
- Date validation
- Max/Min length
- Dropdowns
- Checkboxes
- Radio buttons
- File uploads

### Table Tests
- Pagination
- Search
- Sorting
- Filtering
- Empty states
- Large datasets

### API Tests
- Monitor API calls
- Validate HTTP status codes
- Detect failed API calls
- Detect slow responses
- Capture request/response payloads
- 404/500 error detection

### UI Tests
- Broken buttons
- Broken links
- Missing icons/images
- Layout issues
- Responsive testing
- Dark mode
- Loading states
- Toast notifications

### Accessibility Tests
- Axe Core accessibility audit
- Missing labels
- Color contrast
- Keyboard navigation
- ARIA issues
- Screen reader support
- Heading hierarchy
- Landmarks

### Performance Tests
- Page load time
- Slow API detection
- Resource sizes
- Lighthouse metrics
- Memory leaks

### Visual Tests
- Page screenshots
- Responsive screenshots
- Modal screenshots
- Dark mode screenshots

## Reports

Test results are generated in multiple formats:

- **HTML Report**: `reports/html/index.html`
- **JSON Report**: `reports/test-results.json`
- **Screenshots**: `screenshots/` (on failure)
- **Videos**: `videos/` (on failure)
- **Traces**: `traces/` (on retry)

## Continuous Integration

```yaml
# Example GitHub Actions
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd e2e-tests && npm install
      - run: npm run test:install
      - run: npm test
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: reports/
```

## Tips

- Use `--grep` to run tests matching a pattern:
  ```bash
  npx playwright test --grep "login"
  ```

- Use `--grep-invert` to skip tests:
  ```bash
  npx playwright test --grep-invert "slow"
  ```

- Use `--debug` for interactive debugging:
  ```bash
  npx playwright test --debug
  ```

- Run a single test file:
  ```bash
  npx playwright test tests/auth/auth.spec.ts
  ```

- Run tests in parallel:
  ```bash
  npx playwright test --workers=4
  ```