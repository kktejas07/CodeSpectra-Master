# Phase 6 & 7 - Implementation & Testing Guide

## Phase 6: Connect APIs to Supabase (Status: In Progress)

### Completed:
- Enhanced Supabase client with helpers (`lib/supabase-client.ts`)
- Updated Jobs API to use Supabase queries
- Pattern established for remaining 54 endpoints

### Pattern to Follow for Remaining APIs:

All API endpoints should follow this pattern:

```typescript
import { NextResponse, NextRequest } from 'next/server'
import { supabaseServer } from '@/lib/supabase-client'

export async function GET(request: NextRequest) {
  try {
    // 1. Get auth user if needed
    const { data: { user } } = await supabaseServer.auth.getUser()
    
    // 2. Build Supabase query
    let query = supabaseServer.from('table_name').select('*')
    
    // 3. Apply filters, pagination, ordering
    query = query.order('created_at', { ascending: false })
    const { data, error, count } = await query.range(0, 9)
    
    // 4. Handle error
    if (error) throw error
    
    // 5. Return response
    return NextResponse.json({ data: data || [], pagination: { total: count } })
  } catch (error) {
    console.error('[v0] API error:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}
```

### API Endpoints to Update (54 remaining):

**Jobs (completed):**
- ✓ GET /api/jobs
- [ ] GET /api/jobs/[id]
- [ ] POST /api/jobs/[id]
- [ ] DELETE /api/jobs/[id]
- [ ] POST /api/jobs/[id]/apply
- [ ] GET /api/jobs/applications

**Exams:**
- [ ] GET /api/exams
- [ ] GET /api/exams/[id]
- [ ] POST /api/exams
- [ ] POST /api/exams/[id]/submit
- [ ] GET /api/exams/[id]/results

**Codeathons:**
- [ ] GET /api/codeathons
- [ ] GET /api/codeathons/[id]
- [ ] POST /api/codeathons
- [ ] POST /api/codeathons/[id]/register
- [ ] GET /api/codeathons/[id]/leaderboard

**Resumes:**
- [ ] GET /api/resumes
- [ ] GET /api/resumes/[id]
- [ ] POST /api/resumes
- [ ] DELETE /api/resumes/[id]

**Billing:**
- [ ] GET /api/billing/plans
- [ ] GET /api/billing/subscription
- [ ] POST /api/billing/subscription
- [ ] GET /api/billing/invoices

**Other (25+ endpoints for integrations, notifications, etc.)**

### Implementation Priority:

1. **Critical (do first)**: Jobs, Exams, Codeathons, Resumes
2. **Important**: Billing, Subscriptions
3. **Nice-to-have**: Integrations, Notifications, Analytics

---

## Phase 7: Testing & Verification

### Pre-Testing Checklist:

Before running tests, ensure:

```bash
# 1. Environment variables set
export NEXT_PUBLIC_SUPABASE_URL="your-url"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="your-key"
export SUPABASE_SERVICE_ROLE_KEY="your-service-key"

# 2. Database migrations executed
npm run migrate:supabase

# 3. Development server running
npm run dev
```

### Testing Procedures:

#### 1. Database Connectivity Test
```bash
# Test in browser console:
curl http://localhost:3000/api/jobs
# Should return: { data: [...], pagination: {...} }
```

#### 2. CRUD Operations Test
```bash
# Test CREATE
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Job","company":"Test Co"}'

# Test READ
curl http://localhost:3000/api/jobs/[job-id]

# Test UPDATE
curl -X PUT http://localhost:3000/api/jobs/[job-id] \
  -d '{"title":"Updated Title"}'

# Test DELETE
curl -X DELETE http://localhost:3000/api/jobs/[job-id]
```

#### 3. Feature Flags Test
```bash
# Check if feature is enabled for user role
curl http://localhost:3000/api/features/check?name=code-scanner

# Response should be: { enabled: true/false }
```

#### 4. Pricing Configuration Test
```bash
# Fetch pricing tiers
curl http://localhost:3000/api/admin/pricing/tiers

# Should return all configured tiers with features
```

#### 5. RBAC Test
```bash
# Try to access admin endpoint without admin role
# Should get 401 Unauthorized

# Try with admin role
# Should get 200 OK
```

#### 6. RLS (Row Level Security) Test
```bash
# User can only see their own data
curl http://localhost:3000/api/jobs/applications \
  -H "Authorization: Bearer [user-token]"

# Should only return applications for that user
```

### Test Scenarios:

#### Scenario 1: New User Flow
- [ ] User signs up
- [ ] User profile created
- [ ] Default free tier assigned
- [ ] Basic features enabled
- [ ] Can view public content

#### Scenario 2: Job Application Flow
- [ ] User views jobs
- [ ] User applies for job
- [ ] Job status updated
- [ ] Application saved in database
- [ ] Employer can see application

#### Scenario 3: Admin Configuration
- [ ] Admin creates new pricing tier
- [ ] Admin toggles features for tier
- [ ] Users with that tier get features
- [ ] Feature flags work correctly
- [ ] Configuration is real-time

#### Scenario 4: Feature Access Control
- [ ] Free tier users can only scan 50 codes
- [ ] Pro tier users can scan unlimited
- [ ] Enterprise users get all features
- [ ] Disabled features are blocked
- [ ] Proper error messages shown

#### Scenario 5: Data Isolation
- [ ] User A can't see User B's data
- [ ] Team members can share data
- [ ] Admin can see all data
- [ ] RLS policies enforced
- [ ] No data leakage

### Performance Tests:

```bash
# Test pagination (1000 items)
curl "http://localhost:3000/api/jobs?page=1&limit=50"
# Should return in <500ms

# Test filtering (100 searches)
curl "http://localhost:3000/api/jobs?location=SF&level=senior"
# Should return in <200ms

# Test large data transfer
curl "http://localhost:3000/api/challenges?limit=1000"
# Should handle without timeout
```

### Error Handling Tests:

```bash
# Missing required field
curl -X POST http://localhost:3000/api/jobs \
  -d '{"company":"Test"}'
# Should return 400 with validation error

# Invalid pagination
curl "http://localhost:3000/api/jobs?page=abc"
# Should return 400 with error

# Unauthorized access
curl http://localhost:3000/api/admin/pricing
# Should return 401 Unauthorized
```

### Data Verification:

After testing, verify in Supabase dashboard:

1. **Tables Created**: 53 tables should exist
2. **Data Inserted**: Sample data should be present
3. **RLS Active**: All tables have policies
4. **Indexes**: 100+ indexes created
5. **Relationships**: Foreign keys working

### Sign-Off Checklist:

- [ ] All 55+ APIs return real Supabase data
- [ ] CRUD operations work correctly
- [ ] Feature flags control access properly
- [ ] Pricing configuration updates in real-time
- [ ] RBAC prevents unauthorized access
- [ ] RLS isolates user data properly
- [ ] Pagination and filtering work
- [ ] Error handling is proper
- [ ] Performance is acceptable (<500ms)
- [ ] No data leakage between users/teams

---

## Deployment Checklist

After all testing passes:

1. [ ] Verify all environment variables set
2. [ ] Run final database backup
3. [ ] Execute migrations one more time
4. [ ] Test critical user flows
5. [ ] Check error logs for issues
6. [ ] Verify monitoring/alerts configured
7. [ ] Deploy to staging first
8. [ ] Run smoke tests on staging
9. [ ] Deploy to production
10. [ ] Monitor for 24 hours

---

## Troubleshooting

### "Supabase connection refused"
- Check NEXT_PUBLIC_SUPABASE_URL is correct
- Verify anon key is valid
- Check network connectivity

### "Table doesn't exist"
- Run migrations: `npm run migrate:supabase`
- Verify migrations executed successfully
- Check Supabase SQL editor for tables

### "Row level security error"
- Verify RLS policies are enabled
- Check auth.users table has users
- Verify JWT tokens are valid

### "Feature flag not working"
- Check role_feature_permissions table
- Verify user has role assigned
- Check tier_features table

### "Performance degradation"
- Add indexes on frequently filtered columns
- Implement caching layer
- Use pagination for large datasets

---

## Summary

**Phase 6**: Connect remaining 54 APIs to Supabase using established pattern
**Phase 7**: Execute comprehensive tests and verification

Once complete, the platform will be:
- ✓ Production-ready with real data
- ✓ Fully tested and verified
- ✓ RBAC and RLS enforced
- ✓ Feature flags working
- ✓ Ready for deployment

**Estimated time to completion**: 5-7 hours total for both phases
