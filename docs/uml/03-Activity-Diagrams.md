# CodeSpectra Activity Diagrams

> **Auto-generated from codebase audit** — Last updated: 2026-07-08

---

## 1. Problem Solving Workflow

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#6366f1', 'lineColor': '#94a3b8' }}}%%
stateDiagram-v2
    [*] --> BrowseProblems: User navigates to\n/dashboard/problems
    BrowseProblems --> SelectProblem: Click problem card
    SelectProblem --> ReadDescription: View problem statement,\nconstraints, examples

    ReadDescription --> WriteSolution: Open Monaco Editor
    WriteSolution --> RunCode: Click "Run"

    state RunCode <<choice>>
    RunCode --> ViewOutput: Piston executes code\n(or local executor)
    ViewOutput --> FixErrors: Output shows errors\nor failed tests
    ViewOutput --> WriteSolution: Continue iterating

    FixErrors --> WriteSolution: Edit code
    FixErrors --> RequestHints: Ask for AI hint
    RequestHints --> WriteSolution: Use hint to improve

    WriteSolution --> SubmitSolution: Click "Submit"
    SubmitSolution --> AutoGrade: System runs test suite\nvia Piston

    AutoGrade --> AIAnalysis: Grade calculation
    AIAnalysis --> AIReview: LLM code review\n(via /internal/ai/code-analysis)

    AIReview --> DisplayResults: Show passed/total,\nscore, XP earned
    AIReview --> ShowAIFeedback: Show time complexity,\nspace complexity,\nefficiency score

    DisplayResults --> ViewLeaderboard: Compare ranking
    DisplayResults --> TrackProgress: Update skill analytics
    DisplayResults --> EarnAchievements: Check for badge\nunlocks
    DisplayResults --> [*]
```

---

## 2. Code Scanner Workflow

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#8b5cf6' }}}%%
stateDiagram-v2
    [*] --> NavigateScanner: User opens\n/dashboard/scanner

    NavigateScanner --> SelectMode: 16 modes available\n(manual, github, quality-gates,\ntrends, review, config, reports,\ninsights, team, metrics, hotspots,\nratings, activity, architecture,\npr, branches, chat)

    SelectMode --> ManualMode: mode=manual
    SelectMode --> GitHubMode: mode=github
    SelectMode --> QualityGates: mode=quality-gates
    SelectMode --> ReviewMode: mode=review
    SelectMode --> ChatMode: mode=chat

    ManualMode --> InputCode: Paste or type code\nin editor
    GitHubMode --> RepoBrowser: Select repository\nfrom GitHub connection
    GitHubMode --> ConnectGitHub: If not connected,\nOAuth flow

    RepoBrowser --> SelectFile: Browse repo tree
    InputCode --> SelectFile: File ready for analysis

    SelectFile --> AnalyzeCode: POST /api/analyze-code
    AnalyzeCode --> LocalAnalyzer: Heuristic scanning
    AnalyzeCode --> AIReview: Optional deep LLM review
    LocalAnalyzer --> ParseResults: Issues, warnings,\nerrors, code smells

    ParseResults --> ViewQualityScore: Overall quality 0-100
    ParseResults --> ViewIssues: Categorized by severity\n(error, warning, info)
    ParseResults --> ViewSuggestions: AI fix suggestions

    ViewIssues --> ApplyFixes: Apply individual or\nbatch fixes
    ApplyFixes --> ReAnalyze: Verify fix improved score
    ApplyFixes --> UnapplyFix: Rollback if needed

    ReAnalyze --> ViewResults
    ViewResults --> GenerateReport: Export report
    ViewResults --> [*]

    QualityGates --> ConfigureGates: Set thresholds\n(score, bugs, vulns,\nsmells, coverage)
    ViewResults --> CheckQualityGate: Against configured\ngate rules
    CheckQualityGate --> PassGate: All thresholds met
    CheckQualityGate --> FailGate: Threshold breached
```

---

## 3. Admin Permission Management

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#ef4444' }}}%%
stateDiagram-v2
    [*] --> NavigateAdmin: Superadmin navigates to\n/dashboard/admin/permissions

    NavigateAdmin --> ViewPermissionMatrix: Page-permission\nmatrix displayed
    ViewPermissionMatrix --> SelectRole: Choose role\n(superadmin / tenant_admin\ / user)

    SelectRole --> ViewRolePages: See assigned routes\nper role

    ViewRolePages --> TogglePermission: Enable/disable\npage access

    TogglePermission --> ToggleRoute: Click route to add/remove
    TogglePermission --> ToggleCategory: Toggle entire category\n(platform / organization / user)

    ToggleRoute --> ConfirmChange: Dialog confirmation
    ConfirmChange --> SavePermissions: Click "Save"

    SavePermissions --> ValidateConfig: Build-time validation\n(yarn build)

    state ValidateConfig <<choice>>
    ValidateConfig --> UpdatePagePermissions: Updates page-permissions.ts\nADMIN_ONLY_ROUTES /\nTENANT_ADMIN_ROUTES /\nALL_USER_ROUTES
    ValidateConfig --> RBACAutoGen: SUPERADMIN_PAGES /\nTENANT_ADMIN_PAGES /\nUSER_PAGES auto-regenerated

    RBACAutoGen --> MiddlewareEnforced: Middleware checks\non next request
    MiddlewareEnforced --> ComponentGuard: usePageGuard()\nenforced in components
    ComponentGuard --> Success: Changes live

    SavePermissions --> Error: Validation failed
    Error --> ViewPermissionMatrix: Fix and retry
    Success --> [*]
```

---

## 4. Password Reset Flow

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#0ea5e9' }}}%%
stateDiagram-v2
    [*] --> ClickForgotPassword: User clicks\n"Forgot Password?"

    ClickForgotPassword --> EnterEmail: /auth/forgot-password
    EnterEmail --> ValidateEmail: Client-side validation

    state ValidateEmail <<choice>>
    ValidateEmail --> SendResetRequest: POST /api/auth/forgot-password\n{ email }
    ValidateEmail --> EnterEmail: Invalid email format

    SendResetRequest --> CheckAccount: Server looks up\nuser in MongoDB

    state CheckAccount <<choice>>
    CheckAccount --> SendEmail: Account exists -\nsend reset email
    CheckAccount --> ShowSuccess: Account doesn't exist -\nshow generic success\n(security: don't reveal)

    SendEmail --> EmailDelivered: Nodemailer sends\nemail with reset link
    EmailDelivered --> ShowConfirmation: "Check your email"

    ShowConfirmation --> OpenEmail: User checks inbox
    OpenEmail --> ClickResetLink: Click link in email\n(contains ?code=token)

    ClickResetLink --> EnterNewPassword: /auth/reset-password\nform page
    EnterNewPassword --> ValidatePassword: Min 6 chars check

    ValidatePassword --> SubmitReset: POST /api/auth/reset-password\n{ code, newPassword }
    SubmitReset --> UpdateDatabase: bcrypt.hash(newPassword)\n→ MongoDB update
    UpdateDatabase --> RedirectLogin: Redirect to\n/auth/login

    RedirectLogin --> [*]: User logs in with\nnew password
