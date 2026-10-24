# CodeSpectra Use Case Diagrams

> **Auto-Generated**: Internal Engineering documentation.

> **Auto-generated from codebase audit** — Last updated: 2026-07-08

---

## 1. Student / Developer Use Cases

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#6366f1', 'lineColor': '#94a3b8', 'textColor': '#1e293b'}}}%%
usecaseDiagram
    actor "Student\nDeveloper" as Student
    actor "AI\nAssistant" as AI

    package "Learning & Practice" {
        usecase "Browse Problem\nCatalog" as UC1
        usecase "Solve Coding\nChallenges" as UC2
        usecase "View Problem\nHints" as UC3
        usecase "Track Learning\nProgress" as UC4
        usecase "Earn\nAchievements" as UC5
        usecase "Participate in\nArena" as UC6
    }

    package "Code & Submit" {
        usecase "Write Code in\nEditor" as UC7
        usecase "Run Code\n(Compile/Execute)" as UC8
        usecase "Submit\nSolution" as UC9
        usecase "View Test\nResults" as UC10
        usecase "Review Auto-\nGrading Score" as UC11
    }

    package "AI & Analysis" {
        usecase "Request AI Code\nReview" as UC12
        usecase "Get AI\nSuggestions" as UC13
        usecase "Analyze Code\nQuality" as UC14
        usecase "View Skill\nAnalytics" as UC15
        usecase "Chat with AI\nAssistant" as UC16
    }

    package "Assessment" {
        usecase "Take Timed\nExams" as UC17
        usecase "Complete Coding\nAssessments" as UC18
        usecase "Earn\nCertificates" as UC19
        usecase "Verify Identity\n(Proctoring)" as UC20
    }

    package "Profile & Career" {
        usecase "Build Developer\nProfile" as UC21
        usecase "View ID\nCard" as UC22
        usecase "Browse Job\nListings" as UC23
        usecase "Upload\nResume" as UC24
    }

    Student --> UC1
    Student --> UC2
    Student --> UC3
    Student --> UC4
    Student --> UC5
    Student --> UC6
    Student --> UC7
    Student --> UC8
    Student --> UC9
    Student --> UC10
    Student --> UC11
    Student --> UC12
    Student --> UC13
    Student --> UC14
    Student --> UC15
    Student --> UC16
    Student --> UC17
    Student --> UC18
    Student --> UC19
    Student --> UC20
    Student --> UC21
    Student --> UC22
    Student --> UC23
    Student --> UC24

    AI --> UC12
    AI --> UC13
    AI --> UC16

    note right of UC12: Uses Claude Sonnet 4.5\nfor deep code review
    note right of UC3: Progressive hints\nlevels 1-4 via Gemini
```

---

## 2. Recruiter / Enterprise Use Cases

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#0ea5e9', 'lineColor': '#94a3b8', 'textColor': '#1e293b'}}}%%
usecaseDiagram
    actor Recruiter as Recruiter

    package "Assessment Management" {
        usecase "Create Custom\nAssessments" as RC1
        usecase "Configure\nRubrics" as RC2
        usecase "Set Time\nLimits" as RC3
        usecase "Select Difficulty\nLevels" as RC4
    }

    package "Candidate Management" {
        usecase "Invite\nCandidates" as RC5
        usecase "Review\nResults" as RC6
        usecase "Compare\nCandidates" as RC7
        usecase "View Skill\nReports" as RC8
    }

    package "Interview & Hire" {
        usecase "Conduct AI\nInterviews" as RC9
        usecase "View AI\nFeedback" as RC10
        usecase "Make Hiring\nDecisions" as RC11
        usecase "Generate\nReports" as RC12
    }

    package "Organization" {
        usecase "Manage Team\nMembers" as RC13
        usecase "Configure\nBranding" as RC14
        usecase "View Team\nAnalytics" as RC15
    }

    Recruiter --> RC1
    Recruiter --> RC2
    Recruiter --> RC3
    Recruiter --> RC4
    Recruiter --> RC5
    Recruiter --> RC6
    Recruiter --> RC7
    Recruiter --> RC8
    Recruiter --> RC9
    Recruiter --> RC10
    Recruiter --> RC11
    Recruiter --> RC12
    Recruiter --> RC13
    Recruiter --> RC14
    Recruiter --> RC15

    note right of RC9: AI-powered dynamic\nfollow-up questions
    note right of RC10: 6 dimension scoring:\nTechnical, Communication,\nProblem Solving, Depth,\nQuality, Time Management
```

---

## 3. Admin / Superadmin Use Cases

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#ef4444', 'lineColor': '#94a3b8', 'textColor': '#1e293b'}}}%%
usecaseDiagram
    actor "Platform Admin\n(Superadmin)" as Admin
    actor "Organization Admin\n(Tenant Admin)" as OrgAdmin

    package "User Management" {
        usecase "View All\nUsers" as A1
        usecase "Create / Edit\nUsers" as A2
        usecase "Assign\nRoles" as A3
        usecase "Activate /\nDeactivate" as A4
    }

    package "RBAC Configuration" {
        usecase "Configure\nPermissions" as A5
        usecase "Manage Role-\nPage Mapping" as A6
        usecase "View Permission\nMatrix" as A7
    }

    package "System Administration" {
        usecase "View Audit\nLogs" as A8
        usecase "Configure\nIntegrations" as A9
        usecase "Manage CDN\n& Edge" as A10
        usecase "Monitor Speed\nInsights" as A11
        usecase "Configure\nPlatform Settings" as A12
        usecase "View AI\nInventory" as A13
        usecase "Manage\nWorkflows" as A14
    }

    package "Billing & Plans" {
        usecase "Manage\nPricing Tiers" as A15
        usecase "View\nSubscriptions" as A16
        usecase "Configure\nPayment Gateway" as A17
        usecase "View Billing\nAnalytics" as A18
    }

    package "Content Management" {
        usecase "Manage\nProblems" as A19
        usecase "Generate\nQuestions (AI)" as A20
        usecase "Manage\nHackathons" as A21
        usecase "Manage\nCodeathons" as A22
        usecase "Manage\nExams" as A23
    }

    package "Organization Mgmt" {
        usecase "Manage\nTeam" as O1
        usecase "View Team\nActivity" as O2
    }

    Admin --> A1
    Admin --> A2
    Admin --> A3
    Admin --> A4
    Admin --> A5
    Admin --> A6
    Admin --> A7
    Admin --> A8
    Admin --> A9
    Admin --> A10
    Admin --> A11
    Admin --> A12
    Admin --> A13
    Admin --> A14
    Admin --> A15
    Admin --> A16
    Admin --> A17
    Admin --> A18
    Admin --> A19
    Admin --> A20
    Admin --> A21
    Admin --> A22
    Admin --> A23

    OrgAdmin --> O1
    OrgAdmin --> O2

    note right of A5: Route-role mapping\nin page-permissions.ts
    note right of A20: Uses AI problem\ngenerator endpoint
```

---

## 4. Anonymous / Public Use Cases

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#84cc16', 'lineColor': '#94a3b8', 'textColor': '#1e293b'}}}%%
usecaseDiagram
    actor "Anonymous\nVisitor" as Visitor

    package "Public Access" {
        usecase "Browse Landing\nPage" as P1
        usecase "View Features\n& Pricing" as P2
        usecase "Read\nBlog" as P3
        usecase "View\nDocumentation" as P4
        usecase "Check Platform\nStatus" as P5
        usecase "View\nFAQ" as P6
        usecase "Read Security\nPolicy" as P7
        usecase "View Terms\n& Privacy" as P8
    }

    package "Certifications" {
        usecase "View Public\nCertifications" as P9
        usecase "Verify\nCertificate" as P10
    }

    package "Content Discovery" {
        usecase "View Problem\nCatalog" as P11
        usecase "Browse Open\nSource Projects" as P12
        usecase "View API\nReference" as P13
    }

    package "Auth Entry" {
        usecase "Sign Up" as P14
        usecase "Log In" as P15
        usecase "Reset\nPassword" as P16
    }

    Visitor --> P1
    Visitor --> P2
    Visitor --> P3
    Visitor --> P4
    Visitor --> P5
    Visitor --> P6
    Visitor --> P7
    Visitor --> P8
    Visitor --> P9
    Visitor --> P10
    Visitor --> P11
    Visitor --> P12
    Visitor --> P13
    Visitor --> P14
    Visitor --> P15
    Visitor --> P16
