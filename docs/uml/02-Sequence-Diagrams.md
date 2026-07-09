# CodeSpectra Sequence Diagrams

> **Auto-generated from codebase audit** — Last updated: 2026-07-08

---

## 1. User Registration (Email/Password)

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#6366f1' }}}%%
sequenceDiagram
    actor User
    participant Browser as Browser (Next.js)
    participant SignupAPI as /api/auth/signup
    participant MongoDB as MongoDB
    participant Session as Session Service
    participant Cookie as HTTP Cookie

    User->>Browser: Fill registration form\n(name, email, password)
    Browser->>Browser: Validate inputs
    Browser->>SignupAPI: POST /api/auth/signup\n{ email, password, name }

    activate SignupAPI
    SignupAPI->>SignupAPI: Normalize email\n(toLowerCase().trim())
    SignupAPI->>MongoDB: Check user collection\nfor existing email
    MongoDB-->>SignupAPI: No existing user

    alt Email already exists
        SignupAPI-->>Browser: 409 Conflict\n"Account already exists"
        Browser-->>User: Show error message
    else New user
        SignupAPI->>SignupAPI: bcrypt.hash(password, 12)
        SignupAPI->>SignupAPI: Generate UUID
        SignupAPI->>MongoDB: insertOne({ _id, email,\n  name, passwordHash,\n  role: 'user',\n  emailVerified: false,\n  createdAt, updatedAt })
        MongoDB-->>SignupAPI: Insert confirmed

        SignupAPI->>Session: setSessionCookie({ uid, email, role })
        activate Session
        Session->>Session: SignJWT(payload)\nHS256 | 7d expiry
        Session->>Cookie: Set httpOnly cookie\n'codespectra_session'
        deactivate Session

        SignupAPI-->>Browser: 200 { user: { id, email,\n  role, name } }
        deactivate SignupAPI
        Browser-->>User: Redirect to /dashboard
    end
```

---

## 2. User Login (with JWT Session)

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#6366f1' }}}%%
sequenceDiagram
    actor User
    participant Browser as Browser
    participant LoginAPI as /api/auth/login
    participant MongoDB as MongoDB
    participant Session as Session Service
    participant Cookie as Cookie Store
    participant Dashboard as Dashboard Shell

    User->>Browser: Enter email + password
    Browser->>LoginAPI: POST /api/auth/login\n{ email, password }

    activate LoginAPI
    LoginAPI->>LoginAPI: Normalize email (lowercase)
    LoginAPI->>MongoDB: db.collection('user')\n.findOne({ email })
    MongoDB-->>LoginAPI: User document

    alt User not found
        LoginAPI-->>Browser: 401 "Invalid email\nor password"
    else No passwordHash
        LoginAPI-->>Browser: 400 "Use Google/GitHub\nor reset password"
    else Password check
        LoginAPI->>LoginAPI: bcrypt.compare(password,\n  user.passwordHash)

        alt Invalid password
            LoginAPI-->>Browser: 401 "Invalid email\nor password"
        else Valid
            LoginAPI->>LoginAPI: normalizeUserRole(role)
            LoginAPI->>Session: setSessionCookie({ uid, email, role })
            activate Session
            Session->>Session: SignJWT(payload)\nHS256, exp: 7d
            Session->>Cookie: Set httpOnly secure\nsameSite=lax cookie
            deactivate Session

            LoginAPI-->>Browser: 200 { user: { id, email,\n  role, name } }
            deactivate LoginAPI

            Browser->>Browser: Store user in AuthContext
            Browser-->>User: Redirect to /dashboard
            Browser->>Dashboard: Render dashboard
            Dashboard->>Dashboard: fetch /api/auth/session\n(verify cookie)
            Dashboard->>Dashboard: Set userRole, userPlan
        end
    end
```

---

## 3. Google OAuth Login

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#ea4335' }}}%%
sequenceDiagram
    actor User
    participant Browser as Browser
    participant AuthCtx as AuthContext (Firebase)
    participant Firebase as Firebase Auth
    participant Google as Google Identity
    participant SessionAPI as /api/auth/session
    participant Backend as Next.js Backend
    participant MongoDB as MongoDB

    User->>Browser: Click "Sign in with Google"
    Browser->>AuthCtx: signInWithGoogle()
    AuthCtx->>Firebase: signInWithPopup(auth,\n  GoogleAuthProvider)
    Firebase->>Google: OAuth consent screen
    Google-->>User: Select Google account
    User-->>Google: Grant permissions
    Google-->>Firebase: OAuth tokens
    Firebase-->>AuthCtx: UserCredential (uid, email,\n  displayName, photoURL)

    AuthCtx->>AuthCtx: setUser(toAuthUser(cred.user))
    AuthCtx->>Firebase: getIdToken()
    Firebase-->>AuthCtx: idToken (JWT)

    AuthCtx->>SessionAPI: POST /api/auth/session\n{ idToken }
    activate SessionAPI
    SessionAPI->>Backend: getAdminAuthInstance()
    Backend->>Firebase: admin.auth().verifyIdToken()
    Firebase-->>Backend: Decoded token

    alt Token valid
        Backend->>Backend: createSessionCookie(idToken,\n  { expiresIn: 7d })
        Backend->>Backend: Set httpOnly cookie\n'codespectra_session'
        Backend->>MongoDB: ensureUserProfile(uid,\n  email, displayName)
        MongoDB-->>Backend: Upsert user profile
        SessionAPI-->>AuthCtx: 200 { ok: true }
    else Token invalid
        SessionAPI-->>AuthCtx: 401 { error }
    end
    deactivate SessionAPI

    Browser-->>User: Redirect to /dashboard
```

---

## 4. Code Submission & Auto-Grading

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#10b981' }}}%%
sequenceDiagram
    actor User
    participant Editor as Monaco Editor
    participant SubmissionAPI as /api/submissions
    participant Piston as Piston Engine
    participant AIAnalyzer as AI Code Analyzer
    participant MongoDB as MongoDB
    participant XP as XP Service

    User->>Editor: Write solution code
    User->>Editor: Click "Submit"
    Editor->>SubmissionAPI: POST /api/submissions\n{ code, language,\n  problemId, testCases }

    activate SubmissionAPI
    SubmissionAPI->>SubmissionAPI: Extract test cases
    SubmissionAPI->>Piston: executeOnce({ language,\n  source, stdin })

    alt Piston not available
        Piston-->>SubmissionAPI: Fallback to local executor\n(python/js/ts/bash only)
    end

    Piston-->>SubmissionAPI: { run: { stdout, stderr,\n  code, output } }

    SubmissionAPI->>SubmissionAPI: Compare output\nwith expected results
    SubmissionAPI->>SubmissionAPI: Calculate passed/total

    SubmissionAPI->>AIAnalyzer: POST /internal/ai/code-analysis\n{ code, language, problemTitle,\n  passedTests, totalTests }
    activate AIAnalyzer
    AIAnalyzer->>AIAnalyzer: LLM analysis via Gemini Flash
    AIAnalyzer-->>SubmissionAPI: { timeComplexity, spaceComplexity,\n  efficiencyScore, edgeCases,\n  readabilityScore, summary }
    deactivate AIAnalyzer

    SubmissionAPI->>MongoDB: Insert submission record
    SubmissionAPI->>MongoDB: Update xp_events

    SubmissionAPI-->>Editor: { submissionId, passed, total,\n  score, aiAnalysis, xpEarned }
    deactivate SubmissionAPI

    Editor->>User: Show results UI\nTest results + AI analysis
```

---

## 5. AI Code Review Pipeline

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#8b5cf6' }}}%%
sequenceDiagram
    actor User
    participant Scanner as Scanner UI
    participant AnalyzeAPI as /api/analyze-code
    participant LocalAnalyzer as Local Code Analyzer
    participant AIService as AI Service (internal)
    participant BackendProxy as FastAPI Proxy
    participant LLM as LLM (Claude Sonnet 4.5)
    participant MongoDB as MongoDB

    User->>Scanner: Paste code / select file
    Scanner->>Scanner: parseScannerMode(url)
    Scanner->>AnalyzeAPI: POST /api/analyze-code\n{ code, language }

    activate AnalyzeAPI
    AnalyzeAPI->>LocalAnalyzer: analyzeCodeLocally(code, language)
    LocalAnalyzer->>LocalAnalyzer: Line-by-line heuristics:\nconsole.log, var, ==, empty catch,\nlong lines, TODO comments
    LocalAnalyzer-->>AnalyzeAPI: { quality, issues, suggestions,\n  bugs, vulnerabilities, codeSmells,\n  complexity, maintainability }

    AnalyzeAPI->>AIService: POST /internal/ai/code-review\n{ code, language, context }
    activate AIService
    AIService->>BackendProxy: Forward to internal AI router
    BackendProxy->>LLM: System: "Senior staff engineer\n  doing strict code review"\nUser: code + context
    LLM-->>BackendProxy: { summary, strengths, concerns,\n  suggestions, overall_rating }
    BackendProxy-->>AIService: Parsed JSON response
    deactivate AIService

    AnalyzeAPI->>MongoDB: insertScan({ user_id, scan_type,\n  code_snippet, language, status })
    AnalyzeAPI->>MongoDB: insertMetrics({ scan_id,\n  overall_quality_score, bugs,\n  vulnerabilities, code_smells,\n  complexity_score, metrics_json })

    AnalyzeAPI-->>Scanner: { quality, issues, aiReview,\n  scanId, suggestions }
    deactivate AnalyzeAPI

    Scanner->>User: Display analysis results\n+ AI review panel
```

---

## 6. GitHub Integration OAuth Flow

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#24292f' }}}%%
sequenceDiagram
    actor User
    participant Browser as Browser
    participant GitHubAPI as /api/github
    participant GitHub as GitHub OAuth
    participant MongoDB as MongoDB
    participant Scanner as Scanner Component

    User->>Scanner: Click "Connect GitHub"
    Scanner->>Browser: github-service.ts:\ninitiateGitHubAuth()
    Browser->>GitHubAPI: GET /api/github/oauth/start?redirect=...

    activate GitHubAPI
    GitHubAPI-->>Browser: 302 Redirect to\nGitHub Authorization URL
    deactivate GitHubAPI

    Browser->>GitHub: GET github.com/login/oauth/authorize?\n  client_id, scope, redirect_uri
    GitHub-->>User: Authorization prompt
    User->>GitHub: Approve authorization

    GitHub-->>Browser: 302 Redirect to\ncallback URL with ?code=...

    Browser->>GitHubAPI: GET /api/github/oauth/callback?code=...
    activate GitHubAPI
    GitHubAPI->>GitHub: POST /login/oauth/access_token\n{ code, client_id, client_secret }
    GitHub-->>GitHubAPI: { access_token, scope }

    GitHubAPI->>GitHub: GET /user\nAuthorization: Bearer <token>
    GitHub-->>GitHubAPI: { login, id, avatar_url }

    GitHubAPI->>GitHub: GET /user/emails
    GitHub-->>GitHubAPI: [{ email, primary, verified }]

    GitHubAPI->>MongoDB: Store integration record\n{ userId, githubId, token,\n  username, scope }
    MongoDB-->>GitHubAPI: Integration saved

    GitHubAPI-->>Browser: 302 Redirect to\n/dashboard/scanner?mode=github
    deactivate GitHubAPI

    Browser->>Scanner: Load GitHub scanner mode
    Scanner->>GitHubAPI: GET /api/github/integrations/me
    GitHubAPI-->>Scanner: { connected: true,\n  github_login, scope }
    Scanner->>GitHubAPI: GET /api/github/repos
    GitHubAPI-->>Scanner: [{ name, full_name,\n  description, language }]
    Scanner-->>User: Show repository browser
```

---

## 7. Razorpay Billing Flow

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#3399ff' }}}%%
sequenceDiagram
    actor User
    participant BillingUI as Billing UI
    participant CreateOrder as /api/billing/create-order
    participant Razorpay as Razorpay SDK
    participant Checkout as Razorpay Checkout
    participant Verify as /api/billing/verify
    participant Webhook as /api/billing/webhook
    participant MongoDB as MongoDB

    User->>BillingUI: Select plan & click "Subscribe"
    BillingUI->>CreateOrder: POST /api/billing/create-order\n{ planId, period }

    activate CreateOrder
    CreateOrder->>Razorpay: razorpay.orders.create({ amount,\n  currency, receipt, notes })
    Razorpay-->>CreateOrder: { id: order_id, amount,\n  currency, status }
    CreateOrder-->>BillingUI: { orderId, amount, key_id }
    deactivate CreateOrder

    BillingUI->>Checkout: Open Razorpay Checkout\n{ key, order_id, prefill }
    Checkout-->>User: Payment form (UPI/Card/NetBanking)
    User->>Checkout: Complete payment
    Checkout-->>BillingUI: { razorpay_payment_id,\n  razorpay_order_id,\n  razorpay_signature }

    BillingUI->>Verify: POST /api/billing/verify\n{ order_id, payment_id, signature }

    activate Verify
    Verify->>Verify: crypto.createHmac('sha256', key_secret)\n  .update(order_id + '|' + payment_id)\n  .digest('hex') === signature
    Verify->>MongoDB: Update user subscription status
    Verify-->>BillingUI: { verified: true, subscription }
    deactivate Verify

    Note over Razorpay, Webhook: Async webhook for payment events
    Razorpay-->>Webhook: POST /api/billing/webhook\n{ payload, event_type }
    activate Webhook
    Webhook->>Webhook: verifyWebhookSignature(rawBody,\n  signature header)
    Webhook->>MongoDB: Upsert payment/subscription record
    Webhook-->>Razorpay: 200 OK
    deactivate Webhook

    BillingUI-->>User: "Subscription active" confirmation
```

---

## 8. Certificate Generation & Verification

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#f59e0b' }}}%%
sequenceDiagram
    actor User
    participant CertPage as Certifications Page
    participant CertAPI as /api/certifications
    participant SVGGen as SVG Generator
    participant QR as QR Service
    participant MongoDB as MongoDB
    participant Verifier as Certificate Verifier

    User->>CertPage: View /dashboard/certifications
    CertPage->>CertAPI: GET /api/certifications/me
    CertAPI->>MongoDB: Find user certificates
    MongoDB-->>CertAPI: [{ id, title, issueDate,\n  expiryDate, badgeUrl }]
    CertAPI-->>CertPage: Certificates list

    User->>CertPage: Click "Generate Certificate"
    CertPage->>CertAPI: POST /api/certifications\n{ examId, userId }
    activate CertAPI
    CertAPI->>MongoDB: Verify exam completion
    MongoDB-->>CertAPI: Exam passed with score
    CertAPI->>CertAPI: Generate unique verification code
    CertAPI->>SVGGen: Generate certificate SVG\n(name, exam, date, badge)
    CertAPI->>QR: qrcode.toDataURL(\n  `/cert/verify?code=...`)
    CertAPI->>MongoDB: Save certificate record
    CertAPI-->>CertPage: { certificateUrl, verifyCode, svg }
    deactivate CertAPI

    User->>User: Share certificate URL

    Note over Verifier: Public Verification Flow
    actor Visitor as Anonymous Visitor
    Visitor->>Verifier: Navigate to /cert/verify?code=XXX
    Verifier->>CertAPI: GET /api/certifications/verify?code=...
    CertAPI->>MongoDB: Lookup by verification code
    MongoDB-->>CertAPI: { holder, exam, date,\n  score, valid }
    CertAPI-->>Verifier: Verification result
    Verifier-->>Visitor: Show valid/invalid badge
