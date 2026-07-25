# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/auth/auth.spec.ts >> Authentication Tests >> Signup/Registration >> should navigate to login page
- Location: tests/auth/auth.spec.ts:193:9

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "/login"
Received string:    "http://localhost:3000/auth/signup"
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - complementary [ref=e3]:
      - link "CodeSpectra" [ref=e5] [cursor=pointer]:
        - /url: /
      - generic [ref=e12]:
        - generic [ref=e13]: Join 10,000+ developers leveling up
        - heading "Your code, graded. Your skills, ranked." [level=1] [ref=e17]: Your code, graded.Your skills, ranked.
        - paragraph [ref=e18]: "Get a free CodeSpectra account: unlimited code scans, AI fixes, and access to the coding arena with real test cases across 40+ languages."
        - generic [ref=e19]:
          - generic [ref=e20]: Unlimited code quality scans on your repos
          - generic [ref=e27]: Daily coding challenges with real-time judging
          - generic [ref=e32]: Climb the leaderboard, earn ranks and badges
          - generic [ref=e37]: GitHub integration in two clicks
        - generic [ref=e43]:
          - generic [ref=e44]:
            - generic [ref=e45]: 40+
            - generic [ref=e46]: Languages
          - generic [ref=e47]:
            - generic [ref=e48]: 180K
            - generic [ref=e49]: Daily scans
          - generic [ref=e50]:
            - generic [ref=e51]: 2.4M
            - generic [ref=e52]: Issues fixed
      - generic [ref=e53]:
        - generic [ref=e54]: © 2026 CodeSpectra
        - link "← Back to home" [ref=e55] [cursor=pointer]:
          - /url: /
    - main [ref=e56]:
      - generic [ref=e57]:
        - generic [ref=e58]:
          - heading "Create your account" [level=2] [ref=e59]
          - paragraph [ref=e60]:
            - text: Already have one?
            - link "Sign in" [active] [ref=e61] [cursor=pointer]:
              - /url: /auth/login
        - generic [ref=e62]:
          - button "Google" [ref=e63]
          - button "GitHub" [ref=e64]
        - generic [ref=e65]: or use your email
        - generic [ref=e70]:
          - generic [ref=e71]:
            - generic [ref=e72]: Full name
            - textbox "Full name" [ref=e77]:
              - /placeholder: John Doe
          - generic [ref=e78]:
            - generic [ref=e79]: Email
            - textbox "Email" [ref=e84]:
              - /placeholder: you@example.com
          - generic [ref=e85]:
            - generic [ref=e86]: Password
            - generic [ref=e87]:
              - textbox "Password" [ref=e91]:
                - /placeholder: At least 8 characters
              - button [ref=e92]
            - paragraph [ref=e96]: Min 8 characters.
          - generic [ref=e97]:
            - generic [ref=e98]: Confirm password
            - generic [ref=e99]:
              - textbox "Confirm password" [ref=e103]:
                - /placeholder: Repeat your password
              - button [ref=e104]
          - button "Create free account" [ref=e108]
        - paragraph [ref=e109]:
          - text: By signing up you agree to our
          - link "Terms" [ref=e110] [cursor=pointer]:
            - /url: /terms
          - text: and
          - link "Privacy Policy" [ref=e111] [cursor=pointer]:
            - /url: /privacy
          - text: .
  - button "Open Next.js Dev Tools" [ref=e117] [cursor=pointer]
  - alert [ref=e121]
```

# Test source

```ts
  97  |       expect(page.url()).toContain('/signup');
  98  |     });
  99  | 
  100 |     test('should login with remember me checked', async ({ page }) => {
  101 |       await loginPage.navigate();
  102 |       await loginPage.emailInput.fill('test@codespectra.io');
  103 |       await loginPage.passwordInput.fill('Test@123456');
  104 |       await loginPage.rememberMeCheckbox.check();
  105 |       await loginPage.submitButton.click();
  106 |       
  107 |       await page.waitForLoadState('networkidle');
  108 |       expect(page.url()).not.toContain('/login');
  109 |     });
  110 |   });
  111 | 
  112 |   test.describe('Signup/Registration', () => {
  113 |     test('should display signup form correctly', async ({ page }) => {
  114 |       await signupPage.navigate();
  115 |       
  116 |       await expect(page.locator('input[name="name"]')).toBeVisible();
  117 |       await expect(page.locator('input[name="email"]')).toBeVisible();
  118 |       await expect(page.locator('input[name="password"]')).toBeVisible();
  119 |       await expect(page.locator('button[type="submit"]')).toBeVisible();
  120 |     });
  121 | 
  122 |     test('should signup with valid data', async ({ page }) => {
  123 |       const email = DataGenerator.randomEmail();
  124 |       await signupPage.signup('Test User', email, 'Test@123456', true);
  125 |       
  126 |       await page.waitForTimeout(2000);
  127 |       const url = page.url();
  128 |       expect(url).not.toContain('/signup') || url.includes('/verify');
  129 |     });
  130 | 
  131 |     test('should fail signup with existing email', async ({ page }) => {
  132 |       await signupPage.navigate();
  133 |       await signupPage.nameInput.fill('Test User');
  134 |       await signupPage.emailInput.fill('test@codespectra.io');
  135 |       await signupPage.passwordInput.fill('Test@123456');
  136 |       await signupPage.confirmPasswordInput.fill('Test@123456');
  137 |       
  138 |       if (await signupPage.termsCheckbox.isVisible()) {
  139 |         await signupPage.termsCheckbox.check();
  140 |       }
  141 |       await signupPage.submitButton.click();
  142 |       
  143 |       await page.waitForTimeout(1000);
  144 |       const errorVisible = await signupPage.errorMessage.isVisible().catch(() => false);
  145 |       expect(errorVisible || page.url().includes('/signup')).toBeTruthy();
  146 |     });
  147 | 
  148 |     test('should fail signup with mismatched passwords', async ({ page }) => {
  149 |       await signupPage.navigate();
  150 |       await signupPage.nameInput.fill('Test User');
  151 |       await signupPage.emailInput.fill(DataGenerator.randomEmail());
  152 |       await signupPage.passwordInput.fill('Test@123456');
  153 |       await signupPage.confirmPasswordInput.fill('Different@123456');
  154 |       
  155 |       if (await signupPage.termsCheckbox.isVisible()) {
  156 |         await signupPage.termsCheckbox.check();
  157 |       }
  158 |       await signupPage.submitButton.click();
  159 |       
  160 |       await expect(page.locator('input[name="confirmPassword"], input[id="confirmPassword"]')).toBeInvalid();
  161 |     });
  162 | 
  163 |     test('should fail signup with weak password', async ({ page }) => {
  164 |       await signupPage.navigate();
  165 |       await signupPage.nameInput.fill('Test User');
  166 |       await signupPage.emailInput.fill(DataGenerator.randomEmail());
  167 |       await signupPage.passwordInput.fill('123');
  168 |       await signupPage.confirmPasswordInput.fill('123');
  169 |       
  170 |       if (await signupPage.termsCheckbox.isVisible()) {
  171 |         await signupPage.termsCheckbox.check();
  172 |       }
  173 |       await signupPage.submitButton.click();
  174 |       
  175 |       await expect(page.locator('input[name="password"]')).toBeInvalid();
  176 |     });
  177 | 
  178 |     test('should fail signup with empty name', async ({ page }) => {
  179 |       await signupPage.navigate();
  180 |       await signupPage.emailInput.fill(DataGenerator.randomEmail());
  181 |       await signupPage.passwordInput.fill('Test@123456');
  182 |       await signupPage.confirmPasswordInput.fill('Test@123456');
  183 |       await signupPage.submitButton.click();
  184 |       
  185 |       await expect(page.locator('input[name="name"]')).toBeInvalid();
  186 |     });
  187 | 
  188 |     test('should have login link', async ({ page }) => {
  189 |       await signupPage.navigate();
  190 |       await expect(signupPage.loginLink).toBeVisible();
  191 |     });
  192 | 
  193 |     test('should navigate to login page', async ({ page }) => {
  194 |       await signupPage.navigate();
  195 |       await signupPage.loginLink.click();
  196 |       await page.waitForLoadState('networkidle');
> 197 |       expect(page.url()).toContain('/login');
      |                          ^ Error: expect(received).toContain(expected) // indexOf
  198 |     });
  199 | 
  200 |     test('should fail signup without accepting terms', async ({ page }) => {
  201 |       await signupPage.navigate();
  202 |       await signupPage.nameInput.fill('Test User');
  203 |       await signupPage.emailInput.fill(DataGenerator.randomEmail());
  204 |       await signupPage.passwordInput.fill('Test@123456');
  205 |       await signupPage.confirmPasswordInput.fill('Test@123456');
  206 |       await signupPage.submitButton.click();
  207 |       
  208 |       const termsCheckbox = page.locator('input[name="terms"], input[type="checkbox"]').first();
  209 |       if (await termsCheckbox.isVisible()) {
  210 |         await expect(termsCheckbox).toBeInvalid();
  211 |       }
  212 |     });
  213 |   });
  214 | 
  215 |   test.describe('Forgot Password', () => {
  216 |     test('should display forgot password form', async ({ page }) => {
  217 |       await forgotPasswordPage.navigate();
  218 |       
  219 |       await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
  220 |       await expect(page.locator('button[type="submit"]')).toBeVisible();
  221 |     });
  222 | 
  223 |     test('should submit forgot password request', async ({ page }) => {
  224 |       await forgotPasswordPage.navigate();
  225 |       await forgotPasswordPage.emailInput.fill('test@codespectra.io');
  226 |       await forgotPasswordPage.submitButton.click();
  227 |       
  228 |       await page.waitForTimeout(2000);
  229 |       const url = page.url();
  230 |       const successShown = await forgotPasswordPage.successMessage.isVisible().catch(() => false);
  231 |       expect(successShown || !url.includes('/forgot')).toBeTruthy();
  232 |     });
  233 | 
  234 |     test('should show error for non-existent email', async ({ page }) => {
  235 |       await forgotPasswordPage.navigate();
  236 |       await forgotPasswordPage.emailInput.fill('nonexistent@test.com');
  237 |       await forgotPasswordPage.submitButton.click();
  238 |       
  239 |       await page.waitForTimeout(1000);
  240 |       const errorShown = await forgotPasswordPage.errorMessage.isVisible().catch(() => false);
  241 |       expect(errorShown).toBeTruthy();
  242 |     });
  243 | 
  244 |     test('should have back to login link', async ({ page }) => {
  245 |       await forgotPasswordPage.navigate();
  246 |       await expect(forgotPasswordPage.backToLoginLink).toBeVisible();
  247 |     });
  248 | 
  249 |     test('should navigate to login from back link', async ({ page }) => {
  250 |       await forgotPasswordPage.navigate();
  251 |       await forgotPasswordPage.backToLoginLink.click();
  252 |       await page.waitForLoadState('networkidle');
  253 |       expect(page.url()).toContain('/login');
  254 |     });
  255 |   });
  256 | 
  257 |   test.describe('Session Expiration', () => {
  258 |     test('should detect session timeout', async ({ page }) => {
  259 |       await loginPage.login('test@codespectra.io', 'Test@123456');
  260 |       await page.waitForLoadState('networkidle');
  261 |       
  262 |       await page.evaluate(() => {
  263 |         localStorage.clear();
  264 |         sessionStorage.clear();
  265 |       });
  266 |       
  267 |       await page.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`);
  268 |       await page.waitForLoadState('networkidle');
  269 |       
  270 |       const url = page.url();
  271 |       if (url.includes('/dashboard')) {
  272 |         console.log('Session may still be valid or redirect not working');
  273 |       }
  274 |     });
  275 |   });
  276 | });
```