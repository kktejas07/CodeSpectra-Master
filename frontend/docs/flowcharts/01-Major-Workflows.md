# CodeSpectra Major Workflow Flowcharts

> **Auto-Generated**: Internal Engineering documentation.

> **Auto-generated from codebase audit** — Last updated: 2026-07-08
> Sources: `auth-context.tsx`, `signup/route.ts`, `login/route.ts`, `session/route.ts`,
> `rbac.ts`, `page-permissions.ts`, `piston.ts`, `ai_router.py`, `quality-rater.ts`,
> `scanner-modes.ts`, `github-service.ts`, `razorpay-server.ts`, `interview-service.ts`,
> `certifications/route.ts`, `analyze-code/route.ts`, `local-code-analyzer.ts`

---

## 1. User Registration Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#6366f1', 'tertiaryColor': '#eef2ff', 'lineColor': '#6366f1' }}}%
graph TD
    A(["User visits\n/auth/signup"]) --> B[Fill registration form:\nname, email, password]
    B --> C{Client validation}
    C -->|Invalid fields| B
    C -->|Valid| D[POST /api/auth/signup\n{ email, password, name }]

    D --> E[Server: lowercase+trim email]
    E --> F[MongoDB: findOne\nby normalized email]
    F --> G{User exists?}

    G -->|Yes| H[Return 409\n"Account already exists"]
    H --> I[Show error toast]
    I --> B

    G -->|No| J[bcrypt.hash(password, 12)\ncost factor=12]
    J --> K[Generate UUID v4]

    K --> L[Insert MongoDB document:\n  _id: uuid,\n  email: normalizedEmail,\n  name: name || null,\n  passwordHash: hashed,\n  role: 'user',\n  emailVerified: false,\n  createdAt: now,\n  updatedAt: now]

    L --> M[normalizeUserRole('user')\n→ returns 'user']

    M --> N[Create JWT session:\n  new SignJWT({ uid, email, role })\n  HS256, exp: 7d]
    N --> O[Set httpOnly cookie:\n  'codespectra_session'\n  secure, sameSite=lax, path=/]

    O --> P[Return 200:\n{ user: { id, email, role, name } }]
    P --> Q[Client: setUser in AuthContext]
    Q --> R[Router.push('/dashboard')]
    R --> S[Redirected to dashboard]
```

---

## 2. Login & Authentication Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#6366f1' }}}%
graph TD
    A(["User visits /auth/login"]) --> B{Choose method}

    B -->|Email/Password| C[Fill email + password]
    C --> D[POST /api/auth/login]
    D --> E[Lowercase+trim email]
    E --> F[MongoDB: findOne({ email })]
    F --> G{User found?}

    G -->|No| H[Return 401:\n"Invalid email or password"]
    H --> I[Show error] --> C

    G -->|Yes| J{Has passwordHash?}

    J -->|No| K[Return 400:\n"Use Google/GitHub\nor reset password"]
    K --> I

    J -->|Yes| L[bcrypt.compare(password,\n  user.passwordHash)]

    L --> M{Match?}
    M -->|No| H

    M -->|Yes| N[normalizeUserRole(role)]
    N --> O[signSessionToken({ uid, email, role })\nJWT HS256, 7d expiry]

    O --> P[Set httpOnly cookie:\n  'codespectra_session']
    P --> Q[Return 200: { user: { id,\n  email, role, name } }]

    Q --> R[AuthContext.setUser()\nloading=false]
    R --> S[Router.push('/dashboard')]

    S --> T[DashboardLayout mounts]
    T --> U[fetch /api/auth/session\nwith credentials: 'include']

    U --> V{Session cookie valid?}

    V -->|Yes - Firebase| W[Firebase Admin:\nverifySessionCookie()\nLookup MongoDB profile]
    V -->|Yes - JWT| X[verifySessionToken()\nLookup MongoDB profile]
    V -->|No| Y[setUser(null)\nsetSessionExpired(true)]
    Y --> Z[Redirect to /auth/login]

    W --> AA[setUserRole(response.role)\nsetUserPlan(response.plan)]
    X --> AA

    AA --> AB[5-min heartbeat interval:\n  getIdToken(true)\n  POST /api/auth/session]

    B -->|Google OAuth| AC[signInWithGoogle()]
    AC --> AD[Firebase: signInWithPopup\nGoogleAuthProvider]
    AD --> AE[getIdToken() → idToken]
    AE --> AF[POST /api/auth/session\n{ idToken }]
    AF --> AG[Firebase Admin:\nverifyIdToken → sessionCookie]
    AG --> AH[ensureUserProfile\n(upsert MongoDB)]
    AH --> AI[Set cookie] --> Q

    B -->|GitHub OAuth| AJ[signInWithGithub()]
    AJ --> AK[Firebase: signInWithPopup\nGithubAuthProvider]
    AK --> AE
```

---

## 3. Authorization & RBAC Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ef4444' }}}%
graph TD
    A(["User navigates to\n/dashboard/...</path>"]) --> B[Middleware runs:\ncheck session cookie]

    B --> C{Authenticated?}
    C -->|No| D[Redirect to /auth/login\n?redirectTo=...]
    D --> E[User authenticates]
    E --> F[Redirect back to\noriginal path]

    C -->|Yes| G[Fetch user role\nfrom database]

    G --> H{isSuperAdmin(role)?}
    H -->|Yes| I[Unrestricted access\n→ NextResponse.next()]
    I --> J[Show ALL dashboard\npages + admin pages]

    H -->|No| K[Check ACCESSIBLE_PAGES\nfor user's role]

    K --> L{Pathname in\nallowed pages?}

    L -->|Yes| M[Allow → render page]
    L -->|No| N[Redirect to\ndefaultDashboard]

    %% Component-level guard flow
    M --> O[React component mounts]
    O --> P[usePageGuard(requiredRole)]
    P --> Q{Auth loaded?}
    Q -->|No| R[Show LoadingSpinner]
    R --> P
    Q -->|Yes| S{Role >= requiredRole?}
    S -->|No| T[Show AccessDenied]
    S -->|Yes| U[Render page content]

    %% API-level flow
    subgraph "API Route Protection"
        V["API Route Handler\nGET /api/admin/..."]
        V --> W[requireSuperAdmin()]
        W --> X{User is superadmin?}
        X -->|No| Y[Return 403 Forbidden]
        X -->|Yes| Z[Process request]
    end

    M --> V

    %% Role hierarchy
    subgraph "Role Hierarchy"
        R1["user\nBasic platform access\nDashboard, Challenges,\nLearning, Profile"]
        R2["tenant_admin\nOrg management\nTeam, Activity,\n+ all user access"]
        R3["superadmin\nFull platform control\nSystem config, RBAC,\nUsers, Audit, Billing,\n+ all lower access"]
    end

    R1 --> R2 --> R3
```

---

## 4. Code Submission & Grading Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#10b981' }}}%
graph TD
    A(["User writes solution\nin Monaco Editor"]) --> B[Click "Run"\nto test code]

    B --> C[executeOnce({\n  language, source, stdin\n})]
    C --> D{PISTON_URL\nconfigured?}

    D -->|Yes: Public/Docker Piston| E[resolveLanguageVersion()]
    E --> F[Acquire concurrent\nslot (rate limit)]
    F --> G[POST /execute\n{ language, version,\n  files, stdin,\n  run_timeout: 5000ms }]

    D -->|No| H{isLocallySupported?}

    H -->|python/js/ts/bash| I[localExecuteOnce()\nsubprocess execution]
    H -->|Other languages| J[Throw error:\nno Piston available]

    G --> K{Response OK?}
    K -->|Yes| L[Return { run: stdout,\n  stderr, code, output }]

    K -->|401/403/429| M{isLocallySupported?}
    M -->|Yes| I
    M -->|No| J

    K -->|Network error| M

    L --> N[Display run output\nin test panel]
    N --> O{"Ready to\nsubmit?"}

    O -->|No| P[Fix code → re-run]
    P --> B

    O -->|Yes| Q[Click "Submit"]
    Q --> R[POST /api/submissions\n{ code, language,\n  problemId, testCases }]

    R --> S[Run all test cases\nthrough Piston Engine]

    S --> T[Compare outputs\nagainst expected values]
    T --> U[Calculate passed/total]

    U --> V[Send to AI Code Analysis:\nPOST /internal/ai/code-analysis]

    V --> W[Gemini 3 Flash analyzes:\n  - time_complexity\n  - space_complexity\n  - efficiency_score 0-100\n  - edge_cases_covered\n  - readability_score 0-100\n  - summary]

    W --> X[Calculate XP earned\nbased on:\n  - passed tests\n  - efficiency score\n  - difficulty level\n  - first_solve bonus]

    X --> Y[Store submission in MongoDB]
    Y --> Z[Update xp_events collection]
    Z --> AA[Return to client:\n  submissionId, passed, total,\n  score, aiAnalysis, xpEarned]

    AA --> AB[Display results screen:\n  ✅/❌ per test case\n  AI complexity analysis\n  XP earned notification\n  Updated leaderboard rank]

    AB --> AC[Check achievements\nfor new unlocks]
```

---

## 5. Static Analysis Pipeline

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#8b5cf6' }}}%
graph TD
    A(["User inputs code or\nselects GitHub file"]) --> B[POST /api/analyze-code\n{ code, language, meta }]

    B --> C[analyzeCodeLocally()\nLine-by-line scan]

    subgraph "Local Analyzer Rules"
        D["Check for console.log\n→ warning: remove debug code"]
        E["Check for 'var'\n→ warning: use const/let"]
        F["Check for empty catch {}\n→ error: handle errors"]
        G["Check for == vs ===\n→ warning: use strict equality"]
        H["Check line length > 100\n→ info: max-len"]
        I["Check TODO without context\n→ info: add context"]
    end

    C --> D
    C --> E
    C --> F
    C --> G
    C --> H
    C --> I

    D --> J[Aggregate results]

    subgraph "Metrics Calculation"
        K["Calculate Cyclomatic Complexity\n= code.split('{').length * 2\n(capped at 100)"]
        L["Maintainability Index\n= max(0, 100 - complexity)"]
        M["Test Coverage (random)\n= Math.random() * 80"]
        N["Quality Score\n= 100 - errors*20\n  - warnings*5\n  - info*2\n  - min(30, len/100)"]
    end

    J --> K
    K --> L
    J --> N
    N --> O["{ quality, issues[], suggestions[],\n  bugs, vulnerabilities, codeSmells,\n  complexityScore, maintainabilityIndex,\n  testCoveragePercentage, timeMs }"]

    O --> P{User authenticated?}
    P -->|Yes| Q[Insert scan record\nin MongoDB scans collection]
    Q --> R[Insert metrics:\n  overall_quality_score\n  bugs, vulnerabilities\n  code_smells, complexity\n  security_hotspots\n  duplicated_code_percentage\n  maintainability_index\n  test_coverage_percentage\n  metrics_json]

    P -->|No| S[Skip persistence]

    R --> T[Return to client:\n  { ...payload, scanId,\n    scannerLanguage }]

    T --> U[Display:\n  - Quality score + letter grade\n  - Issue list by severity\n  - Code smells & bugs count\n  - Fix suggestions panel\n  - Complexity gauge\n  - Test coverage estimate]

    subgraph "Quality Rating A-E"
        V["Score 0-100\n→ Letter grade"]
        V1["8.0+ → A (Excellent)\n7.0-7.9 → B (Good)\n5.0-6.9 → C (Fair)\n3.0-4.9 → D (Poor)\n<3.0 → E (Critical)"]
    end

    U --> V
    V --> V1
```

---

## 6. AI Code Review Pipeline

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ec4899' }}}%
graph TD
    A(["Trigger Code Review"]) --> B{Review Source}

    B -->|Manual| C["User clicks\n'Review with AI'\nin scanner"]
    B -->|On Submission| D["Auto-triggered\nafter grading"]

    C --> E[POST /internal/ai/code-review]
    D --> E

    E --> F[Build system message:\n"Senior staff engineer\n  doing strict code review"
    Constraints:\n  Return JSON ONLY]

    F --> G[Build user message:\n  Language: {lang}\n  Context: {scan issues}\n  Code: {snippet up to 12k chars}]

    G --> H[Select model:\n"reasoning"\n→ Claude Sonnet 4.5]

    H --> I[_build_chat():\n  provider='anthropic'\n  model='claude-sonnet-4-5-20250929'\n  system_message]

    I --> J[Stream LLM response]
    J --> K[Parse JSON from response:\n  handle ```json fences\n  find first { or [\n  best-effort extraction]

    K --> L{Parse successful?}
    L -->|Yes| M[Use parsed response]
    L -->|No| N[Fallback: wrap raw\n text as summary]

    M --> O[Return structured review:\n  summary: string\n  strengths: string[]\n  concerns: [{severity,\n    title, detail, line}]\n  suggestions: string[]\n  overall_rating: 1-10]

    O --> P[Display in review panel:\n  ⭐ Overall rating badge\n  ✅ Strengths cards\n  ⚠️ Concern list by severity\n  💡 Suggestions with code]

    P --> Q{Apply fix?}
    Q -->|Yes| R[Generate AI fixes:\n  POST /api/ai/code-review\n  { issues[], scanId }]

    R --> S[Agentic fix loop:\n  Step 1: Analyze code + goal\n  Step 2: Apply highest-impact change\n  Step 3: Re-analyze\n  Step 4: Return final code + step log]

    S --> T["Return fix suggestions:\n  { fixes[], thought,\n    next_code, summary }"]

    T --> U[Show diff in code viewer]
    U --> V{Apply fix?}
    V -->|Yes| W[POST /api/ai/fixes/{id}/apply\n→ Update code in place]
    V -->|No| X[Discard suggestion]
    W --> Y[Re-analyze code\nwith fix applied]
    Y --> Z[Show improved score]

    Q -->|No| END["Review complete"]
    X --> END
    Z --> END
```

---

## 7. Certificate Generation Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#f59e0b' }}}%
graph TD
    A(["User passes exam\nwith required score"]) --> B[POST /api/certifications\n{ examId, userId }]

    B --> C[Lookup exam record\nin MongoDB]
    C --> D{Exam passed?}
    D -->|No| E[Return error:\n"Exam not passed"]
    D -->|Yes| F[Check for existing\ncertificate (dedup)]

    F --> G{Certificate\nalready exists?}
    G -->|Yes, valid| H[Return existing\ncertificate URL]
    G -->|No| I[Generate verification code:\n  crypto.randomBytes(16)\n  → hex string]

    I --> J[Generate Certificate SVG:\n  - User display name\n  - Exam title\n  - Issue date\n  - Expiry date\n  - Unique verification code\n  - Badge/logo\n  - QR code]

    J --> K[qrcode.toDataURL(\n  `/cert/verify?code={code}`)]

    K --> L[Save to MongoDB:\n  certificates collection\n  { userId, examId, code,\n    title, issuedAt, expiry,\n    svgPath, qrDataUrl }]

    L --> M[Return certificate:\n  { url, verifyCode, svg,\n    qrDataUrl, issuedAt }]

    M --> N[Display in\n/dashboard/certifications]

    N --> O["Certificate Actions"]]
    O --> P[Download SVG]
    O --> Q[Share verification link]
    O --> R[View on LinkedIn]

    %% Verification Flow
    subgraph "Public Verification"
        V1["Visitor navigates to\n/cert/verify?code=XXX"]
        V1 --> V2[GET /api/certifications/verify\n?code=XXX]
        V2 --> V3[Lookup by code\nin MongoDB]
        V3 --> V4{Found + valid?}
        V4 -->|Yes| V5[Return certificate\ninfo: holder, exam,\ndate, valid=true]
        V4 -->|No| V6[Return:\nvalid=false]
        V5 --> V7[Display verified\nbadge + details]
        V6 --> V8[Show "Not found"\nor "Expired"]
    end
```

---

## 8. Billing & Payment Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#3399ff' }}}%
graph TD
    A(["User browses\n/dashboard/pricing"]) --> B["Select plan:\n  pricing_tiers collection\n  + pricing_features"]
    B --> C[Click "Subscribe"\nor "Upgrade"]

    C --> D[POST /api/billing/create-order\n{ planId, period (monthly/yearly) }]

    D --> E[Load Razorpay credentials:\n  1. MongoDB platform_settings\n  2. Env vars (fallback)]

    E --> F{Credentials valid?}
    F -->|No| G[Return error:\n"Razorpay not configured"]
    F -->|Yes| H[razorpay.orders.create({\n  amount: price_in_paise,\n  currency: 'INR',\n  receipt: uuid,\n  notes: { planId, userId }})]

    H --> I[Return { orderId, amount,\n  key_id (publishable key) }]

    I --> J[Initialize Razorpay\nCheckout modal:\n  key: key_id\n  order_id: orderId\n  prefill: { email, name }]

    J --> K[User completes payment\nvia UPI / Card / NetBanking]

    K --> L[Checkout fires callback:\n  { razorpay_payment_id,\n    razorpay_order_id,\n    razorpay_signature }]

    L --> M[POST /api/billing/verify\n{ order_id, payment_id,\n  signature }]

    M --> N[crypto.createHmac('sha256',\n  key_secret)\n  .update(order_id + '|' + payment_id)\n  .digest('hex') === signature]

    N --> O{Signature match?}
    O -->|No| P[Return error:\n"Payment verification failed"]
    O -->|Yes| Q[Update MongoDB:\n  user.plan = selectedPlan\n  user.subscription.active = true\n  Insert payment record]

    Q --> R[Return { verified: true,\n  subscription: { plan, status } }]

    R --> S[Show success toast:\n"Plan activated"]

    %% Webhook async flow
    subgraph "Webhook (Async)"
        W1[Razorpay sends POST\n/api/billing/webhook]
        W1 --> W2[verifyWebhookSignature()]
        W2 --> W3{Signature valid?}
        W3 -->|No| W4[401 Unauthorized]
        W3 -->|Yes| W5[Parse event type:\n  payment.captured\n  subscription.charged\n  subscription.cancelled]
        W5 --> W6[Upsert payment/\nsubscription in MongoDB]
        W6 --> W7[200 OK]
    end
```

---

## 9. Admin Workflow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ef4444' }}}%
graph TD
    A(["Superadmin logs in\n→ redirected to\n/dashboard/admin/system"]) --> B[Operations Overview\n  - Platform metrics\n  - Recent activity\n  - System health]

    B --> C{Admin action}

    C -->|User Management| D[Navigate to\n/dashboard/admin/users]

    D --> E[User management table:\n  - Search/filter users\n  - Paginated list\n  - Status badges\n  - Role indicators]

    E --> F[Select user → actions:]
    F --> G[Edit user details]
    F --> H[Toggle active/inactive]
    F --> I[Assign role\n<RoleAssignmentDialog>]

    I --> J[Open role assignment dialog]
    J --> K[Select role:\n  superadmin / tenant_admin / user]
    K --> L[Click "Save Changes"]

    L --> M[MongoDB update:\n  user.role = newRole\n  audit_log insert\n  { userId, action, changes }]

    M --> N{isSuperAdmin(newRole)?}
    N -->|Yes| O[User gets\nunrestricted access]
    N -->|No| P[User gets restricted\nby ACCESSIBLE_PAGES]

    C -->|RBAC Config| Q[Navigate to\n/dashboard/admin/permissions]

    Q --> R[View Permission Matrix:\n  Routes × Roles table]
    R --> S[Filter by role]
    S --> T[Toggle page permissions\n  ADMIN_ONLY_ROUTES\n  TENANT_ADMIN_ROUTES\n  ALL_USER_ROUTES]

    T --> U[Save → yarn build\nvalidates TypeScript]
    U --> V[Middleware + component\nguards enforce new rules]

    C -->|Audit| W[Navigate to\n/dashboard/admin/audit-logs]

    W --> X[View audit trail:\n  - User actions\n  - Permission changes\n  - Login history\n  - API access logs]

    C -->|Billing/Plans| Y[Navigate to\n/dashboard/admin/plans]

    Y --> Z[Manage subscription plans:\n  pricing_tiers CRUD\n  feature flags\n  pricing rules]

    C -->|Settings| AA[Navigate to\n/dashboard/admin/settings]

    AA --> AB[Platform Settings\nSidebar Navigation:\n  - General\n  - Integrations\n  - Security\n  - Email\n  - Scanner\n  - Developer]

    C -->|System| AC[Navigate to\n/dashboard/admin/system]

    AC --> AD[System management:\n  - CDN & Edge\n  - Speed Insights\n  - Workflows\n  - AI Inventory\n  - Question Generator]
```

---

## 10. Interview Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#0ea5e9' }}}%
graph TD
    A(["User navigates to\n/dashboard/interviews"]) --> B[Select interview type:\n  Technical / Behavioral /\n  System Design]
    B --> C[Select role:\n  Software Engineer / Frontend /\n  Backend / ML / DevOps ...]

    C --> D[Configure interview:\n  - Difficulty level\n  - Duration (minutes)\n  - Topics to cover\n  - Optional: upload resume]

    D --> E[Click "Start Interview"]

    E --> F[generateOpeningQuestion(\n  role, interviewType, resumeInfo)]

    F --> G[AI generates opening\nquestion via GPT-4 Turbo:\n  "Tell me about yourself..."]

    G --> H[Display question\nStart timer]

    H --> I[User types answer\n  OR speaks (speech input)]
    I --> J[Click "Submit Answer"]

    J --> K[analyzeAnswerQuality(\n  question, answer)]

    K --> L["Score:\n  completeness 0-100\n  relevance 0-100\n  depth 0-100"]

    L --> M{needsFollowUp?}
    M -->|Yes| N[generateFollowUpQuestion(\n  answer, conversationContext)]

    N --> O["AI generates contextual\nfollow-up based on:\n  - Previous answer\n  - Interview history\n  - Difficulty progression"]

    O --> P[Display follow-up question\n→ back to timer]

    P -.-> I

    M -->|No| Q{Time elapsed\nor all questions\ncovered?}

    Q -->|No| R[Ask next question\nfrom remaining topics]
    R --> P

    Q -->|Yes| S[End interview]

    S --> T[generateInterviewFeedback(\n  allResponses, context)]

    T --> U["AI feedback across 6 dimensions:\n  1. Technical Knowledge (0-100)\n  2. Communication (0-100)\n  3. Problem Solving (0-100)\n  4. Depth of Knowledge (0-100)\n  5. Response Quality (0-100)\n  6. Time Management (0-100)"]

    U --> V[Each dimension includes:\n  - Score + feedback text\n  - 2-3 actionable suggestions]

    V --> W[Save interview transcript\n+ feedback to MongoDB]

    W --> X[Display results:\n  - Overall scores radar chart\n  - Per-question breakdown\n  - Improvement suggestions\n  - Share report option]

    X --> Y[User can view at\n/dashboard/interviews/results]

    X --> Z[Admin/Recruiter view at\n/dashboard/interviews/feedback]
```

---

## Legend

- 🟣 **Rounded rectangles** = Start / End states
- 🔵 **Rectangles** = Process steps
- 🔶 **Diamonds** = Decision / Branch points
- 🟢 **Subgraphs** = Grouped related logic
- → **Arrows** = Flow direction

> All diagrams based on actual codebase implementation at commit time.
> References to specific files and line numbers available in the source.
