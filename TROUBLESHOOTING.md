# CodeSpectra - Troubleshooting Guide

## Login Issues

### "Invalid login credentials" Error

**Cause:** Demo user hasn't been created yet, or credentials are incorrect.

**Solution:**
1. **Visit the Setup Page First**
   - Go to home page → Click "Try Demo"
   - Click "Start Setup" to create the demo user
   - Wait for success message before attempting login

2. **Verify Demo User Creation**
   - After setup success, you should see: "Demo user is ready"
   - Then click the login link or navigate to `/auth/login`

3. **Check Your Credentials**
   - Email: `demo@codespectra.com` (lowercase, exact match)
   - Password: `DemoPass123!` (case-sensitive, includes exclamation mark)
   - Use the "Auto-fill Demo Credentials" button on login page for easy copy

### "User not found" Error

**Cause:** The demo user doesn't exist in Supabase yet.

**Solution:**
1. Go to `/setup` page
2. Click "Start Setup" button
3. Wait for success message (about 3-5 seconds)
4. Then proceed to login

### Still Getting Errors?

**Check Your Environment Variables:**

```bash
# In Vercel project or .env.local file, verify you have:
NEXT_PUBLIC_SUPABASE_URL=your-url-here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**Missing variables?**
1. Go to your Supabase project settings
2. Copy the Project URL
3. Go to API section → Copy anon key and service role key
4. Add these to your environment variables

### Email Confirmation Issues

**Cause:** Email confirmation is required but demo user isn't pre-confirmed.

**Solution:**
- The setup API automatically confirms the email for demo user
- If you see "Please confirm your email" error, try setup again

---

## Signup Issues

### Can't Create a New Account

**Check:**
1. Password requirements met (at least 6 characters recommended)
2. Valid email format
3. Supabase authentication is properly configured
4. Check browser console (F12) for detailed error messages

---

## Dashboard Access Issues

### "Unauthorized" or Redirected to Login

**Cause:** Session expired or authentication not properly initialized.

**Solution:**
1. Try logging out (click Sign Out in sidebar)
2. Clear browser cache/cookies for the domain
3. Log back in using demo credentials
4. If using incognito/private window, close and reopen

### Navigation Links Not Working

**Check:**
1. Ensure you're logged in
2. Verify Supabase session is active
3. Check browser console for any errors (F12)
4. Try refreshing the page

---

## Database Issues

### "Missing database tables" Error

**Cause:** Database schema hasn't been initialized.

**Solution:**
The database tables should be created when you first set up Supabase. If they're missing:

1. Go to your Supabase project
2. Open SQL Editor
3. Copy and run the migration from `/supabase/migrations/20260416000000_create_initial_schema.sql`

### Profile Not Created

**Cause:** User created but profile table insert failed.

**Solution:**
1. The user can still log in without a profile
2. Profile is created automatically on first dashboard access
3. If manual creation is needed, manually insert into profiles table

---

## Browser Console Debugging

**Enable Console Logging:**
1. Open browser DevTools (F12)
2. Click "Console" tab
3. Look for messages starting with `[v0]`

**Common Log Messages:**
- `[v0] Attempting login with email: ...` - Login attempt started
- `[v0] Login result:` - Shows the result object with success/error
- `[v0] Demo user created:` - Demo user successfully created
- `[v0] Starting demo user setup...` - Setup API called

**Helpful Errors:**
- Look for messages containing "Missing Supabase" - environment variables not set
- Look for "Invalid credentials" - wrong email/password
- Look for "User not found" - demo user not created yet

---

## Network Issues

### Slow Loading or Timeouts

**Check:**
1. Internet connection is active
2. Supabase project is accessible
3. Try refreshing the page
4. Check if Supabase status page shows any incidents

### CORS Errors

**Check:**
1. NEXT_PUBLIC_SUPABASE_URL is correct (public URL, not admin)
2. Supabase project settings allow requests from your domain
3. No proxy/VPN interfering with requests

---

## Still Need Help?

**Debug Checklist:**
- [ ] Demo user setup completed successfully?
- [ ] Using correct email: `demo@codespectra.com`?
- [ ] Using correct password: `DemoPass123!`?
- [ ] Environment variables set correctly?
- [ ] Browser console shows any errors?
- [ ] Supabase dashboard shows the demo user in Auth section?
- [ ] Database tables created in Supabase?

**Next Steps:**
1. Check all items in the checklist
2. Review console errors (F12)
3. Try incognito/private browser window
4. Clear browser cache and cookies
5. Verify Supabase project is active and not paused

---

## Quick Reference

### File Locations
- Environment variables: `.env.local` or Vercel project settings
- Migration script: `/supabase/migrations/20260416000000_create_initial_schema.sql`
- Auth service: `/lib/auth-service.ts`
- Setup API: `/app/api/setup-demo/route.ts`

### Important Endpoints
- Setup: http://localhost:3000/setup
- Login: http://localhost:3000/auth/login
- Signup: http://localhost:3000/auth/signup
- Dashboard: http://localhost:3000/dashboard

### Environment Variables Required
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```
