# SonarQube Features Integration Guide

## Quick Start

### Step 1: Database Setup
Copy and execute the SQL migration to your Supabase project:

```sql
-- From: scripts/18-sonarqube-quality-system.sql
CREATE TABLE quality_ratings (...)
CREATE TABLE quality_gates (...)
CREATE TABLE file_metrics (...)
CREATE TABLE code_issues (...)
CREATE TABLE code_scan_activities (...)
```

### Step 2: Update Scanner Page
Modify `app/dashboard/scanner/page.tsx` to include new sidebar options:

```tsx
<NavItem icon={<QualityGatesIcon />} label="Quality Gates" ... />
<NavItem icon={<MetricsIcon />} label="Metrics" ... />
<NavItem icon={<SecurityIcon />} label="Security Hotspots" ... />
<NavItem icon={<ActivityIcon />} label="Activity" ... />
<NavItem icon={<ArchitectureIcon />} label="Architecture" ... />
<NavItem icon={<PRIcon />} label="PR Analysis" ... />
<NavItem icon={<BranchIcon />} label="Branches" ... />
```

### Step 3: Connect Components
Import and use the new components in your pages:

```tsx
import { QualityGateDashboard } from '@/components/scanner/quality-gate-dashboard'
import { MetricsFileBrowser } from '@/components/scanner/metrics-file-browser'
import { SecurityHotspots } from '@/components/scanner/security-hotspots'
import { ActivityTimeline } from '@/components/scanner/activity-timeline'
import { ArchitectureVisualization } from '@/components/scanner/architecture-visualization'
import { PRIntegration } from '@/components/scanner/pr-integration'
import { BranchAnalytics } from '@/components/scanner/branch-analytics'
```

### Step 4: Wire APIs to Supabase
Update each API route to query Supabase:

```tsx
// app/api/scanner/quality-ratings/route.ts
const { data, error } = await supabaseServer
  .from('quality_ratings')
  .select('*')
  .eq('project_id', projectId)

// Repeat pattern for all APIs
```

---

## Component Usage

### Quality Gate Dashboard

```tsx
<QualityGateDashboard
  gates={qualityGates}
  onSave={(gate) => updateGate(gate)}
  onDelete={(id) => deleteGate(id)}
/>
```

**Features:**
- Create, edit, delete quality gates
- Define pass/fail criteria
- Visual status indicators
- Bulk gate management

---

### Metrics File Browser

```tsx
<MetricsFileBrowser
  files={projectMetrics}
  onSelectFile={(file) => viewFileDetails(file)}
/>
```

**Features:**
- Per-file quality metrics
- Severity sorting/filtering
- Technical debt calculation
- Coverage % per file

---

### Security Hotspots

```tsx
<SecurityHotspots
  hotspots={securityHotspots}
  onStatusChange={(id, status) => updateStatus(id, status)}
/>
```

**Features:**
- Dedicated review workflow
- Priority-based triage
- Line-by-line code snippets
- Category classification

---

### Activity Timeline

```tsx
<ActivityTimeline
  activities={activities}
  loading={isLoading}
/>
```

**Features:**
- Event timeline visualization
- Date range filtering
- Event type filtering
- Export functionality

---

### Architecture Visualization

```tsx
<ArchitectureVisualization
  components={components}
  dependencies={dependencies}
  onAddComponent={() => showAddComponentDialog()}
/>
```

**Features:**
- Component relationship mapping
- Dependency strength indicators
- Health scoring
- Zoom controls

---

### PR Integration

```tsx
<PRIntegration
  prs={pullRequests}
  loading={isLoading}
/>
```

**Features:**
- Automatic PR quality checks
- New/fixed issues tracking
- Quality gate status
- GitHub PR links

---

### Branch Analytics

```tsx
<BranchAnalytics
  branches={branches}
/>
```

**Features:**
- Long-lived vs short-lived branches
- Per-branch health scoring
- Activity tracking
- Contributor metrics

---

## API Routes

### GET /api/scanner/quality-ratings
**Description:** Fetch quality ratings for a project/branch

**Query Parameters:**
- `projectId` (required)
- `branch` (optional, default: main)

**Response:**
```json
{
  "id": "uuid",
  "security_rating": "A",
  "reliability_rating": "B",
  "maintainability_rating": "C",
  "quality_gate_status": "PASSED"
}
```

---

### POST /api/scanner/quality-gates
**Description:** Create/update quality gate rules

**Request Body:**
```json
{
  "name": "Production Ready",
  "security_issues_threshold": 0,
  "reliability_issues_threshold": 0,
  "maintainability_issues_threshold": 5,
  "coverage_threshold": 80,
  "duplications_threshold": 3
}
```

---

### GET /api/scanner/metrics
**Description:** Fetch file-level metrics

**Query Parameters:**
- `projectId` (required)
- `scanId` (optional)
- `page` (optional, default: 1)
- `limit` (optional, default: 20)

**Response:**
```json
[
  {
    "file_path": "src/app.ts",
    "lines_of_code": 250,
    "coverage": 85.5,
    "duplication": 2.3,
    "complexity": 15,
    "issues": 3
  }
]
```

---

### GET /api/scanner/issues
**Description:** Fetch code issues

**Query Parameters:**
- `projectId` (required)
- `status` (optional: OPEN, RESOLVED, SAFE)
- `severity` (optional: blocker, critical, major, minor, info)
- `type` (optional: bug, vulnerability, code_smell, security_hotspot)

**Response:**
```json
[
  {
    "id": "uuid",
    "file_path": "src/main.ts",
    "line_number": 42,
    "type": "code_smell",
    "severity": "major",
    "message": "Function too complex",
    "status": "OPEN"
  }
]
```

---

### POST /api/scanner/issues/bulk
**Description:** Bulk update issues

**Request Body:**
```json
{
  "issueIds": ["uuid1", "uuid2"],
  "action": "updateStatus",
  "value": "RESOLVED"
}
```

**Actions:**
- `updateStatus` - Change status
- `assignTo` - Assign to user
- `addTag` - Add tag
- `removeTag` - Remove tag
- `updateSeverity` - Change severity

---

## Database Schema

### quality_ratings
```sql
- id (UUID, primary key)
- project_id (TEXT)
- branch_name (TEXT)
- security_rating (TEXT: A-E)
- reliability_rating (TEXT: A-E)
- maintainability_rating (TEXT: A-E)
- quality_gate_status (TEXT: PASSED/FAILED/NOT_COMPUTED)
- created_at, updated_at (TIMESTAMP)
```

### quality_gates
```sql
- id (UUID, primary key)
- project_id (TEXT)
- name (TEXT)
- security_issues_threshold (INT)
- reliability_issues_threshold (INT)
- maintainability_issues_threshold (INT)
- coverage_threshold (NUMERIC)
- duplications_threshold (NUMERIC)
```

### file_metrics
```sql
- id (UUID, primary key)
- project_id (TEXT)
- scan_id (TEXT)
- file_path (TEXT)
- lines_of_code (INT)
- coverage (NUMERIC)
- duplication (NUMERIC)
- complexity (INT)
- bugs, vulnerabilities, code_smells (INT)
```

### code_issues
```sql
- id (UUID, primary key)
- project_id (TEXT)
- file_path (TEXT)
- line_number (INT)
- type (TEXT: bug/vulnerability/code_smell/security_hotspot)
- severity (TEXT: blocker/critical/major/minor/info)
- status (TEXT: OPEN/CONFIRMED/RESOLVED/SAFE)
- tags (TEXT array)
- assigned_to (TEXT)
```

### code_scan_activities
```sql
- id (UUID, primary key)
- project_id (TEXT)
- event_type (TEXT)
- event_data (JSONB)
- created_at (TIMESTAMP)
```

---

## Customization

### Modify Rating Scales
Edit `quality_ratings` calculation logic:
```tsx
// Custom A-E mapping
const calculateRating = (score: number) => {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  // ... etc
}
```

### Add Custom Metrics
Extend `file_metrics` table:
```sql
ALTER TABLE file_metrics ADD COLUMN custom_metric INT DEFAULT 0;
```

### Custom Event Types
Add to `code_scan_activities`:
```typescript
event_type: 'custom_event' | 'scan_completed' | ...
```

---

## Performance Tips

1. **Index Optimization:** All tables have indexes on frequently queried fields
2. **Pagination:** Use pagination on list endpoints to avoid large responses
3. **Caching:** Cache quality ratings for 1 hour to reduce DB load
4. **Batch Operations:** Use bulk APIs for multiple updates

---

## Troubleshooting

### Components Not Rendering
- Check Supabase tables exist
- Verify API routes are accessible
- Check environment variables

### Performance Issues
- Enable query caching
- Add pagination to list views
- Review database indexes

### Data Missing
- Run database migrations
- Seed sample data
- Check API response errors

---

## Support
All components include TypeScript types and JSDoc comments. Refer to component files for detailed prop documentation.
