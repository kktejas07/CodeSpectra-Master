import { chromium } from '@playwright/test';

async function setupTestUser() {
  console.log('Creating test user...');
  
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Navigate to login to get CSRF token set
    await page.goto('http://localhost:3000/auth/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    // Get the CSRF token from cookies
    const csrfToken = await page.evaluate(() => {
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [key, value] = cookie.trim().split('=');
        if (key === 'csrf_token') return decodeURIComponent(value);
      }
      return null;
    });
    
    console.log('CSRF Token:', csrfToken ? 'Found' : 'Not found');
    
    if (csrfToken) {
      // Create user via API using fetch
      const response = await page.evaluate(async ({ token, email, password, name }) => {
        const res = await fetch('http://localhost:3000/api/auth/signup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': token,
          },
          body: JSON.stringify({ email, password, name }),
          credentials: 'include',
        });
        return {
          status: res.status,
          body: await res.json()
        };
      }, { token: csrfToken, email: 'testuser@codespectra.io', password: 'Test@123456', name: 'Test User' });
      
      console.log('Signup response status:', response.status);
      console.log('Signup response:', JSON.stringify(response.body));
      
      if (response.status === 200) {
        console.log('✅ Test user created successfully!');
        return { email: 'testuser@codespectra.io', password: 'Test@123456' };
      } else {
        console.log('❌ Signup failed:', response.body.error);
        return null;
      }
    } else {
      console.log('❌ No CSRF token found');
      return null;
    }
  } catch (error) {
    console.error('Error:', error);
    return null;
  } finally {
    await browser.close();
  }
}

setupTestUser().then(result => {
  if (result) {
    console.log('\nTest credentials:');
    console.log('Email:', result.email);
    console.log('Password:', result.password);
  }
  process.exit(result ? 0 : 1);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});