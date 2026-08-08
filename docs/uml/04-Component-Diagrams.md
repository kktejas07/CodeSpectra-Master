# CodeSpectra Component Diagrams

> **Auto-Generated**: Internal Engineering documentation.

> **Auto-generated from codebase audit** — Last updated: 2026-07-08

---

## 1. Frontend Component Hierarchy (Next.js 16 App Router)

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#6366f1', 'lineColor': '#94a3b8' }}}%
graph TB
    subgraph "Next.js App Shell"
        RootLayout["app/layout.tsx\n<html> <body>"]
        PublicLayout["app/public-layout.tsx\nPublic Pages Shell"]
        AuthLayout["app/auth/layout.tsx\nAuth Pages Shell"]
        DashLayout["app/dashboard/layout.tsx\nDashboard Shell"]
    end

    subgraph "Providers & Context"
        AuthProvider["lib/auth-context.tsx\nAuthProvider\nFirebase Auth + Session"]
        ThemeProvider["components/theme-provider.tsx\nThemeProvider\n(next-themes)"]
        ToastProvider["components/providers.tsx\nToast & Global Providers"]
    end

    subgraph "Public Pages"
        Landing["app/page.tsx\nLanding / Home"]
        Features["app/features/page.tsx"]
        Pricing["app/pricing/page.tsx"]
        Blog["app/blog/page.tsx"]
        Docs["app/docs/page.tsx"]
        Status["app/status/page.tsx"]
        CertVerify["app/cert/verify\nCertificate Verification"]
        APIRef["app/api-reference/page.tsx"]
        About["app/about/page.tsx"]
        Contact["app/contact/page.tsx"]
        Security["app/security/page.tsx"]
        FAQ["app/faq/page.tsx"]
        Careers["app/careers/page.tsx"]
    end

    subgraph "Auth Pages"
        Login["app/auth/login/page.tsx"]
        Signup["app/auth/signup/page.tsx"]
        ForgotPass["app/auth/forgot-password/page.tsx"]
        ResetPass["app/auth/reset-password/page.tsx"]
    end

    subgraph "Shared UI Components"
        Button["components/ui/button.tsx"]
        Input["components/ui/input.tsx"]
        Dialog["components/ui/dialog.tsx"]
        Dropdown["components/ui/dropdown-menu.tsx"]
        Tabs["components/ui/tabs.tsx"]
        Card["components/ui/card.tsx"]
        Badge["components/ui/badge.tsx"]
        Table["components/ui/table.tsx"]
    end

    subgraph "Lib & Hooks"
        RBAC["lib/rbac.ts\nRole Definitions"]
        PagePerms["lib/page-permissions.ts\nRoute Permissions"]
        AuthContext["lib/auth-context.tsx\nAuth Context"]
        Session["lib/session.ts\nJWT Session"]
        Firebase["lib/firebase.ts\nFirebase Client"]
        RouteAuth["lib/route-auth.ts\nAPI Protection"]
        UsePageGuard["lib/use-page-guard.ts\nPage Guard Hook"]
        UseRoleGate["lib/use-role-gate.ts\nRole Gate Hook"]
        Piston["lib/piston.ts\nCode Exec Client"]
        ApiAuth["lib/api-auth.ts\nAPI Auth Utilities"]
    end

    RootLayout --> AuthProvider
    RootLayout --> ThemeProvider
    RootLayout --> ToastProvider
    RootLayout --> PublicLayout
    RootLayout --> AuthLayout
    RootLayout --> DashLayout

    AuthProvider --> AuthContext

    AuthLayout --> Login
    AuthLayout --> Signup
    AuthLayout --> ForgotPass
    AuthLayout --> ResetPass

    PublicLayout --> Landing
    PublicLayout --> Features
    PublicLayout --> Pricing
    PublicLayout --> Blog
    PublicLayout --> Docs
    PublicLayout --> Status
    PublicLayout --> CertVerify
    PublicLayout --> APIRef
    PublicLayout --> About
    PublicLayout --> Contact
    PublicLayout --> Security
    PublicLayout --> FAQ
    PublicLayout --> Careers

    DashLayout --> RBAC
    DashLayout --> PagePerms
    DashLayout --> UsePageGuard
    DashLayout --> UseRoleGate
    DashLayout --> Session

    Login --> AuthContext
    Signup --> AuthContext
    Login --> Button
    Login --> Input
    Signup --> Button
    Signup --> Input
```

---

## 2. Dashboard Shell & Sub-components

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#6366f1' }}}%
graph TB
    subgraph "Dashboard Layout (app/dashboard/layout.tsx)"
        DashLayout["DashboardLayout\n<main>"]
        Sidebar["Sidebar Panel\n(responsive: fixed lg:relative)"]
        TopBar["Top Bar\nBreadcrumbs + Mobile Menu"]
        MainContent["Main Content Area\nmax-w-7xl mx-auto"]
    end

    subgraph "Sidebar Components"
        LogoArea["Logo + Brand"]
        Search["Command Menu\n<CommandMenu>"]
        Nav["Main Navigation\nNavEntries[]"]
        ScannerNav["<ScannerSidebarNav>\n(16 scanner modes)"]
        LearnNav["<LearningSidebarNav>"]
        SettingsNav["<PlatformSettingsSidebarNav>"]
        ProfileSection["Profile Dropdown\nTheme + Notifications\n+ Logout"]
    end

    subgraph "Dashboard Pages"
        Arena["app/dashboard/arena\nCoding Arena"]
        Problems["app/dashboard/problems\nProblem Catalog"]
        Tracks["app/dashboard/tracks\nLearning Tracks"]
        Scanner["app/dashboard/scanner\nCode Scanner"]
        Agent["app/dashboard/agent\nAI Agent"]
        Learning["app/dashboard/learning\nHub"]
        Leaderboard["app/dashboard/leaderboard"]
        Achievements["app/dashboard/achievements"]
        Certifications["app/dashboard/certifications"]
        Profile["app/dashboard/profile"]
        Settings["app/dashboard/settings"]
        Billing["app/dashboard/billing"]
        Analytics["app/dashboard/analytics"]
        IdentityVerify["app/dashboard/identity-verify"]
        Interviews["app/dashboard/interviews"]
        Prepare["app/dashboard/prepare"]
        SkillAnalytics["app/dashboard/skill-analytics"]
        Notifications["app/dashboard/notifications"]
        Support["app/dashboard/support"]
        SearchPg["app/dashboard/search"]
        IdCard["app/dashboard/id-card"]
        PricingPg["app/dashboard/pricing"]
        Challenges["app/dashboard/challenges"]
        Codeathons["app/dashboard/codeathons"]
        Exams["app/dashboard/exams"]
        Jobs["app/dashboard/jobs"]
        Resumes["app/dashboard/resumes"]
    end

    subgraph "Dashboard Widgets"
        ActivityHeartbeat["<ActivityHeartbeat>\nSession keep-alive"]
        WebVitals["<WebVitalsReporter>"]
        Breadcrumbs["<Breadcrumbs>"]
        AskAI["<AskCodeSpectra>\nFloating AI Assistant"]
    end

    DashLayout --> Sidebar
    DashLayout --> TopBar
    DashLayout --> MainContent
    DashLayout --> ActivityHeartbeat
    DashLayout --> WebVitals
    DashLayout --> AskAI
    TopBar --> Breadcrumbs

    Sidebar --> LogoArea
    Sidebar --> Search
    Sidebar --> Nav
    Sidebar --> ScannerNav
    Sidebar --> LearnNav
    Sidebar --> SettingsNav
    Sidebar --> ProfileSection

    MainContent --> Arena
    MainContent --> Problems
    MainContent --> Tracks
    MainContent --> Scanner
    MainContent --> Agent
    MainContent --> Learning
    MainContent --> Leaderboard
    MainContent --> Achievements
    MainContent --> Certifications
    MainContent --> Profile
    MainContent --> Settings
    MainContent --> Billing
    MainContent --> Analytics
    MainContent --> IdentityVerify
    MainContent --> Interviews
    MainContent --> Prepare
    MainContent --> SkillAnalytics
    MainContent --> Notifications
    MainContent --> Support
    MainContent --> SearchPg
    MainContent --> IdCard
    MainContent --> PricingPg
    MainContent --> Challenges
    MainContent --> Codeathons
    MainContent --> Exams
    MainContent --> Jobs
    MainContent --> Resumes
```

---

## 3. Scanner Component Tree (16 Sub-modes)

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#8b5cf6' }}}%
graph TB
    subgraph "Scanner Page (app/dashboard/scanner)"
        ScannerShell["Scanner Shell\nparseScannerMode(url)\n→ active mode"]
    end

    subgraph "Scanner Components (components/scanner/)"
        Manual["Manual Input\n<code input area>"]
        GitHub["<github-integration.tsx>\nGitHub OAuth + Repo Browser"]
        QualityGates["<quality-gate-dashboard.tsx>\n<quality-gates-live-panel.tsx>"]
        Trends["<metrics-trend-chart.tsx>"]
        Review["<code-review-panel.tsx>"]
        Config["<scanner-config-panel.tsx>"]
        Reports["<report-generator.tsx>"]
        Insights["<insights-dashboard.tsx>"]
        Team["<team-leaderboard.tsx>"]
        Metrics["<metrics-file-browser.tsx>\n<advanced-metrics.tsx>"]
        Hotspots["<security-hotspots.tsx>"]
        Ratings["<quality-ratings.tsx>"]
        Activity["<activity-timeline.tsx>"]
        Architecture["<architecture-visualization.tsx>"]
        PR["<pr-integration.tsx>"]
        Branches["<branch-analytics.tsx>"]
        Chat["<codebase-chat-sidebar.tsx>"]
    end

    subgraph "Shared Scanner Sub-components"
        AIFixes["<ai-fixes-panel.tsx>"]
        SuggestedFixes["<suggested-fixes.tsx>"]
        DiffViewer["<code-diff-viewer.tsx>"]
        ScanHistory["<scan-history.tsx>"]
        RepoBrowser["<repository-browser.tsx>"]
    end

    subgraph "Scanner Nav"
        ScannerNavComp["<ScannerSidebarNav>\n16 mode links\ndashboard/scanner?mode=X"]
    end

    ScannerShell --> ScannerNavComp

    ScannerShell --> Manual
    ScannerShell --> GitHub
    ScannerShell --> QualityGates
    ScannerShell --> Trends
    ScannerShell --> Review
    ScannerShell --> Config
    ScannerShell --> Reports
    ScannerShell --> Insights
    ScannerShell --> Team
    ScannerShell --> Metrics
    ScannerShell --> Hotspots
    ScannerShell --> Ratings
    ScannerShell --> Activity
    ScannerShell --> Architecture
    ScannerShell --> PR
    ScannerShell --> Branches
    ScannerShell --> Chat

    Manual --> AIFixes
    Manual --> SuggestedFixes
    Manual --> DiffViewer
    GitHub --> RepoBrowser
    GitHub --> ScanHistory
    Review --> AIFixes
    Review --> SuggestedFixes
    Review --> DiffViewer
    QualityGates --> SuggestedFixes
```

---

## 4. Admin Component Tree

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#ef4444' }}}%
graph TB
    subgraph "Admin Dashboard Routes"
        System["/dashboard/admin/system\nOperations Overview"]
        Users["/dashboard/admin/users\nUser Management"]
        Roles["/dashboard/admin/roles\nRole Assignments"]
        Analytics["/dashboard/admin/analytics\nInsights"]
        Audit["/dashboard/admin/audit-logs\nAudit Logs"]
        Integrations["/dashboard/admin/integrations"]
        Pricing["/dashboard/admin/pricing\nPricing Management"]
        Security["/dashboard/admin/security"]
        Settings["/dashboard/admin/settings\nPlatform Settings"]
        Teams["/dashboard/admin/teams"]
        Jobs["/dashboard/admin/jobs"]
        Resumes["/dashboard/admin/resumes"]
        Codeathons["/dashboard/admin/codeathons"]
        Exams["/dashboard/admin/exams"]
        SpeedInsights["/dashboard/admin/speed-insights"]
        CDN["/dashboard/admin/cdn"]
        Workflows["/dashboard/admin/workflows"]
        QGen["/dashboard/admin/question-generator"]
        Hackathons["/dashboard/admin/hackathons"]
        AIInventory["/dashboard/admin/ai-inventory"]
        Permissions["/dashboard/admin/permissions\nRole & Permissions"]
        Plans["/dashboard/admin/plans\nSubscription Plans"]
        TeamOrg["/dashboard/admin/team\nOrganization"]
    end

    subgraph "Admin Components (components/admin/)"
        UserTable["<user-management-table.tsx>"]
        AddUser["<add-user-dialog.tsx>"]
        RoleAssign["<role-assignment-dialog.tsx>"]
        AnalyticsDash["<analytics-dashboard.tsx>"]
        AuditViewer["<audit-logs-viewer.tsx>"]
        TeamMemberCard["<team-member-card.tsx>"]
    end

    subgraph "Settings Sidebar"
        SettingsNav["<PlatformSettingsSidebarNav>\nNested sidebar for settings"]
    end

    subgraph "Admin Lib Utilities"
        AdminUsers["lib/admin-users.ts"]
        AdminProvision["lib/admin-provision-user.ts"]
        AdminService["lib/admin-service-client.ts"]
        PermissionsDB["lib/permissions-db.ts"]
        RBACServer["lib/rbac-server.ts"]
        PlatformSettings["lib/platform-general-settings.ts"]
    end

    Permissions --> AdminUsers
    Permissions --> PermissionsDB
    Permissions --> RBACServer
    Permissions --> RoleAssign

    Users --> UserTable
    Users --> AddUser
    Users --> RoleAssign

    Roles --> RoleAssign
    Roles --> AdminUsers

    Analytics --> AnalyticsDash

    Audit --> AuditViewer

    Settings --> SettingsNav
    Settings --> PlatformSettings

    TeamOrg --> TeamMemberCard

    QGen --> AdminService
    Workflows --> AdminService
```
