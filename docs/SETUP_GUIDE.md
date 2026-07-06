# CodeSpectra - Setup Guide

## Quick Start for Testing

### Option 1: Automatic Setup (Recommended)

1. **Visit the Setup Page**
   - Go to `/setup` when the app is running
   - Click "Start Setup" button
   - The demo user account will be created automatically
   - Credentials: `demo@codespectra.com` / `DemoPass123!`

### Option 2: Manual Demo Login

1. **Go to Login Page**
   - Navigate to `/auth/login`
   - Scroll down to the "Demo Account" section
   - Click "Auto-fill Demo Credentials"
   - Click "Sign In"
   - Credentials: `demo@codespectra.com` / `DemoPass123!`

### Option 3: Create Your Own Account

1. **Sign Up**
   - Go to `/auth/signup`
   - Enter your email, full name, and password
   - Create your account
   - Use it to explore the platform

## Environment Variables Required

Make sure your `.env.local` file has:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

## Features to Test

Once logged in, you can test:

### 1. **Code Scanner**
   - Go to `/dashboard/scanner`
   - Paste code in any supported language
   - Get AI-powered analysis and feedback
   - Languages supported: JavaScript, Python, Java, C++, TypeScript, C#

### 2. **Coding Arena**
   - Go to `/dashboard/arena`
   - Browse coding challenges by difficulty
   - Solve challenges in your browser
   - Submit and see results

### 3. **Learning Platform**
   - Go to `/dashboard/learning`
   - Browse available courses
   - Track your progress
   - Learn from structured content

### 4. **Leaderboard**
   - Go to `/dashboard/leaderboard`
   - See global rankings
   - Check your position
   - Compete with other developers

### 5. **Achievements**
   - Go to `/dashboard/achievements`
   - View earned badges
   - Track achievement progress
   - See unlock requirements

### 6. **Settings**
   - Go to `/dashboard/settings`
   - Manage your profile
   - Update preferences
   - View account details

### 7. **Admin Panel**
   - Go to `/admin` (admin access required)
   - Manage challenges, courses, and users
   - View platform analytics
   - Content management

## API Routes Available

### Authentication
- `POST /api/auth/login` - Login endpoint
- `POST /api/auth/signup` - Signup endpoint
- `POST /api/setup-demo` - Create demo user

### Code Analysis
- `POST /api/analyze-code` - AI-powered code analysis

## Troubleshooting

### Demo user doesn't login
1. Go to `/setup` and click "Start Setup" to create the demo user
2. Make sure `SUPABASE_SERVICE_ROLE_KEY` is set in environment variables
3. Check that Supabase project is properly initialized

### Can't access dashboard after login
1. Clear browser cookies
2. Make sure you're signed in (check `/api/auth/user`)
3. Verify Supabase session is active

### Features not working
1. Check browser console for errors
2. Verify all environment variables are set
3. Make sure Supabase tables exist (run migration)
4. Check that authentication is working

## Database Schema

The application uses these main tables:
- `profiles` - User profiles
- `challenges` - Coding challenges
- `submissions` - Challenge submissions
- `courses` - Learning courses
- `lessons` - Course lessons
- `leaderboard` - User rankings
- `achievements` - Badge definitions
- `user_achievements` - User achievement progress

## Next Steps

1. ✅ Set up environment variables
2. ✅ Create demo user (via `/setup`)
3. ✅ Test login/signup flows
4. ✅ Explore all pages and features
5. ✅ Test code analysis with sample code
6. ✅ Try submitting challenges
7. ⏭️ Implement backend APIs for:
   - Code execution
   - Challenge evaluation
   - User progress tracking
   - Real-time leaderboard updates

## Support

For issues or questions:
1. Check the browser console for errors
2. Verify all environment variables
3. Review the Supabase logs
4. Check the application logs

Enjoy exploring CodeSpectra! 🚀
