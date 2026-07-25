# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/forms/forms.spec.ts >> Forms Validation Tests >> Radio Buttons >> should select radio option
- Location: tests/forms/forms.spec.ts:309:9

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: Target page, context or browser has been closed
Call log:
  - navigating to "http://localhost:3000/dashboard/settings", waiting until "load"

```

# Test source

```ts
  210 |   });
  211 | 
  212 |   test.describe('Text Length Validation', () => {
  213 |     test('should enforce max length', async ({ page, authenticatedPage }) => {
  214 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/profile`);
  215 |       await authenticatedPage.waitForLoadState('networkidle');
  216 |       
  217 |       const textareas = authenticatedPage.locator('textarea[maxlength]');
  218 |       const count = await textareas.count();
  219 |       
  220 |       if (count > 0) {
  221 |         const maxLength = await textareas.first().getAttribute('maxlength');
  222 |         if (maxLength) {
  223 |           const longText = 'a'.repeat(parseInt(maxLength) + 100);
  224 |           await textareas.first().fill(longText);
  225 |           const value = await textareas.first().inputValue();
  226 |           expect(value.length).toBeLessThanOrEqual(parseInt(maxLength));
  227 |         }
  228 |       }
  229 |     });
  230 | 
  231 |     test('should show character count', async ({ page, authenticatedPage }) => {
  232 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/profile`);
  233 |       await authenticatedPage.waitForLoadState('networkidle');
  234 |       
  235 |       const textarea = authenticatedPage.locator('textarea').first();
  236 |       const characterCount = authenticatedPage.locator('[class*="char-count"], [class*="character"]').first();
  237 |       
  238 |       if (await textarea.isVisible() && await characterCount.isVisible()) {
  239 |         console.log('Character count is displayed');
  240 |       }
  241 |     });
  242 |   });
  243 | 
  244 |   test.describe('Dropdowns', () => {
  245 |     test('should have default selection', async ({ page, authenticatedPage }) => {
  246 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/settings`);
  247 |       await authenticatedPage.waitForLoadState('networkidle');
  248 |       
  249 |       const selects = authenticatedPage.locator('select');
  250 |       const count = await selects.count();
  251 |       
  252 |       if (count > 0) {
  253 |         const firstOption = await selects.first().locator('option').first().textContent();
  254 |         console.log('Default selection:', firstOption);
  255 |       }
  256 |     });
  257 | 
  258 |     test('should allow option selection', async ({ page, authenticatedPage }) => {
  259 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/settings`);
  260 |       await authenticatedPage.waitForLoadState('networkidle');
  261 |       
  262 |       const selects = authenticatedPage.locator('select');
  263 |       const count = await selects.count();
  264 |       
  265 |       if (count > 0) {
  266 |         const options = await selects.first().locator('option').allTextContents();
  267 |         if (options.length > 1) {
  268 |           await selects.first().selectOption({ index: 1 });
  269 |           const value = await selects.first().inputValue();
  270 |           expect(value).toBeTruthy();
  271 |         }
  272 |       }
  273 |     });
  274 |   });
  275 | 
  276 |   test.describe('Checkboxes', () => {
  277 |     test('should toggle checkbox on click', async ({ page, authenticatedPage }) => {
  278 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/settings`);
  279 |       await authenticatedPage.waitForLoadState('networkidle');
  280 |       
  281 |       const checkbox = authenticatedPage.locator('input[type="checkbox"]').first();
  282 |       if (await checkbox.isVisible()) {
  283 |         const initialState = await checkbox.isChecked();
  284 |         await checkbox.click();
  285 |         const newState = await checkbox.isChecked();
  286 |         expect(newState).not.toBe(initialState);
  287 |       }
  288 |     });
  289 | 
  290 |     test('should allow multiple checkbox selection', async ({ page, authenticatedPage }) => {
  291 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/notifications/preferences`);
  292 |       await authenticatedPage.waitForLoadState('networkidle');
  293 |       
  294 |       const checkboxes = authenticatedPage.locator('input[type="checkbox"]');
  295 |       const count = await checkboxes.count();
  296 |       
  297 |       if (count > 1) {
  298 |         await checkboxes.nth(0).check();
  299 |         await checkboxes.nth(1).check();
  300 |         
  301 |         const isChecked1 = await checkboxes.nth(0).isChecked();
  302 |         const isChecked2 = await checkboxes.nth(1).isChecked();
  303 |         expect(isChecked1 && isChecked2).toBeTruthy();
  304 |       }
  305 |     });
  306 |   });
  307 | 
  308 |   test.describe('Radio Buttons', () => {
  309 |     test('should select radio option', async ({ page, authenticatedPage }) => {
> 310 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/settings`);
      |                               ^ Error: page.goto: Target page, context or browser has been closed
  311 |       await authenticatedPage.waitForLoadState('networkidle');
  312 |       
  313 |       const radios = authenticatedPage.locator('input[type="radio"]');
  314 |       const count = await radios.count();
  315 |       
  316 |       if (count > 0) {
  317 |         await radios.first().check();
  318 |         const isChecked = await radios.first().isChecked();
  319 |         expect(isChecked).toBeTruthy();
  320 |       }
  321 |     });
  322 | 
  323 |     test('should deselect other radios in group', async ({ page, authenticatedPage }) => {
  324 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/settings`);
  325 |       await authenticatedPage.waitForLoadState('networkidle');
  326 |       
  327 |       const radios = authenticatedPage.locator('input[type="radio"][name]');
  328 |       const count = await radios.count();
  329 |       
  330 |       if (count > 1) {
  331 |         const firstName = await radios.first().getAttribute('name');
  332 |         const sameGroup = radios.filter({ has: page.locator(`input[name="${firstName}"]`) });
  333 |         const groupCount = await sameGroup.count();
  334 |         
  335 |         if (groupCount > 1) {
  336 |           await sameGroup.nth(0).check();
  337 |           await sameGroup.nth(1).check();
  338 |           
  339 |           const secondChecked = await sameGroup.nth(1).isChecked();
  340 |           expect(secondChecked).toBeTruthy();
  341 |         }
  342 |       }
  343 |     });
  344 |   });
  345 | 
  346 |   test.describe('File Uploads', () => {
  347 |     test('should have file input', async ({ page, authenticatedPage }) => {
  348 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/profile`);
  349 |       await authenticatedPage.waitForLoadState('networkidle');
  350 |       
  351 |       const fileInput = authenticatedPage.locator('input[type="file"]');
  352 |       const count = await fileInput.count();
  353 |       console.log(`Found ${count} file inputs`);
  354 |     });
  355 | 
  356 |     test('should accept valid file types', async ({ page, authenticatedPage }) => {
  357 |       const fileInput = authenticatedPage.locator('input[type="file"]').first();
  358 |       if (await fileInput.isVisible()) {
  359 |         const accept = await fileInput.getAttribute('accept');
  360 |         console.log('Accepted file types:', accept);
  361 |       }
  362 |     });
  363 | 
  364 |     test('should show selected file name', async ({ page, authenticatedPage }) => {
  365 |       await authenticatedPage.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/dashboard/profile`);
  366 |       await authenticatedPage.waitForLoadState('networkidle');
  367 |       
  368 |       const fileInput = authenticatedPage.locator('input[type="file"]').first();
  369 |       if (await fileInput.isVisible()) {
  370 |         await fileInput.setInputFiles({
  371 |           name: 'test.txt',
  372 |           mimeType: 'text/plain',
  373 |           buffer: Buffer.from('test content'),
  374 |         });
  375 |         
  376 |         const fileNameDisplay = authenticatedPage.locator('[class*="file-name"], [class*="filename"]').first();
  377 |         const hasFileName = await fileNameDisplay.isVisible().catch(() => false);
  378 |         console.log('File name displayed:', hasFileName);
  379 |       }
  380 |     });
  381 |   });
  382 | });
```