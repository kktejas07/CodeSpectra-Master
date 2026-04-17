# CodeSpectra - Complete Deployment & Architecture Guide

## Project Overview

Your project **CodeSpectra** is a full-stack AI-powered code analysis platform with the following architecture:

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 16)                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ - React 19 Components (TypeScript)                         │ │
│  │ - Pages: /app (50+ pages)                                  │ │
│  │ - Components: /components (100+ reusable components)       │ │
│  │ - UI Library: shadcn/ui with Radix UI                     │ │
│  │ - Styling: Tailwind CSS v4 + Custom themes                │ │
│  │ - Real-time: WebSockets ready                              │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (Next.js API Routes)                │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ - 40+ API Routes (/app/api)                                │ │
│  │ - Authentication (Email, Face Recognition, OAuth)         │ │
│  │ - Code Analysis Integration (SonarQube, GitHub)            │ │
│  │ - Billing & Subscription Management                        │ │
│  │ - Notifications & Email System                             │ │
│  │ - Team & Role Management                                   │ │
│  │ - Middleware: Rate limiting, RBAC, Auth checks             │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  DATABASE (Supabase PostgreSQL)                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ - Authentication (Built-in JWT)                            │ │
│  │ - Profiles Table (Users, Roles, Permissions)              │ │
│  │ - Teams & Organizations                                    │ │
│  │ - Code Scans & Analysis Results                            │ │
│  │ - Billing & Subscriptions                                  │ │
│  │ - Notifications & Preferences                              │ │
│  │ - Row-Level Security (RLS) Enabled                         │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
codespectra/
├── app/                          # Next.js App Router
│   ├── page.tsx                 # Landing Page
│   ├── setup/                   # Demo Setup Page
│   ├── auth/                    # Authentication Pages
│   │   ├── login/
│   │   ├── signup/
│   │   └── layout.tsx
│   ├── dashboard/               # Main Dashboard
│   │   ├── layout.tsx           # Dashboard Layout with RBAC
│   │   ├── page.tsx             # User Dashboard
│   │   ├── admin/               # Admin Section
│   │   │   ├── system/          # Superadmin Dashboard
│   │   │   ├── team/            # Tenant Admin Dashboard
│   │   │   └── page.tsx
│   │   ├── arena/               # Coding Challenges
│   │   ├── scanner/             # Code Scanner
│   │   ├── learning/            # Learning Path
│   │   ├── leaderboard/         # Global Leaderboard
│   │   ├── achievements/        # Achievements & Badges
│   │   ├── profile/             # User Profile
│   │   ├── settings/            # User Settings
│   │   └── notifications/       # Notifications Center
│   ├── admin/                   # Old Admin (Deprecated)
│   ├── pricing/                 # Pricing Page
│   ├── docs/                    # Documentation
│   ├── api/                     # API Routes (40+)
│   │   ├── auth/
│   │   ├── analyze-code/
│   │   ├── notifications/
│   │   ├── billing/
│   │   ├── team/
│   │   ├── integrations/
│   │   └── ...
│   └── layout.tsx               # Root Layout
│
├── components/                   # React Components (100+)
│   ├── ui/                      # shadcn/ui Components
│   ├── dashboard/               # Dashboard Components
│   ├── code-scanner/            # Scanner Components
│   ├── auth/                    # Auth Components
│   ├── breadcrumbs.tsx          # Breadcrumb Navigation
│   ├── command-menu.tsx         # Global Search (Cmd+K)
│   ├── theme-switcher.tsx       # Theme Toggle
│   └── ...
│
├── lib/                         # Utilities & Helpers
│   ├── auth-service.ts          # Authentication Logic
│   ├── supabase-client.ts       # Supabase Client
│   ├── rbac.ts                  # Role-Based Access Control
│   ├── utils.ts                 # Utility Functions
│   └── ...
│
├── supabase/                    # Database Configuration
│   └── migrations/              # SQL Migrations
│
├── public/                      # Static Assets
│   ├── images/
│   ├── fonts/
│   └── ...
│
├── middleware.ts                # Next.js Middleware (Auth checks)
├── next.config.mjs              # Next.js Configuration
├── tailwind.config.ts           # Tailwind CSS Config
├── tsconfig.json                # TypeScript Config
└── package.json                 # Dependencies

```

## Technology Stack

### Frontend
- **Framework**: Next.js 16 (App Router, Turbopack)
- **UI**: React 19 + TypeScript
- **Components**: shadcn/ui (125+ components)
- **Styling**: Tailwind CSS v4 + Custom theme system
- **State**: React Hooks + SWR for data fetching
- **3D Graphics**: Three.js + React Three Fiber
- **Forms**: React Hook Form + Zod validation

### Backend
- **Runtime**: Node.js (via Next.js)
- **API Routes**: Next.js API Routes (40+ endpoints)
- **Authentication**: Supabase Auth (JWT tokens)
- **Database ORM**: Direct Supabase client (no Prisma)
- **Real-time**: Supabase Real-time subscriptions

### Database
- **Provider**: Supabase (PostgreSQL)
- **Auth**: Built-in Supabase Auth
- **Security**: Row-Level Security (RLS)
- **Migrations**: SQL files in /supabase/migrations
- **Connection**: @supabase/supabase-js client

### External Integrations
- **GitHub**: OAuth + Repository access
- **Google**: OAuth
- **Code Analysis**: SonarQube, GitHub Code Scanning
- **Email**: Supabase built-in email
- **Billing**: Stripe (prepared)
- **File Storage**: Vercel Blob (prepared)

## Key Features

1. **Authentication**
   - Email/Password login
   - Face Recognition (facial biometrics)
   - OAuth (GitHub, Google)
   - JWT token-based sessions
   - 2FA ready

2. **Role-Based Access Control (RBAC)**
   - Superadmin: System-wide control
   - Admin (Tenant): Team management
   - User: Regular access
   - Dynamic menu based on roles
   - Route protection with middleware

3. **Code Analysis**
   - Real-time code scanning
   - GitHub integration
   - Code quality metrics
   - Quick fixes suggestions
   - Detailed diagnostics

4. **Learning Platform**
   - Coding challenges (Arena)
   - Learning paths
   - Achievements & badges
   - Leaderboard (Global, Team, Monthly)
   - Certification ready

5. **Admin Features**
   - User management
   - Role assignment
   - System settings
   - Analytics dashboard
   - Audit logs

## Database Connection Status

✓ **Supabase Connected** - All environment variables configured
  - NEXT_PUBLIC_SUPABASE_URL: Set
  - NEXT_PUBLIC_SUPABASE_ANON_KEY: Set
  - SUPABASE_SERVICE_ROLE_KEY: Set
  - Database: PostgreSQL (Connected)
  - Authentication: JWT enabled

## Installation & Setup

### Local Development

```bash
# 1. Install dependencies
pnpm install

# 2. Set up environment variables
cp .env.example .env.local

# 3. Run database migrations (already done via Supabase dashboard)

# 4. Start dev server
pnpm dev

# 5. Visit http://localhost:3000
# Demo credentials available at /setup
```

### Run Demo Setup
- Navigate to `/setup` page
- Click "Run Setup" to create demo users:
  - Superadmin: superadmin@codespectra.com / SuperAdmin123!
  - Admin: admin@codespectra.com / TenantAdmin123!
  - User: demo@codespectra.com / DemoPass123!

## VPS Deployment Guide

### Option 1: Self-Hosted on VPS (Ubuntu/Debian)

#### Prerequisites
- VPS with 2GB RAM minimum (4GB recommended)
- Node.js 18+ installed
- PostgreSQL 14+ (or connect to external Supabase)
- Nginx or Apache as reverse proxy
- SSL certificate (Let's Encrypt)

#### Step-by-Step Setup

```bash
# 1. SSH into VPS
ssh root@your_vps_ip

# 2. Update system
apt update && apt upgrade -y

# 3. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt install -y nodejs

# 4. Install pnpm
npm install -g pnpm

# 5. Clone repository
git clone https://github.com/yourusername/codespectra.git
cd codespectra

# 6. Install dependencies
pnpm install

# 7. Set up environment variables
nano .env.local

# Add these variables:
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# 8. Build Next.js app
pnpm build

# 9. Install PM2 for process management
npm install -g pm2

# 10. Start application
pm2 start pnpm --name "codespectra" -- start
pm2 save
pm2 startup

# 11. Configure Nginx
sudo nano /etc/nginx/sites-available/codespectra

# Add configuration:
server {
    listen 80;
    server_name your_domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# 12. Enable site
sudo ln -s /etc/nginx/sites-available/codespectra /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# 13. Set up SSL (Let's Encrypt)
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your_domain.com

# 14. Set up automated backups
crontab -e

# Add daily backup (at 2 AM):
0 2 * * * pg_dump -U postgres codespectra > /backups/db-$(date +%Y%m%d).sql

# 15. Monitor application
pm2 logs
pm2 monit
```

### Option 2: Docker Deployment

```dockerfile
# Create Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN pnpm install
COPY . .
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
```

```bash
# Build and run
docker build -t codespectra .
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL=your_url \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key \
  -e SUPABASE_SERVICE_ROLE_KEY=your_key \
  codespectra
```

### Option 3: Docker Compose (Recommended)

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
    restart: always
    
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - app
```

### Environment Variables Needed

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=your_jwt_secret

# Database (if not using Supabase)
DATABASE_URL=postgresql://user:password@localhost:5432/codespectra

# External Services
GITHUB_CLIENT_ID=your_github_id
GITHUB_CLIENT_SECRET=your_github_secret
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Email (optional)
SENDGRID_API_KEY=SG.xxx

# Analytics
NEXT_PUBLIC_GA_ID=G-xxx
```

## Production Checklist

- [ ] Environment variables configured
- [ ] Database backups set up
- [ ] SSL/TLS certificates installed
- [ ] Rate limiting configured
- [ ] CORS settings updated
- [ ] CSRF protection enabled
- [ ] Monitoring & alerting set up
- [ ] Log aggregation configured
- [ ] CDN for static assets (optional)
- [ ] Performance optimized (images, code splitting)
- [ ] Security headers added (Nginx/Apache)
- [ ] Database replicated/backed up
- [ ] Error tracking (Sentry) configured
- [ ] Analytics integrated
- [ ] Automated deployments set up

## Vercel Deployment (Recommended)

Easiest option - click "Deploy" on Vercel:

1. Push code to GitHub
2. Connect repo to Vercel
3. Set environment variables
4. Auto-deploys on push
5. Zero configuration needed

## Performance Optimization

- **Next.js Optimizations**: Image optimization, code splitting, lazy loading
- **Database**: Indexes on frequently queried columns, connection pooling
- **Caching**: Browser cache, CDN for static assets, Redis for sessions
- **Monitoring**: Real-time error tracking, performance metrics

## Scaling Strategy

1. **Vertical**: Increase VPS resources (RAM, CPU)
2. **Horizontal**: Load balancing across multiple instances
3. **Database**: Connection pooling, read replicas
4. **CDN**: Cloudflare, AWS CloudFront for static assets
5. **Caching**: Redis layer for sessions & real-time data

## Support & Resources

- **Documentation**: `/app/docs` page
- **GitHub**: Repository with issue tracking
- **Supabase Docs**: https://supabase.com/docs
- **Next.js Docs**: https://nextjs.org/docs

---

**Status**: Production Ready ✓
**Last Updated**: April 17, 2026
