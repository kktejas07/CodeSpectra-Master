# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/api/api.spec.ts >> Console Error Detection >> should report no critical console errors on dashboard
- Location: tests/api/api.spec.ts:179:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/dashboard
Call log:
  - navigating to "http://localhost:3000/dashboard", waiting until "load"

```

# Test source

```ts
  82  |   test('should validate authentication API', async ({ page }) => {
  83  |     const response = await page.request.get(`${process.env.BASE_URL || 'http://localhost:3000'}/api/auth/session`);
  84  |     const status = response.status();
  85  |     console.log(`Auth session API status: ${status}`);
  86  |   });
  87  | 
  88  |   test('should validate problems API', async ({ page, authenticatedPage }) => {
  89  |     const response = await page.request.get(`${process.env.BASE_URL || 'http://localhost:3000'}/api/problems`);
  90  |     const status = response.status();
  91  |     console.log(`Problems API status: ${status}`);
  92  |     
  93  |     if (status === 200) {
  94  |       const body = await response.json();
  95  |       console.log(`Problems API returned ${Array.isArray(body) ? body.length : 'unknown'} items`);
  96  |     }
  97  |   });
  98  | 
  99  |   test('should detect 404 errors', async ({ page, authenticatedPage }) => {
  100 |     const apiMonitor = new ApiMonitor(authenticatedPage);
  101 |     
  102 |     await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  103 |     await authenticatedPage.waitForLoadState('networkidle');
  104 |     
  105 |     const notFoundCalls = apiMonitor.getCalls().filter(c => c.status === 404);
  106 |     console.log(`Found ${notFoundCalls.length} 404 errors`);
  107 |     
  108 |     notFoundCalls.forEach(call => {
  109 |       console.log(`404: ${call.url}`);
  110 |     });
  111 |   });
  112 | 
  113 |   test('should detect 500 errors', async ({ page, authenticatedPage }) => {
  114 |     const apiMonitor = new ApiMonitor(authenticatedPage);
  115 |     
  116 |     await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  117 |     await authenticatedPage.waitForLoadState('networkidle');
  118 |     
  119 |     const serverErrors = apiMonitor.getCalls().filter(c => c.status >= 500);
  120 |     console.log(`Found ${serverErrors.length} server errors`);
  121 |     
  122 |     serverErrors.forEach(call => {
  123 |       console.log(`Server Error ${call.status}: ${call.url}`);
  124 |     });
  125 |   });
  126 | });
  127 | 
  128 | test.describe('Console Error Detection', () => {
  129 |   test('should capture console errors', async ({ page, authenticatedPage }) => {
  130 |     const consoleMonitor = new ConsoleMonitor(authenticatedPage);
  131 |     
  132 |     await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  133 |     await authenticatedPage.waitForLoadState('networkidle');
  134 |     
  135 |     const errors = consoleMonitor.getErrors();
  136 |     console.log(`Found ${errors.length} console errors`);
  137 |     
  138 |     errors.forEach(error => {
  139 |       console.log(`Console Error: ${error.text}`);
  140 |     });
  141 |   });
  142 | 
  143 |   test('should capture console warnings', async ({ page, authenticatedPage }) => {
  144 |     const consoleMonitor = new ConsoleMonitor(authenticatedPage);
  145 |     
  146 |     await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  147 |     await authenticatedPage.waitForLoadState('networkidle');
  148 |     
  149 |     const warnings = consoleMonitor.getWarnings();
  150 |     console.log(`Found ${warnings.length} console warnings`);
  151 |   });
  152 | 
  153 |   test('should detect JavaScript exceptions', async ({ page, authenticatedPage }) => {
  154 |     const consoleMonitor = new ConsoleMonitor(authenticatedPage);
  155 |     
  156 |     await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  157 |     await authenticatedPage.waitForLoadState('networkidle');
  158 |     
  159 |     const errors = consoleMonitor.getErrors();
  160 |     const jsErrors = errors.filter(e => e.text.includes('Error') || e.text.includes('exception'));
  161 |     console.log(`Found ${jsErrors.length} JavaScript errors`);
  162 |     
  163 |     jsErrors.forEach(error => {
  164 |       console.log(`JS Error: ${error.text}`);
  165 |     });
  166 |   });
  167 | 
  168 |   test('should detect unhandled promise rejections', async ({ page, authenticatedPage }) => {
  169 |     const consoleMonitor = new ConsoleMonitor(authenticatedPage);
  170 |     
  171 |     await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  172 |     await authenticatedPage.waitForLoadState('networkidle');
  173 |     
  174 |     const errors = consoleMonitor.getErrors();
  175 |     const unhandledRejections = errors.filter(e => e.text.includes('Unhandled Promise'));
  176 |     console.log(`Found ${unhandledRejections.length} unhandled promise rejections`);
  177 |   });
  178 | 
  179 |   test('should report no critical console errors on dashboard', async ({ page, authenticatedPage }) => {
  180 |     const consoleMonitor = new ConsoleMonitor(authenticatedPage);
  181 |     
> 182 |     await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
      |                             ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/dashboard
  183 |     await authenticatedPage.waitForLoadState('networkidle');
  184 |     
  185 |     const errors = consoleMonitor.getErrors();
  186 |     const criticalErrors = errors.filter(e => 
  187 |       e.text.includes('Error') && 
  188 |       !e.text.includes('warning') && 
  189 |       !e.text.includes('Warning')
  190 |     );
  191 |     
  192 |     console.log(`Critical errors on dashboard: ${criticalErrors.length}`);
  193 |     expect(criticalErrors.length).toBe(0);
  194 |   });
  195 | });
```