# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/qa-single-browser.spec.ts >> CodeSpectra Single-Browser QA Audit >> 3.1 - Dashboard Access
- Location: tests/qa-single-browser.spec.ts:263:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/dashboard
Call log:
  - navigating to "http://localhost:3000/dashboard", waiting until "domcontentloaded"

```

# Test source

```ts
  165 |         await addIssue('Login Form', 'medium', 'Validation', 'HTML5 validation not triggered on empty submit');
  166 |       }
  167 |       
  168 |       // Fill invalid email
  169 |       await page.locator('#email').fill('invalid-email');
  170 |       await page.locator('#password').fill('password');
  171 |       await submitBtn.click();
  172 |       await page.waitForTimeout(500);
  173 |       
  174 |       const emailEl2 = page.locator('#email');
  175 |       const isInvalid2 = await emailEl2.evaluate(el => el.checkValidity() === false).catch(() => false);
  176 |       console.log(`  Invalid email validation: ${isInvalid2 ? 'WORKING' : 'NOT WORKING'}`);
  177 |     }
  178 |   });
  179 |   
  180 |   test('2.3 - Signup Page Flow', async () => {
  181 |     console.log('\n=== Testing Signup Page ===');
  182 |     await page.goto('http://localhost:3000/auth/signup', { waitUntil: 'networkidle' });
  183 |     await page.waitForTimeout(4000); // Wait for React hydration
  184 |     
  185 |     // Check form elements
  186 |     const nameInput = await page.locator('#name').isVisible().catch(() => false);
  187 |     const emailInput = await page.locator('#email').isVisible().catch(() => false);
  188 |     const passwordInput = await page.locator('#password').isVisible().catch(() => false);
  189 |     const confirmInput = await page.locator('#confirm').isVisible().catch(() => false);
  190 |     
  191 |     console.log(`  Name input: ${nameInput ? 'VISIBLE' : 'NOT FOUND'}`);
  192 |     console.log(`  Email input: ${emailInput ? 'VISIBLE' : 'NOT FOUND'}`);
  193 |     console.log(`  Password input: ${passwordInput ? 'VISIBLE' : 'NOT FOUND'}`);
  194 |     console.log(`  Confirm input: ${confirmInput ? 'VISIBLE' : 'NOT FOUND'}`);
  195 |     
  196 |     if (!nameInput || !emailInput || !passwordInput) {
  197 |       await addIssue('Signup Page', 'high', 'Form elements', 'Required form inputs not visible after hydration');
  198 |     }
  199 |     
  200 |     // Check login link
  201 |     const loginLink = await page.locator('a[href*="login"]').first().isVisible().catch(() => false);
  202 |     console.log(`  Login link: ${loginLink ? 'VISIBLE' : 'NOT FOUND'}`);
  203 |   });
  204 |   
  205 |   test('2.4 - Forgot Password Page Flow', async () => {
  206 |     console.log('\n=== Testing Forgot Password Page ===');
  207 |     await page.goto('http://localhost:3000/auth/forgot-password', { waitUntil: 'networkidle' });
  208 |     await page.waitForTimeout(4000); // Wait for React hydration
  209 |     
  210 |     const emailInput = await page.locator('#email').isVisible().catch(() => false);
  211 |     const submitButton = await page.locator('button[type="submit"]').isVisible().catch(() => false);
  212 |     const backLink = await page.locator('a[href*="login"]').first().isVisible().catch(() => false);
  213 |     
  214 |     console.log(`  Email input: ${emailInput ? 'VISIBLE' : 'NOT FOUND'}`);
  215 |     console.log(`  Submit button: ${submitButton ? 'VISIBLE' : 'NOT FOUND'}`);
  216 |     console.log(`  Back to login: ${backLink ? 'VISIBLE' : 'NOT FOUND'}`);
  217 |     
  218 |     if (!emailInput) {
  219 |       await addIssue('Forgot Password', 'high', 'Missing element', 'Email input not visible after hydration');
  220 |     }
  221 |   });
  222 |   
  223 |   test('2.5 - Auth Navigation Flow', async () => {
  224 |     console.log('\n=== Testing Auth Navigation ===');
  225 |     await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
  226 |     await page.waitForTimeout(3000);
  227 |     
  228 |     // Click signup link
  229 |     const signupLink = page.locator('a[href*="signup"]').first();
  230 |     if (await signupLink.isVisible()) {
  231 |       await signupLink.click();
  232 |       await page.waitForTimeout(2000);
  233 |       
  234 |       const url = page.url();
  235 |       console.log(`  After clicking Signup: ${url}`);
  236 |       
  237 |       if (!url.includes('signup')) {
  238 |         await addIssue('Auth Navigation', 'high', 'Navigation broken', 'Signup link did not navigate');
  239 |       }
  240 |     }
  241 |     
  242 |     // Navigate to forgot password
  243 |     await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' });
  244 |     await page.waitForTimeout(3000);
  245 |     
  246 |     const forgotLink = page.locator('a[href*="forgot"]').first();
  247 |     if (await forgotLink.isVisible()) {
  248 |       await forgotLink.click();
  249 |       await page.waitForTimeout(2000);
  250 |       
  251 |       const url2 = page.url();
  252 |       console.log(`  After clicking Forgot: ${url2}`);
  253 |       
  254 |       if (!url2.includes('forgot')) {
  255 |         await addIssue('Auth Navigation', 'high', 'Navigation broken', 'Forgot password link did not navigate');
  256 |       }
  257 |     }
  258 |   });
  259 |   
  260 |   // ==========================================
  261 |   // SECTION 3: Dashboard & Main App
  262 |   // ==========================================
  263 |   test('3.1 - Dashboard Access', async () => {
  264 |     console.log('\n=== Testing Dashboard Access ===');
> 265 |     await page.goto('http://localhost:3000/dashboard', { waitUntil: 'domcontentloaded' });
      |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/dashboard
  266 |     await page.waitForTimeout(3000);
  267 |     
  268 |     const url = page.url();
  269 |     console.log(`  Dashboard URL: ${url}`);
  270 |     
  271 |     if (url.includes('/dashboard')) {
  272 |       console.log('  Dashboard accessible (may need auth)');
  273 |       
  274 |       // Check for sidebar/menu
  275 |       const sidebar = await page.locator('nav, [class*="sidebar"], [class*="menu"]').first().isVisible().catch(() => false);
  276 |       console.log(`  Sidebar/Nav: ${sidebar ? 'VISIBLE' : 'NOT FOUND'}`);
  277 |       
  278 |       // Check for user menu
  279 |       const userMenu = await page.locator('[class*="user"], [class*="avatar"], button:has-text("Profile")').first().isVisible().catch(() => false);
  280 |       console.log(`  User menu: ${userMenu ? 'VISIBLE' : 'NOT FOUND'}`);
  281 |     } else if (url.includes('/auth/login')) {
  282 |       console.log('  Redirected to login (expected - needs authentication)');
  283 |     }
  284 |   });
  285 |   
  286 |   test('3.2 - Main Navigation Items', async () => {
  287 |     console.log('\n=== Testing Main Navigation ===');
  288 |     await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  289 |     await page.waitForTimeout(2000);
  290 |     
  291 |     // Check header navigation
  292 |     const headerLinks = await page.locator('header a, [class*="header"] a').all();
  293 |     console.log(`  Header links found: ${headerLinks.length}`);
  294 |     
  295 |     // Check for primary CTA buttons
  296 |     const ctaButtons = await page.locator('button:has-text("Get Started"), button:has-text("Start Free"), button:has-text("Sign Up Free")').count();
  297 |     console.log(`  CTA buttons: ${ctaButtons}`);
  298 |   });
  299 |   
  300 |   // ==========================================
  301 |   // SECTION 4: API Endpoints
  302 |   // ==========================================
  303 |   test('4.1 - API Health Check', async () => {
  304 |     console.log('\n=== Testing API Endpoints ===');
  305 |     
  306 |     const apiTests = [
  307 |       { url: '/api/health', name: 'Health' },
  308 |       { url: '/api/auth/session', name: 'Session' },
  309 |       { url: '/api/problems', name: 'Problems' },
  310 |     ];
  311 |     
  312 |     for (const api of apiTests) {
  313 |       try {
  314 |         const response = await page.request.get(`http://localhost:3000${api.url}`);
  315 |         const status = response.status();
  316 |         const isJson = response.headers()['content-type']?.includes('application/json');
  317 |         
  318 |         console.log(`  ${api.name}: ${status} (JSON: ${isJson ? 'YES' : 'NO'})`);
  319 |         
  320 |         if (status >= 500) {
  321 |           await addIssue(`API: ${api.name}`, 'high', 'Server Error', `Status code ${status}`);
  322 |         }
  323 |       } catch (e: any) {
  324 |         console.log(`  ${api.name}: ERROR - ${e.message}`);
  325 |         await addIssue(`API: ${api.name}`, 'critical', 'Connection Error', e.message);
  326 |       }
  327 |     }
  328 |   });
  329 |   
  330 |   // ==========================================
  331 |   // SECTION 5: Console & Network Errors
  332 |   // ==========================================
  333 |   test('5.1 - Console Error Detection', async () => {
  334 |     console.log('\n=== Testing for Console Errors ===');
  335 |     
  336 |     const errors: string[] = [];
  337 |     page.on('console', msg => {
  338 |       if (msg.type() === 'error') {
  339 |         errors.push(msg.text());
  340 |       }
  341 |     });
  342 |     
  343 |     // Visit key pages
  344 |     const pages = ['/', '/auth/login', '/auth/signup'];
  345 |     for (const path of pages) {
  346 |       await page.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle' });
  347 |       await page.waitForTimeout(2000);
  348 |     }
  349 |     
  350 |     console.log(`  Total console errors: ${errors.length}`);
  351 |     
  352 |     if (errors.length > 0) {
  353 |       console.log('  Errors:');
  354 |       errors.slice(0, 5).forEach(e => console.log(`    - ${e.substring(0, 100)}`));
  355 |     }
  356 |     
  357 |     // Filter for critical errors (not warnings)
  358 |     const criticalErrors = errors.filter(e => 
  359 |       e.includes('Error') && 
  360 |       !e.includes('warning') && 
  361 |       !e.includes('Warning') &&
  362 |       !e.includes('Download the React DevTools')
  363 |     );
  364 |     
  365 |     if (criticalErrors.length > 0) {
```