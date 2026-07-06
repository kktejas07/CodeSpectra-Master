# CodeSpectra - Verification Steps

## Pre-Setup Checklist

### 1. Environment Variables
Verify your `.env.local` has all required variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**Where to find these:**
- Go to Supabase Dashboard → Project Settings → API
- Copy URL and anon key for public variables
- Copy service role key (treat as secret!)

### 2. Database Setup
Before trying to login, run the migration:
1. Run: `pnpm dev`
2. Visit: `http://localhost:3000/setup`
3. Click "Start Setup" button

This will:
- Create demo user in Supabase
- Initialize the profiles table entry

## Step-by-Step Verification

### Step 1: App Loads
```
✓ Visit http://localhost:3000
✓ See landing page with CodeSpectra logo
✓ Two CTAs visible: "Try Demo" and "Create Account"
```

### Step 2: Demo Setup
```
✓ Click "Try Demo" button
✓ Redirected to /setup page
✓ See setup instructions
✓ Click "Start Setup" button
✓ See success message: "Setup Complete!"
✓ Automatically redirected to login page after 2 seconds
```

If setup fails:
- [ ] Check `.env.local` has SUPABASE_SERVICE_ROLE_KEY
- [ ] Check browser console for error messages
- [ ] Verify Supabase project is active
- [ ] Confirm you can connect to Supabase in other ways

### Step 3: Demo Login
```
✓ On login page at /auth/login
✓ Scroll down to "Demo Account" section
✓ See credentials displayed:
  - Email: demo@codespectra.com
  - Password: DemoPass123!
✓ Click "Auto-fill Demo Credentials" button
✓ Email and password fields are populated
✓ Click "Sign In" button
✓ See "Login successful!" message
✓ Automatically redirected to /dashboard
```

If login fails:
- [ ] Check email/password are correct
- [ ] Verify demo user was created (go to /setup first)
- [ ] Check browser console for errors
- [ ] Verify NEXT_PUBLIC_SUPABASE_ANON_KEY is correct
- [ ] Confirm Supabase session is working

### Step 4: Dashboard Access
```
✓ Landed on dashboard overview page (/dashboard)
✓ See sidebar with navigation:
  - Overview
  - Coding Arena
  - Code Scanner
  - Learning
  - Leaderboard
  - Achievements
  - Settings
✓ See top bar with user info
✓ See "Sign Out" button in sidebar
```

### Step 5: Navigation Test
Test all sidebar links:

#### Overview (/dashboard)
```
✓ Shows user stats (rank, points, challenges, streak)
✓ Shows quick action cards
✓ See welcome message
```

#### Code Scanner (/dashboard/scanner)
```
✓ Page loads successfully
✓ See code editor
✓ See language selector
✓ Can enter code
✓ Can submit for analysis
```

#### Coding Arena (/dashboard/arena)
```
✓ Page loads
✓ See challenge list
✓ See difficulty badges
✓ Can click on challenge
```

#### Challenge Detail (/dashboard/arena/[id])
```
✓ Shows problem statement
✓ Shows test cases
✓ See code editor
✓ Can select language
✓ Can submit solution
```

#### Learning (/dashboard/learning)
```
✓ See course list
✓ See course cards with difficulty
✓ Can click course to see details
```

#### Course Detail (/dashboard/learning/[id])
```
✓ Shows course name
✓ Shows lessons
✓ See progress tracking
✓ See learning content
```

#### Leaderboard (/dashboard/leaderboard)
```
✓ See user rankings
✓ See points column
✓ See challenges solved
✓ See streak column
✓ Your user listed if you completed challenges
```

#### Achievements (/dashboard/achievements)
```
✓ See achievement badges
✓ See unlock status
✓ See progress indicators
```

#### Settings (/dashboard/settings)
```
✓ Page loads
✓ See user profile section
✓ See account settings
```

### Step 6: Logout Test
```
✓ Click "Sign Out" in sidebar
✓ Confirmation or immediate action
✓ Redirected to /auth/login
✓ Session cleared
```

### Step 7: Admin Panel Access (Optional)
```
✓ Visit /admin to see admin dashboard
✓ See "Admin Dashboard" page
✓ Click Admin navigation links:
  - Users (/admin/users)
  - Challenges (/admin/challenges)
  - Courses (/admin/courses)
✓ Each page loads and shows content
```

### Step 8: Create New Account (Optional)
```
✓ Go to /auth/signup
✓ Fill in:
  - Full Name
  - Email (new email)
  - Password
✓ Click "Sign Up"
✓ See success message
✓ Redirected to login page
✓ Can login with new account
```

## Browser Console Check

While testing, check for errors:

### Good Signs (Expected Messages):
```
✓ No red errors in console
✓ No network 500 errors
✓ Console shows app loading normally
```

### Bad Signs (Need to Fix):
```
✗ "Cannot read property of undefined" 
✗ "Failed to fetch"
✗ "CORS error"
✗ "Supabase environment variable not found"
```

## Network Tab Check

Check API calls are working:

### Expected API Calls:
1. **Login:**
   ```
   POST /api/auth/login → 200 OK
   or uses Supabase directly
   ```

2. **Setup:**
   ```
   POST /api/setup-demo → 200 OK
   Response: { "success": true, "message": "..." }
   ```

3. **Code Analysis (when you try it):**
   ```
   POST /api/analyze-code → 200 OK
   ```

### Checking:
1. Open DevTools (F12)
2. Go to Network tab
3. Perform action (login, setup, etc.)
4. Look for requests to your API
5. Check response status is 200 or 201
6. Click on request to see details

## Responsive Design Check

Test on different screen sizes:

### Desktop (1920px+)
```
✓ Sidebar always visible
✓ Content takes full width
✓ No overflow issues
```

### Tablet (768px - 1024px)
```
✓ Sidebar collapses to hamburger menu
✓ Menu icon visible in top left
✓ Touch targets appropriately sized
```

### Mobile (375px - 767px)
```
✓ Hamburger menu visible and works
✓ All content readable
✓ No horizontal scroll
✓ Forms are easily fillable
```

## Performance Check

### App Load Time
- Should load in under 2 seconds
- Check Network tab → DOMContentLoaded time

### Page Navigation
- Sidebar links should navigate instantly
- No loading spinners unless fetching data

### Responsive Elements
- Hover effects work smoothly
- Buttons have feedback
- Modals/dialogs open smoothly

## Common Issues & Solutions

### Issue: "Cannot find Supabase environment variables"
**Solution:**
1. Check `.env.local` exists in project root
2. Restart dev server: `pnpm dev`
3. Verify variable names are exact:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Issue: Login page shows blank or errors
**Solution:**
1. Check browser console (F12 → Console)
2. Clear browser cache: Ctrl+Shift+Delete
3. Verify all environment variables
4. Restart dev server

### Issue: Setup button doesn't work
**Solution:**
1. Verify `SUPABASE_SERVICE_ROLE_KEY` is set
2. Check API response in Network tab
3. Look for error message in response
4. Verify Supabase project permissions

### Issue: "Session expired" after login
**Solution:**
1. This is normal for testing
2. Login again
3. In production, implement refresh token logic
4. Check Supabase session settings

### Issue: Styling looks broken
**Solution:**
1. Clear CSS cache: Hard refresh (Ctrl+F5)
2. Verify Tailwind CSS is installed: `pnpm install`
3. Check globals.css exists
4. Restart dev server

## Success Criteria Checklist

- [ ] Demo account created successfully
- [ ] Demo user can login
- [ ] Dashboard loads after login
- [ ] All sidebar navigation works
- [ ] All pages load without errors
- [ ] Code Scanner page is functional
- [ ] Coding Arena challenges visible
- [ ] Learning courses display
- [ ] Leaderboard shows rankings
- [ ] Achievements page loads
- [ ] Settings page accessible
- [ ] Logout works correctly
- [ ] Can create new account
- [ ] Responsive design works on mobile
- [ ] No console errors
- [ ] All API calls return 200/201 status

## Next Testing Phase

Once all above steps pass:

1. **Test Code Analysis**
   - Go to Code Scanner
   - Enter sample code
   - Click analyze
   - Check AI response (if API implemented)

2. **Test Challenge Submission**
   - Go to Coding Arena
   - Select a challenge
   - Write solution
   - Submit and check results

3. **Test User Progress**
   - Complete challenges
   - Check leaderboard updates
   - Verify streak tracking
   - Check achievement unlocks

4. **Load Testing**
   - Test with multiple accounts
   - Check performance at scale
   - Monitor database queries

## Documentation References

- **Setup Guide:** `SETUP_GUIDE.md`
- **Auth Implementation:** `AUTH_IMPLEMENTATION.md`
- **API Documentation:** Check API route files in `app/api/`

---

**You're all set!** If all verification steps pass, CodeSpectra is working correctly. 🚀
