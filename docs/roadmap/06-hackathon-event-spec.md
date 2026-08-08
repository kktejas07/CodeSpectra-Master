# HackerRank-style Event System — Technical Specification

> **Auto-Generated**: Internal Engineering documentation.

> **Status**: Draft Implementation
> **Version**: v0.1
> **Last Updated**: 2026-07-08

---

## 1. Event Setup & Configuration

### Admin Create Flow
1. Superadmin navigates to `/dashboard/admin/hackathons`
2. Clicks "Create Event" → form appears with fields:
   - Name, Description, Start/End time, Team capacity, Team size, Timeout
3. **Task Selection**: Admin selects problems from the existing `problems` collection
   - Multi-select from problem catalog (filter by difficulty/topic)
   - Set weight/points per problem
   - Set required vs. optional problems
4. Event status lifecycle: `draft → open → live → review → closed`

### Data Model Extension
```typescript
// Add to existing HackathonDoc
interface HackathonDoc {
  // ...existing fields...
  tasks: HackathonTask[]       // NEW: linked problems
  results_released: boolean    // NEW: admin controls visibility
  released_at?: string
}

interface HackathonTask {
  problem_slug: string
  problem_title: string
  points: number
  difficulty: string
  required: boolean
  order: number
}

interface HackathonSubmission {   // NEW collection
  id: string
  hackathon_id: string
  team_id: string
  problem_slug: string
  repo_url?: string
  commit_sha?: string
  score: number | null
  status: 'pending' | 'under_review' | 'released'
  feedback?: string
  submitted_at: string
  reviewed_at?: string
}
```

---

## 2. User Onboarding & Participation

### Solo Registration
- User visits `/hackathons/[slug]`
- Clicks "Register Solo" → creates a 1-person team (user is captain)
- Team auto-named: `{user.name}'s Team`
- User immediately sees the assigned tasks

### Team Registration
- User visits `/hackathons/[slug]`
- Clicks "Create Team" → names the team → becomes captain
- Captain shares team invite link (QR code or URL)
- Other users join via QR scan → added as `members[]`
- Max members enforced by `max_per_team`
- No double-registration enforced (API already checks)

### Task Assignment Display
- After registration, team sees assigned problems in order
- Each problem shows: title, difficulty, points, status (not started / submitted / reviewed)
- Links to the problem workspace: `/dashboard/challenges/[slug]`

---

## 3. Task Execution & GitHub Submission

### Workflow
1. User opens a problem in the workspace
2. Codes using the Monaco editor (already exists)
3. **Option A: Submit via Platform** — clicks "Submit" → code sent to Piston for execution + scoring
4. **Option B: Submit via GitHub** — user pushes to a repo, shares the URL

### GitHub Submission Endpoint
```
POST /api/hackathons/[id]/submissions
Body: { problem_slug: string, team_id: string, repo_url: string, commit_sha?: string }
Response: { submission_id, status: 'pending' }
```

### Backend Processing
1. Webhook or poll receives submission
2. Clones repo or fetches via GitHub API
3. Runs analysis pipeline (static analysis + security scan + dependency scan)
4. Runs Piston code execution with test cases
5. Calculates score
6. Saves to `hackathon_submissions` with `status: 'under_review'`

---

## 4. Automated Evaluation Engine

### Pipeline
```
Submission → Clone Repo → Detect Language → Install Dependencies
→ Run Tests (Piston) → Static Analysis → Security Scan → Dependency Scan
→ Calculate Score → Save (under_review)
```

### Scoring Criteria
| Criterion | Weight | Source |
|-----------|--------|--------|
| Test cases passed | 40% | Piston execution |
| Code quality (static analysis) | 20% | local-code-analyzer.ts |
| Security vulnerabilities | 15% | secret-scanner.ts |
| Dependency vulnerabilities | 10% | dependency-scanner.ts |
| Code efficiency / complexity | 10% | code_metrics analysis |
| Architecture / structure | 5% | File organization score |

---

## 5. Results Management — "Under Review" State

### Flow
1. Submission scored → stored as `status: 'under_review'`, score visible ONLY to admins
2. Leaderboard shows teams but with "Pending Review" instead of scores
3. Admin reviews scores on `/dashboard/admin/hackathons/[id]`
4. Admin can:
   - Override individual scores
   - Add manual adjustment with reason
   - Click "Release All Results" button

### Bulk Release API
```
POST /api/hackathons/[id]/release-results
Body: {}
Response: { ok: true, released_at, teams_affected: number }
```

### Effect
1. All `hackathon_submissions` with `status: 'under_review'` → `status: 'released'`
2. `hackathon.results_released` → `true`
3. `hackathon.released_at` → timestamp
4. Email notifications queued for all team members

---

## 6. Post-Event Features

### Notification
- Email sent to every team member with:
  - Event name
  - Team score + rank
  - Link to detailed results: `/hackathons/[slug]/results`
  - Certificate download link

### Results Page: `/hackathons/[slug]/results`
- Full leaderboard (final scores)
- Per-team breakdown:
  - Score per problem
  - Static analysis report summary
  - Security findings count
  - Efficiency rating
- Export as PDF button
- Download certificate button (PDF)
- Share on LinkedIn button

### Certificate Generation
```typescript
// API: GET /api/hackathons/[id]/certificates/[teamId]
// Returns: { certificate_url: string }
// Generation: Server-side HTML → Puppeteer/PDF or SVG badge
```
- Template includes: Event name, Team name, Rank, Date, Verifiable token

### Social Sharing
- LinkedIn share URL with pre-populated text:
  "I ranked #{rank} in {event_name} on CodeSpectra!"
- Open Graph meta tags on results page
- Shareable certificate image (OG-image format)

---

## 7. Implementation Phases

| Phase | Features | Effort |
|-------|----------|--------|
| P1 | Task assignment to events + "Under Review" state | 1 week |
| P2 | Admin release workflow + email notifications | 3 days |
| P3 | Results page + leaderboard + PDF export | 4 days |
| P4 | Certificate generation + social sharing | 3 days |
| P5 | GitHub submission pipeline + auto-evaluation | 1 week |
