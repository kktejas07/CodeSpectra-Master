# Next Steps: SonarQube Implementation Integration

## Overview
The SonarQube quality management system has been successfully integrated into your scanner application. This document outlines the remaining steps to fully activate all features.

---

## Step 1: Database Setup ✓ (Nearly Complete)

### Option A: Manual Supabase Setup (Recommended)
1. Go to your Supabase project dashboard
2. Click "SQL Editor" 
3. Copy and paste the SQL from `/scripts/18-sonarqube-quality-system.sql`
4. Execute the script

This creates:
- `quality_ratings` - Letter grades (A-E) per branch
- `quality_gates` - Pass/fail rules
- `file_metrics` - Per-file quality data  
- `code_issues` - Issue tracking with bulk support
- `code_scan_activities` - Event timeline

### Option B: Via API
Create a script at `/scripts/setup-db.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const { data, error } = await supabase.sql.from('quality_ratings').select('*')
```

---

## Step 2: Update API Routes

### Connect Quality Ratings API
**File:** `/app/api/scanner/quality-ratings/route.ts`

Update to query real database:
```typescript
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const { data } = await supabase
    .from('quality_ratings')
    .select('*')
  return Response.json(data)
}
```

### Connect Issues API
**File:** `/app/api/scanner/issues/route.ts`

Add filtering, pagination, and status updates:
```typescript
export async function PATCH(req: Request) {
  const { issueIds, status } = await req.json()
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  
  const { data, error } = await supabase
    .from('code_issues')
    .update({ status })
    .in('id', issueIds)
  
  return Response.json(data)
}
```

### Connect Metrics API
**File:** `/app/api/scanner/metrics/route.ts`

Update to fetch file-level metrics:
```typescript
export async function GET(req: Request) {
  const { projectId, scanId } = Object.fromEntries(new URL(req.url).searchParams)
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  
  const { data } = await supabase
    .from('file_metrics')
    .select('*')
    .eq('project_id', projectId)
    .eq('scan_id', scanId)
  
  return Response.json(data)
}
```

---

## Step 3: Wire Components to Real Data

### Update MetricsFileBrowser Component
**File:** `/components/scanner/metrics-file-browser.tsx`

Add data fetching:
```typescript
import useSWR from 'swr'

export function MetricsFileBrowser() {
  const { data: metrics } = useSWR('/api/scanner/metrics', fetcher)
  
  return (
    <div>
      {metrics?.map((file) => (
        <FileMetricRow key={file.id} file={file} />
      ))}
    </div>
  )
}
```

### Update SecurityHotspots Component
**File:** `/components/scanner/security-hotspots.tsx`

Connect to issues API:
```typescript
const { data: hotspots } = useSWR('/api/scanner/issues?type=security_hotspot', fetcher)
```

### Update ActivityTimeline Component
**File:** `/components/scanner/activity-timeline.tsx`

Fetch from activities table:
```typescript
const { data: activities } = useSWR('/api/scanner/activities', fetcher)
```

---

## Step 4: Add Missing API Routes

Create `/app/api/scanner/activities/route.ts`:
```typescript
export async function GET(req: Request) {
  const { projectId, startDate, endDate } = Object.fromEntries(
    new URL(req.url).searchParams
  )
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  let query = supabase
    .from('code_scan_activities')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  
  if (startDate) query = query.gte('created_at', startDate)
  if (endDate) query = query.lte('created_at', endDate)
  
  const { data } = await query
  return Response.json(data)
}
```

Create `/app/api/scanner/metrics/files/route.ts`:
```typescript
export async function GET(req: Request) {
  const { projectId } = Object.fromEntries(new URL(req.url).searchParams)
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const { data } = await supabase
    .from('file_metrics')
    .select('*')
    .eq('project_id', projectId)
  
  return Response.json(data)
}
```

---

## Step 5: Implement Quality Gate Status Calculation

Create `/lib/quality-gate-calculator.ts`:
```typescript
export function calculateQualityGateStatus(
  issues: Issue[],
  metrics: FileMetric[],
  gate: QualityGate
): 'PASSED' | 'FAILED' {
  const securityIssues = issues.filter(i => i.type === 'vulnerability').length
  const reliabilityIssues = issues.filter(i => i.type === 'bug').length
  const maintainabilityIssues = issues.filter(i => i.type === 'code_smell').length
  
  const passed =
    securityIssues <= gate.conditions.securityIssues &&
    reliabilityIssues <= gate.conditions.reliabilityIssues &&
    maintainabilityIssues <= gate.conditions.maintainabilityIssues &&
    coverage >= gate.conditions.coverage &&
    duplications <= gate.conditions.duplications
  
  return passed ? 'PASSED' : 'FAILED'
}
```

---

## Step 6: Add Quality Rating Algorithm

Create `/lib/quality-rater.ts`:
```typescript
export function calculateRating(score: number): 'A' | 'B' | 'C' | 'D' | 'E' {
  if (score >= 8) return 'A'
  if (score >= 7) return 'B'
  if (score >= 5) return 'C'
  if (score >= 3) return 'D'
  return 'E'
}

export function calculateSecurityScore(vulnerabilities: number, total: number): number {
  return Math.max(0, 10 - (vulnerabilities / Math.max(1, total)) * 10)
}
```

---

## Step 7: Update Scanner Page Integration

**File:** `/app/dashboard/scanner/page.tsx`

The scanner page is already wired with all new components. Verify all modes render:
- `scanMode === 'metrics'` → MetricsFileBrowser
- `scanMode === 'hotspots'` → SecurityHotspots
- `scanMode === 'ratings'` → QualityRatings
- `scanMode === 'activity'` → ActivityTimeline
- `scanMode === 'architecture'` → ArchitectureVisualization
- `scanMode === 'pr'` → PRIntegration
- `scanMode === 'branches'` → BranchAnalytics

---

## Step 8: Add Row Level Security (RLS) - Optional

For enhanced security, add RLS policies to Supabase:

```sql
-- Allow users to see only their project's data
ALTER TABLE quality_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their project ratings"
ON quality_ratings FOR SELECT
USING (project_id IN (
  SELECT project_id FROM user_projects 
  WHERE user_id = auth.uid()
));
```

---

## Step 9: Testing

### Test Quality Gates
1. Navigate to `/dashboard/scanner`
2. Click "Quality Gates" in sidebar
3. Create a new gate
4. Add conditions
5. Save

### Test Metrics Browser
1. Click "Metrics Browser"
2. Verify file list loads
3. Click file to view details

### Test Activity Timeline
1. Click "Activity Timeline"
2. Verify events show
3. Test date filter

---

## Step 10: Production Checklist

- [ ] Database migration executed
- [ ] API routes connected to Supabase
- [ ] All components fetching real data
- [ ] Quality gate calculation working
- [ ] Rating algorithm implemented
- [ ] RLS policies configured (if needed)
- [ ] Error handling added to all APIs
- [ ] Loading states tested
- [ ] Deploy to production

---

## Environment Variables Required

Add to your `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key
```

---

## Files Modified

✓ `/app/dashboard/scanner/page.tsx` - Added 7 new modes
✓ `/components/scanner/quality-gate-dashboard.tsx` - SonarQube design
✓ `/components/scanner/metrics-file-browser.tsx` - File metrics view
✓ `/components/scanner/security-hotspots.tsx` - Security review workflow
✓ `/components/scanner/quality-ratings.tsx` - A-E ratings display
✓ `/components/scanner/activity-timeline.tsx` - Event history
✓ `/components/scanner/architecture-visualization.tsx` - Dependency view
✓ `/components/scanner/pr-integration.tsx` - PR quality checks
✓ `/components/scanner/branch-analytics.tsx` - Branch health scoring

## Files Created (APIs)

✓ `/app/api/scanner/quality-ratings/route.ts`
✓ `/app/api/scanner/issues/route.ts`
✓ `/app/api/scanner/issues/bulk/route.ts`
✓ `/app/api/scanner/metrics/route.ts`

## Files to Create (Next)

- `/app/api/scanner/activities/route.ts`
- `/app/api/scanner/metrics/files/route.ts`
- `/lib/quality-gate-calculator.ts`
- `/lib/quality-rater.ts`

---

## Support

For issues:
1. Check console logs for errors
2. Verify database connection
3. Test API routes in Postman
4. Check component prop types match API responses

---

**Last Updated:** April 17, 2026
**Status:** 7 Components Integrated | 4 APIs Created | 2 Utility Functions Pending
