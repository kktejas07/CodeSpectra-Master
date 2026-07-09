# CodeSpectra User Journeys

> **Auto-generated:** Based on codebase audit. Last updated: 2026-07-08.

---

## 1. New Developer Onboarding

```mermaid
journey
    title New Developer Onboarding
    section Discovery
      Visit landing page: 5: User
      Learn about features: 4: User
      Click Sign Up: 5: User
    section Registration
      Fill registration form: 3: User
      Create account (email/password): 4: System
      Receive welcome (optional email): 3: System
      Auto-login via session cookie: 5: System
    section First Exploration
      Land on dashboard: 4: User
      View empty state with getting started tips: 4: System
      Browse available problems: 5: User
      View problem statement and editor: 5: System
    section First Submission
      Write solution code: 4: User
      Click Submit: 5: User
      Code sent to Piston for execution: 4: System
      View test results: 5: User
      View AI code analysis: 4: System
```

### Key Screens
- Landing page → `/` with feature highlights
- Sign up → `/signup` with email/password form
- Dashboard → `/dashboard` with overview + quick actions
- First problem → `/dashboard/problems?slug=hello-world`
- Results → Submission view with test results + AI feedback

### Success Metrics
- Time to first submission: <5 minutes
- Account verification rate (if email verification enabled): >80%
- Day-1 retention: >40%

---

## 2. Problem Solving Workflow

```mermaid
journey
    title Problem Solving Workflow
    section Problem Selection
      Browse problem list: 3: User
      Filter by difficulty/topic: 4: User
      Select a problem: 5: User
      View problem statement + examples: 5: System
    section Coding
      Read starter code template: 4: User
      Write solution in Monaco editor: 4: User
      Request hint (if stuck): 4: User
      Receive progressive AI hint: 5: System
    section Submission
      Run code against sample tests: 5: User
      Submit for full evaluation: 5: User
      Code executed via Piston sandbox: 4: System
      View test pass/fail results: 5: User
    section Review
      View AI code analysis: 4: System
      View AI grade (if scored): 4: System
      Read feedback on approach: 4: User
      Compare with optimal solution: 3: User
      Earn XP and achievements: 5: System
```

### Key Screens
- Problem list → `/dashboard/problems` with search/filter
- Problem detail → `/dashboard/problems/[slug]` with statement + editor
- Editor → Monaco code editor with syntax highlighting
- Hints → Progressive 4-level hints panel
- Results → `SubmissionResult` with test output + AI analysis

### Sub-Flows
- **Hint flow:** Nudge (level 1) → Approach (level 2) → Pseudocode (level 3) → Solution (level 4)
- **Code analysis flow:** Time complexity → Space complexity → Efficiency score → Edge cases → Readability
- **Grading flow:** Per-criterion score (correctness, efficiency, style, etc.) → Total → Letter grade → Feedback

---

## 3. Code Scanning Workflow

```mermaid
journey
    title Code Scanning Workflow
    section Setup
      Navigate to Scanner: 4: User
      Choose scan mode (manual/github): 5: User
      Select language: 4: User
    section Scanning (Manual Mode)
      Paste or type code in editor: 5: User
      Click Analyze: 5: User
      Local analysis runs: 4: System
      Quality Gate evaluation: 4: System
    section Results
      View quality score: 5: User
      Review categorized issues: 5: System
      - Bugs: 4: System
      - Vulnerabilities: 4: System
      - Code smells: 4: System
      - Security hotspots: 4: System
      - Duplications: 3: System
    section Remediation
      Request AI-generated fixes: 4: User
      Review suggested fixes: 4: System
      Apply fixes: 5: User
      Re-scan to verify fix: 5: User
      Quality Gate passes: 5: System
    section Reporting
      Generate PDF report: 4: User
      View metrics trends: 4: System
      Share results with team: 3: User
```

### Key Screens
- Scanner mode selector → `/dashboard/scanner?mode=manual|github|quality-gates|...`
- Code editor → Monaco editor with scan trigger
- Results dashboard → Quality score + categorized issues
- AI fixes panel → AI-suggested code changes with apply button
- Quality gates → Pass/fail status with failing conditions
- Reports → `ReportGenerator` component with PDF export
- Trends → `MetricsTrendChart` with historical data

### Scanner Modes (19 total)
| Mode | Purpose |
|------|---------|
| `manual` | Paste/type code and scan |
| `github` | Scan GitHub repositories |
| `quality-gates` | Quality Gate configuration & status |
| `trends` | Historical metrics trends |
| `review` | AI code review |
| `config` | Scanner configuration |
| `reports` | Report generation |
| `insights` | Insights dashboard |
| `team` | Team leaderboard |
| `metrics` | File browser with metrics |
| `hotspots` | Security hotspots |
| `ratings` | Quality ratings |
| `activity` | Activity timeline |
| `architecture` | Architecture visualization |
| `pr` | PR integration |
| `branches` | Branch analytics |
| `chat` | Codebase chat Q&A |

---

## 4. AI Agent Interaction

```mermaid
journey
    title AI Agent Interaction
    section Initiation
      Open Ask CodeSpectra: 5: User
      View chat interface: 4: System
      See suggested questions: 4: System
    section Interaction
      Type coding question: 5: User
      Send message: 5: User
      System prepares context: 4: System
      - Current problem: 5: System
      - Recent submissions: 4: System
      - Scan results: 4: System
      Stream AI response: 5: System
    section Multi-Turn
      Ask follow-up question: 5: User
      History preserved in session: 4: System
      Context-aware response: 4: System
    section Advanced (Agent Mode)
      Request code fix: 5: User
      Agent analyzes code: 4: System
      Agent applies fix (step 1): 4: System
      Agent re-analyzes: 4: System
      Agent applies additional fix (step 2): 4: System
      Agent completes with summary: 4: System
      View final code: 5: User
```

### Key Screens
- Floating chat → `AskCodeSpectra` component (available dashboard-wide)
- Agent view → `/dashboard/agent` with multi-step agent interface
- Code review → `/api/ai/code-review` returns structured JSON
- Chat history → `ai_chat_sessions` collection persists conversations

### AI Endpoints Available
| Endpoint | Function | Model |
|----------|----------|-------|
| `/chat` | Conversational AI assistant | Claude Sonnet 4.5 |
| `/complete` | Non-streaming text completion | Gemini 3 Flash |
| `/hints` | Progressive coding hints | Gemini 3 Flash |
| `/code-review` | Structured code review | Claude Sonnet 4.5 |
| `/code-analysis` | Complexity + quality analysis | Gemini 3 Flash |
| `/grade` | Rubric-based grading | Claude Sonnet 4.5 |
| `/agent` | Multi-step code fixing agent | Claude Sonnet 4.5 |
| `/generate-problem` | AI problem generation | Claude Sonnet 4.5 |
| `/skill-insights` | Developer skill analysis | Gemini 3 Flash |
| `/identity-verify` | Selfie vs ID comparison | Gemini 3 Flash (vision) |

---

## 5. Interview Flow

```mermaid
journey
    title Technical Interview Flow
    section Scheduling
      Access interview module: 4: User
      View available interviews: 4: System
      Accept interview invitation: 5: User
      Confirm time slot: 4: System
    section Pre-Interview
      Identity verification prompt: 4: System
      Upload selfie + ID photo: 4: User
      AI verifies identity: 4: System
      Receive confirmation: 4: User
    section Live Coding
      Join coding workspace: 4: User
      View problem statement: 5: System
      Write solution collaboratively: 4: User
      Run code against test cases: 5: User
      Submit solution: 5: User
    section Evaluation
      AI grades submission: 4: System
      Interviewer reviews results: 5: Interviewer
      Add feedback notes: 4: Interviewer
      Status updated: 4: System
    section Follow-up
      View interview results: 4: User
      Read feedback: 4: User
      Check certification status: 4: User
      Apply to related jobs: 4: User
```

### Key Screens
- Interview list → `/dashboard/interviews`
- Interview workspace → Coding environment + video/proctoring
- Feedback → `/dashboard/interviews/feedback`
- Results → `/dashboard/interviews/results`

---

## 6. Certification Journey

```mermaid
journey
    title Certification Journey
    section Discovery
      Browse certifications: 4: User
      View certification tracks: 4: System
      Select certification: 5: User
      Review requirements: 4: System
    section Preparation
      Access learning path: 4: User
      Complete prerequisite problems: 4: User
      Take practice exams: 4: User
      Track progress: 4: System
      AI recommends focus areas: 4: System
    section Examination
      Initiate exam: 5: User
      Identity verification: 4: System
      Proctoring session starts: 4: System
      Solve coding challenges: 4: User
      Submit all answers: 5: User
    section Results
      AI grades submissions: 4: System
      Calculate passing score: 4: System
      Display results: 5: System
      Generate certificate (if passed): 4: System
      Award achievement badge: 5: System
    section Post-Certification
      Display certificate profile: 5: User
      Share on LinkedIn: 4: User
      Unlock job applications: 4: System
      Apply for relevant positions: 4: User
```

### Key Screens
- Certifications → `/dashboard/certifications`
- Exam → `/dashboard/exams/[id]` with timer + proctoring
- Certificate → Profile with shareable verification link
- Learning → `/dashboard/learning` with track progress

---

## UI/UX Principles

| Principle | Implementation |
|-----------|---------------|
| **Dark mode first** | `theme-context.tsx` with system preference detection + manual toggle |
| **Responsive layout** | Mobile sidebar overlay, collapsible desktop rail |
| **Progressive disclosure** | 4-level hints, drill-down scanner modes |
| **Real-time feedback** | Streaming AI responses via SSE, live scanner mode switching |
| **Empty states** | Onboarding tips on first visit |
| **Keyboard shortcuts** | Command menu via `CommandMenu` component |
| **Toast notifications** | `Sonner` for success/error/info |
| **Breadcrumbs** | `Breadcrumbs` component in dashboard layout |
| **Skeleton loading** | `animate-pulse` fallback for sidebar sub-navs |
| **Collapsible sidebar** | Persistent preference via `localStorage` |

---

## Navigation Structure

```
Dashboard
├── Overview          /dashboard
├── Arena             /dashboard/arena
├── Problems          /dashboard/problems
├── Tracks            /dashboard/tracks
├── Scanner           /dashboard/scanner?mode=...
├── Agent             /dashboard/agent
├── Learning          /dashboard/learning
├── Skill Analytics   /dashboard/skill-analytics
├── Leaderboard       /dashboard/leaderboard
├── Achievements      /dashboard/achievements
├── Certifications    /dashboard/certifications
├── Pricing           /dashboard/pricing
├── Interviews        /dashboard/interviews
├── Jobs              /dashboard/jobs
├── Exams             /dashboard/exams
├── Resumes           /dashboard/resumes
├── Billing           /dashboard/billing
├── Settings          /dashboard/settings
├── Profile           /dashboard/profile
└── Admin (superadmin only)
    ├── System        /dashboard/admin/system
    ├── Users         /dashboard/admin/users
    ├── Roles         /dashboard/admin/roles
    ├── Permissions   /dashboard/admin/permissions
    ├── Plans         /dashboard/admin/plans
    ├── Settings      /dashboard/admin/settings
    └── ...           /dashboard/admin/*
```
