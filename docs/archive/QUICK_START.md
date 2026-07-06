# CodeSpectra - Quick Start Guide

## 🚀 Local Development (5 minutes)

### Prerequisites
- Node.js 18+ installed
- pnpm package manager
- Supabase account (database already set up)

### Setup

```bash
# 1. Navigate to project
cd codespectra

# 2. Install dependencies
pnpm install

# 3. Environment variables (already configured)
# Check .env.local exists with Supabase credentials

# 4. Start development server
pnpm dev

# 5. Open browser
# Go to http://localhost:3000
```

## 📊 Database Status

✓ **Connected to Supabase**
- All environment variables configured
- PostgreSQL database active
- Authentication enabled
- Row-Level Security configured

## 👥 Demo Accounts

After running `/setup`:

| Role | Email | Password |
|------|-------|----------|
| Superadmin | superadmin@codespectra.com | SuperAdmin123! |
| Admin | admin@codespectra.com | TenantAdmin123! |
| User | demo@codespectra.com | DemoPass123! |

## 🗂️ Project Structure

```
Frontend:     app/ + components/
Backend:      app/api/
Database:     Supabase (PostgreSQL)
Utils:        lib/
Config:       next.config.mjs, tailwind.config.ts
```

## 🔧 Key Commands

```bash
pnpm dev       # Start development server
pnpm build     # Build for production
pnpm start     # Start production server
pnpm lint      # Run ESLint
```

## 📱 Features

- ✓ Authentication (Email, Face, OAuth)
- ✓ RBAC (3 roles: Superadmin, Admin, User)
- ✓ Code Analysis & Scanner
- ✓ Leaderboard & Achievements
- ✓ Team Management
- ✓ Real-time Notifications
- ✓ Theme Support (Light/Dark)
- ✓ Responsive Design

## 🚀 Deploy to VPS

See `DEPLOYMENT_GUIDE.md` for:
- Self-hosted VPS setup
- Docker deployment
- Docker Compose setup
- Production checklist

## 🆘 Troubleshooting

**Port 3000 already in use?**
```bash
lsof -i :3000
kill -9 <PID>
```

**Database connection error?**
```bash
# Check .env.local has Supabase variables
cat .env.local

# Test connection
node -e "require('@supabase/supabase-js')"
```

**Module not found?**
```bash
pnpm install
rm -rf node_modules/.pnpm
pnpm install --force
```

---

**Ready to go!** 🎉
