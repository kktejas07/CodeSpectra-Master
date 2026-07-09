> **Auto-Generated Documentation**
> **Last Updated**: 2026-07-08
> **Source**: CodeSpectra Codebase Audit
> **Auto-Update Rule**: This document must be regenerated when API endpoints or database schemas change.

# Entity-Relationship Diagram

```mermaid
erDiagram
    %% ========================
    %% AUTH DOMAIN
    %% ========================
    user ||--o{ account : "has"
    user ||--o{ session : "has"
    user ||--o{ user_roles : "has"
    user ||--o{ notifications : "receives"
    user ||--o{ notification_preferences : "configures"
    user ||--o{ organization_invitations : "sent to"
    user ||--o{ permissions : "assigned"
    user ||--o{ xp_events : "earns"
    user ||--o{ code_scans : "initiates"
    user ||--o{ code_issues : "flagged for"
    user ||--o{ ai_chat_sessions : "creates"
    user ||--o{ ai_chat_messages : "sends"
    user ||--o{ ai_code_reviews : "requests"
    user ||--o{ ai_grades : "receives"
    user ||--o{ billing_orders : "places"
    user ||--o{ billing_payments : "makes"
    user ||--o{ billing_subscriptions : "subscribes"
    user ||--o{ submissions : "submits"
    user ||--o{ certification_attempts : "takes"
    user ||--o{ hackathon_teams : "joins"
    user ||--o{ id_card_tokens : "owns"
    user ||--o{ resumes : "uploads"
    user ||--o{ job_applications : "applies"
    user ||--o{ codeathon_registrations : "registers"
    user ||--o{ notification_preferences : "preferences"
    user ||--o{ exam_submissions : "completes"

    %% Better Auth collections
    user {
        string _id PK "UUID (string)"
        string email "Unique, indexed"
        string passwordHash "bcrypt"
        string role "superadmin|tenant_admin|user"
        string plan "free|pro_monthly|pro_yearly"
        string fullName
        string name
        string tenantId
        string organizationId
        bool emailVerified
        bool isActive
        date createdAt
        date updatedAt
    }

    account {
        string id PK
        string userId FK
        string provider "email|google|github"
        string providerAccountId
        string accessToken
        string refreshToken
        date createdAt
        date updatedAt
    }

    session {
        string id PK
        string userId FK
        string sessionToken
        date expiresAt
        date createdAt
        date updatedAt
    }

    %% ========================
    %% SCANNER DOMAIN
    %% ========================
    code_scans ||--o{ code_metrics : "has"
    code_scans ||--o{ code_issues : "contains"
    code_scans ||--o{ code_review_comments : "reviewed"
    code_scans ||--o{ scan_activities : "logged"
    code_issues ||--o{ suggested_fixes : "has"
    suggested_fixes ||--o{ suggested_fixes : "applied"

    code_scans {
        string id PK "UUID"
        string user_id FK
        string scan_type "manual|github_file|github_push"
        string language
        string scan_status "queued|running|completed|failed"
        int scan_duration_ms
        string code_snippet
        string github_repo_url
        string github_repo_owner
        string github_repo_name
        string branch
        string commit_hash
        string file_path
        string project_id
        string created_at
        string completed_at
    }

    code_metrics {
        string id PK "UUID"
        string scan_id FK "→ code_scans.id"
        float overall_quality_score
        int bugs
        int vulnerabilities
        int security_hotspots
        int code_smells
        float duplicated_code_percentage
        float complexity_score
        float maintainability_index
        float test_coverage_percentage
        object metrics_json
        string created_at
    }

    code_issues {
        string id PK "UUID"
        string scan_id FK "→ code_scans.id"
        string project_id
        string user_id FK
        string severity "blocker|critical|major|minor|info"
        string type "bug|vulnerability|code_smell|security_hotspot"
        string status "open|confirmed|resolved|false_positive|wontfix"
        string message
        string rule
        string file_path
        int line_number
        int column_number
        string created_at
        string updated_at
    }

    suggested_fixes {
        string id PK "UUID"
        string issue_id FK "→ code_issues.id"
        string scan_id FK "→ code_scans.id"
        string user_id FK
        string description
        string patch "diff/patch content"
        bool applied
        string created_at
    }

    quality_gates {
        string id PK "UUID"
        string project_id
        string user_id FK
        string name
        array conditions "[]{metric, op, value}"
        bool is_default
        string created_at
        string updated_at
    }

    scan_activities {
        string id PK "UUID"
        string user_id FK
        string scan_id FK "→ code_scans.id"
        string type
        string message
        object metadata
        string created_at
    }

    file_metrics {
        string id PK "UUID"
        string scan_id FK "→ code_scans.id"
        string project_id
        string user_id FK
        string file_path
        int lines_of_code
        string language
        float complexity
        string created_at
    }

    %% ========================
    %% AI DOMAIN
    %% ========================
    ai_chat_sessions ||--o{ ai_chat_messages : "contains"

    ai_chat_sessions {
        string id PK "UUID"
        string user_id FK
        string title
        string model_role "reasoning|fast|vision"
        string created_at
        string updated_at
    }

    ai_chat_messages {
        string id PK "UUID"
        string session_id FK "→ ai_chat_sessions.id"
        string user_id FK
        string role "user|assistant"
        string content
        string created_at
    }

    ai_code_reviews {
        string id PK "UUID"
        string user_id FK
        string scan_id FK "→ code_scans.id"
        string problem_slug
        string language
        object result "{}"
        string created_at
    }

    ai_grades {
        string id PK "UUID"
        string user_id FK
        string submission_id FK "→ submissions.id"
        string problem_slug
        object rubric "{criterion: max_points}"
        object result "{}"
        string created_at
    }

    ai_generated_problems {
        string id PK "UUID"
        string user_id FK
        object payload "LLM response"
        string published_problem_id FK "→ problems.id"
        string created_at
    }

    proctor_events {
        string id PK "UUID"
        string user_id FK
        string session_kind "exam|problem|interview"
        string session_id
        string event_type
        object meta
        string created_at
    }

    identity_verifications {
        string id PK "UUID"
        string user_id FK
        string selfie_data_url "base64 image"
        string id_data_url "base64 image"
        object result
        string status "pending|approved|rejected|manual_review"
        string created_at
    }

    skill_insights_cache {
        string id PK "UUID"
        string user_id FK
        object result
        string created_at
    }

    %% ========================
    %% CONTENT / PROBLEMS DOMAIN
    %% ========================
    problems ||--o{ submissions : "has"

    problems {
        string id PK "UUID"
        string slug UK "unique slug"
        string title
        string difficulty "easy|medium|hard"
        array topics "[]"
        string statement_md
        string input_format
        string output_format
        string constraints
        string example_explanation
        array test_cases "[]{stdin, expected_stdout, is_sample}"
        object starter_code "{language: code}"
        int time_limit_ms
        int memory_limit_kb
        bool is_published
        string created_by FK
        string created_at
        string updated_at
    }

    submissions {
        string id PK "UUID"
        string problem_id FK "→ problems.id"
        string user_id FK
        string language
        string language_version
        string source_code
        string status "queued|running|accepted|wrong_answer|runtime_error|compile_error|time_limit|error"
        float score
        int total_tests
        int passed_tests
        array results "[]TestRunResult"
        string stderr_excerpt
        int total_time_ms
        string created_at
    }

    %% ========================
    %% CERTIFICATIONS DOMAIN
    %% ========================
    certifications ||--o{ certification_attempts : "taken"

    certifications {
        string id PK "UUID"
        string slug UK "unique slug"
        string title
        string level "Basic|Intermediate|Advanced"
        string category "skill|role"
        string description
        string icon
        int duration "minutes"
        float passing_score "percentage"
        string source "attribution"
        string source_url
        string license
        array questions "[]{prompt, choices, answer}"
        bool is_active
        string created_at
        string updated_at
    }

    certification_attempts {
        string id PK "UUID"
        string user_id FK
        string certification_id FK "→ certifications.id"
        string verify_token "base64url 32-char"
        string started_at
        string submitted_at
        float score
        bool passed
        object snapshot "{name, email}"
        object cert_snapshot "{title, level, source}"
    }

    %% ========================
    %% CONTENT (Codeathons, Exams, Jobs)
    %% ========================
    codeathons ||--o{ codeathon_registrations : "registered for"

    codeathons {
        string id PK "UUID"
        string title
        string description
        string start_date
        string end_date
        string prize_pool
        int participants
        string status "upcoming|live|completed|archived"
        string rules
        array tracks "[]"
        string created_by FK
        string created_at
        string updated_at
    }

    codeathon_registrations {
        string id PK "UUID"
        string codeathon_id FK "→ codeathons.id"
        string user_id FK
        string team_name
        string registered_at
    }

    exams {
        string id PK "UUID"
        string title
        string subject
        string difficulty_level
        int duration
        int passing_score
        string description
        string status "available|archived|draft"
        array questions "[]{id, text, type, options, correctAnswer}"
        string created_by FK
        string created_at
    }

    exam_submissions {
        string id PK "UUID"
        string exam_id FK "→ exams.id"
        string user_id FK
        float score
        bool passed
        string certificate_url
        string submitted_at
    }

    job_postings {
        string id PK "UUID"
        string title
        string company
        string location
        string job_type
        string experience_level
        string description
        string requirements
        string benefits
        array skills "[]"
        object salary "{min, max, currency}"
        int applicants
        bool is_active
        string created_by FK
        string created_at
    }

    job_applications {
        string id PK "UUID"
        string job_id FK "→ job_postings.id"
        string user_id FK
        string resume_id FK "→ resumes.id"
        string cover_letter
        string status "submitted|in_review|rejected|accepted|withdrawn"
        string applied_at
    }

    resumes {
        string id PK "UUID"
        string user_id FK
        string file_name
        int file_size
        string storage_url
        bool is_primary
        string status "uploaded|analyzing|analyzed|failed"
        object analysis
        string uploaded_at
    }

    %% ========================
    %% BILLING DOMAIN
    %% ========================
    billing_orders ||--o{ billing_payments : "fulfilled by"

    billing_orders {
        string id PK "UUID"
        string user_id FK
        string razorpay_order_id "Razorpay order ID"
        int amount_paise "in paise"
        string currency "INR"
        string plan_id "pro_monthly|pro_yearly|problem_pack_50"
        string receipt
        string status "created|attempted|paid|failed|refunded"
        object notes
        string created_at
        string updated_at
    }

    billing_payments {
        string id PK "UUID"
        string user_id FK
        string order_id FK "→ billing_orders.id"
        string razorpay_payment_id
        string signature
        string status "captured|failed|refunded|authorized"
        int amount_paise
        string method "upi|card|netbanking|wallet"
        string created_at
        object raw_event
    }

    billing_subscriptions {
        string id PK "UUID"
        string user_id FK
        string plan_id
        string status "active|cancelled|expired|past_due"
        string started_at
        string ends_at
        string last_payment_id FK "→ billing_payments.id"
        string created_at
    }

    %% ========================
    %% QR / HACKATHON DOMAIN
    %% ========================
    hackathons ||--o{ hackathon_teams : "teams"

    id_card_tokens {
        string id PK "UUID"
        string token "base64url 32-char"
        string user_id FK
        string role_variant "user|admin|tenant"
        object snapshot "{name, email, role}"
        string revoked_at
        string created_at
    }

    hackathons {
        string id PK "UUID"
        string name
        string slug
        string description
        int num_teams
        int max_per_team
        int timeout_minutes
        string starts_at
        string ends_at
        string status "draft|open|live|closed"
        string created_by FK
        string created_at
        string updated_at
    }

    hackathon_teams {
        string id PK "UUID"
        string hackathon_id FK "→ hackathons.id"
        string name
        string slug
        string qr_token
        array members "[]{user_id, name, role}"
        int xp
        int level
        array achievements "[]{id, name, awarded_at}"
        int submissions
        string created_at
        string updated_at
    }

    %% ========================
    %% XP / LEADERBOARD DOMAIN
    %% ========================
    xp_events {
        string id PK "UUID"
        string user_id FK
        int amount
        string reason "submission_accepted|first_blood|daily_login|admin_grant|workflow_reward"
        string problem_id FK "→ problems.id"
        string submission_id FK "→ submissions.id"
        object metadata
        string created_at
    }

    github_webhook_events {
        string id PK "UUID"
        string delivery_id
        string event_type
        string action
        string repository_full_name
        object payload
        string created_at
    }

    github_webhook_scan_queue {
        string id PK "UUID"
        string delivery_id
        string repository_full_name
        string owner_login
        string ref
        string before_commit_sha
        string head_commit_sha
        string event_type "push|pull_request"
        int pull_request_number
        string status "pending|running|completed|failed|skipped"
        int attempts
        string last_error
        string scan_id FK "→ code_scans.id"
        string pr_comment_url
        string created_at
        string updated_at
        string locked_at
    }

    %% ========================
    %% WORKFLOW DOMAIN
    %% ========================
    workflows ||--o{ workflow_runs : "executions"

    workflows {
        string id PK "UUID"
        string name
        string description
        string trigger "manual|schedule|webhook"
        string cron_expression
        bool is_active
        array nodes "[]{id, type, label, config}"
        array edges "[]{from, to, condition}"
        string created_by FK
        string created_at
        string updated_at
    }

    workflow_runs {
        string id PK "UUID"
        string workflow_id FK "→ workflows.id"
        string user_id FK
        string status "success|failed|partial"
        string started_at
        string finished_at
        array steps "[]{node_id, label, ok, output, error, duration_ms}"
        int duration_ms
    }

    %% ========================
    %% INTEGRATION DOMAIN
    %% ========================
    integrations {
        string id PK "UUID"
        string user_id FK
        string provider "github|slack|sonarqube"
        string access_token
        string refresh_token
        string provider_account_id
        object metadata
        string created_at
        string updated_at
    }

    github_tokens {
        string id PK "UUID"
        string user_id FK
        string encrypted_token
        string github_username
        int expires_at
        string created_at
    }

    github_oauth_states {
        string state PK
        string user_id FK
        string redirect_uri
        string created_at
    }

    github_repo_metadata {
        string id PK
        string repository_full_name
        object metadata
        string last_scanned_at
        string created_at
        string updated_at
    }

    %% ========================
    %% ADMIN / SETTINGS DOMAIN
    %% ========================
    roles {
        string id PK
        string role "superadmin|tenant_admin|user"
        array permissions "[]{resource, actions}"
        string created_at
        string updated_at
    }

    plans {
        string id PK
        string name
        string role "free|pro|enterprise"
        int price
        array features "[]"
        string created_at
        string updated_at
    }

    organization_invitations {
        string id PK "UUID"
        string organization_id
        string email
        string invited_by FK
        string role
        string token
        string expires_at
        string status "pending|accepted|revoked"
        string created_at
    }

    user_roles {
        string id PK "UUID"
        string user_id FK
        string organization_id
        string role
        string joined_at
        bool is_active
    }

    notifications {
        string id PK "UUID"
        string user_id FK
        string title
        string message
        string type
        bool is_read
        string read_at
        string created_at
    }

    notification_preferences {
        string id PK "UUID"
        string user_id FK
        string type
        bool enabled
        object categories "{key: bool}"
        string created_at
        string updated_at
    }

    permissions {
        string id PK "UUID"
        string name
        string description
        string role
    }

    admin_audit_logs {
        string id PK "UUID"
        string user_id FK
        string actor
        string actorIp
        string action
        string resource
        string resourceType
        string severity "info|warning|critical"
        string outcome "success|denied|error"
        string detail
        string created_at
    }

    server_secrets {
        string id PK
        string key "unique key name"
        string value "encrypted"
        string created_at
        string updated_at
    }

    platform_settings {
        string id PK
        string key "unique"
        object value
        string updated_at
    }

    feature_flags {
        string id PK
        string key "unique"
        bool enabled
        string description
        string created_at
    }

    support_tickets {
        string id PK "UUID"
        string user_id FK
        string subject
        string message
        string status "open|in_progress|resolved|closed"
        string priority "low|medium|high|urgent"
        string created_at
        string updated_at
    }

    security_settings {
        string id PK
        string name
        string status "enabled|disabled"
        string icon
        string created_at
    }

    %% ========================
    %% ANALYTICS DOMAIN
    %% ========================
    web_vitals_events {
        string id PK "UUID"
        string user_id FK
        string metric_name "LCP|FID|CLS|TTFB"
        float metric_value
        string path
        string browser
        string device
        string created_at
    }

    skill_analytics {
        string id PK
        string user_id FK
        string skill
        int solved
        int total
        float percentage
        string created_at
    }

    %% ========================
    %% SEEDED CONTENT
    %% ========================
    courses {
        string id PK
        string title
        string description
        string type "video|audio|text"
        string instructor
        string duration
        string level "beginner|intermediate|advanced"
        int enrolled
        float rating
        float progress
        array tags "[]"
    }

    challenges {
        string id PK
        string title
        string description
        string difficulty "Easy|Medium|Hard"
        string type "technical-screen|coding|system-design|behavioral"
        int duration
        float successRate
        bool completed
        bool locked
        array prerequisites "[]"
    }

    tracks {
        string id PK
        string name
        string description
        array topics "[]"
        string badge
    }

    interview_types {
        string id PK
        string title
        string description
        string duration
        string difficulty
        bool available
        array roles "[]"
    }

    achievements {
        string id PK
        string name
        string description
        string icon
        bool earned
        int progress
        int total
    }

    arena_challenges {
        string id PK
        string title
        string description
        string difficulty
        string type
    }

    teams {
        string id PK
        string name
        int members
        string admin
        string status
    }

    team_members {
        string id PK
        string name
        string email
        string role
        string joinedAt
        string status
    }

    daily_challenges {
        string id PK
        string user_id FK
        string problem_id FK
        string completedAt
        string createdAt
    }

    quality_ratings {
        string id PK
        string project_id
        string user_id FK
        float rating
        string created_at
    }

    code_review_comments {
        string id PK "UUID"
        string user_id FK
        string scan_id FK
        string comment
        string created_at
    }

    scan_comments {
        string id PK "UUID"
        string user_id FK
        string scan_id FK
        string comment
        string created_at
    }

    pricing_tiers {
        string id PK
        string name
        int price
        string interval
        string description
        string created_at
    }

    pricing_features {
        string id PK
        string name
        string description
        string created_at
    }

    tier_features {
        string id PK
        string tier_id FK "→ pricing_tiers.id"
        string feature_id FK "→ pricing_features.id"
        bool included
        string limit_value
    }

    github_scan_queue {
        string id PK
        string user_id FK
        string repository_full_name
        string status
        string created_at
    }

    jobs {
        string id PK
        string title
        string company
        string location
        string jobType
        string experienceLevel
        string description
        array skills "[]"
        int applicants
    }
```

## Collection Count: 64 collections

## Domain Groupings

| Domain | Collections |
|--------|-------------|
| **Auth** | `user`, `account`, `session`, `verification`, `user_roles`, `organization_invitations` |
| **Scanner** | `code_scans`, `code_metrics`, `code_issues`, `suggested_fixes`, `quality_gates`, `scan_activities`, `file_metrics`, `quality_ratings`, `code_review_comments`, `scan_comments` |
| **AI** | `ai_chat_sessions`, `ai_chat_messages`, `ai_code_reviews`, `ai_grades`, `ai_generated_problems`, `proctor_events`, `identity_verifications`, `skill_insights_cache` |
| **Content** | `problems`, `submissions`, `problem_languages`, `courses`, `challenges`, `tracks`, `exams`, `exam_submissions` |
| **Certifications** | `certifications`, `certification_attempts` |
| **Codeathons** | `codeathons`, `codeathon_registrations` |
| **Jobs** | `jobs`, `job_postings`, `job_applications`, `resumes` |
| **Billing** | `billing_orders`, `billing_payments`, `billing_subscriptions`, `pricing_tiers`, `pricing_features`, `tier_features`, `plans` |
| **QR / Hackathons** | `id_card_tokens`, `hackathons`, `hackathon_teams` |
| **XP / Leaderboard** | `xp_events`, `github_webhook_events`, `github_webhook_scan_queue` |
| **Workflows** | `workflows`, `workflow_runs` |
| **Integrations** | `integrations`, `github_tokens`, `github_oauth_states`, `github_repo_metadata`, `github_scan_queue` |
| **Admin / Settings** | `roles`, `permissions`, `notifications`, `notification_preferences`, `admin_audit_logs`, `server_secrets`, `platform_settings`, `feature_flags`, `security_settings`, `support_tickets`, `teams`, `team_members` |
| **Analytics** | `web_vitals_events`, `skill_analytics`, `daily_challenges` |
| **Arena** | `arena_challenges`, `achievements`, `interview_types` |

## Relationship & Foreign Key Notes

### Relationships with $lookup support (code-level joins)
- `code_scans.id` → `code_metrics.scan_id` (used via `$lookup` in `listScansWithMetrics`)
- `code_scans.id` → `code_issues.scan_id` (used via filter queries)
- `code_issues.id` → `suggested_fixes.issue_id`
- `code_scans.id` → `suggested_fixes.scan_id`
- `ai_chat_sessions.id` → `ai_chat_messages.session_id` (used via find queries)
- `billing_orders.id` → `billing_payments.order_id`
- `problems.id` → `submissions.problem_id`
- `certifications.id` → `certification_attempts.certification_id`
- `exams.id` → `exam_submissions.exam_id`
- `codeathons.id` → `codeathon_registrations.codeathon_id`
- `hackathons.id` → `hackathon_teams.hackathon_id`
- `workflows.id` → `workflow_runs.workflow_id`
- `user.id` → all `*_id` foreign keys (implicit)

### Collections Lacking Foreign Key Indexes (Documented Gap)
Based on code analysis, **none of the collections explicitly create MongoDB indexes via driver calls**. The following indexes are **missing** and should be created:

| Missing Index | Collections Affected |
|---------------|---------------------|
| `{ user_id: 1 }` | `code_scans`, `code_issues`, `suggested_fixes`, `xp_events`, `ai_chat_sessions`, `ai_chat_messages`, `billing_orders`, `billing_payments`, `billing_subscriptions`, `notifications`, `scan_activities`, `code_review_comments`, `scan_comments`, `support_tickets`, `file_metrics`, `integrations`, `github_tokens`, `github_scan_queue` |
| `{ scan_id: 1 }` | `code_metrics`, `code_issues`, `suggested_fixes`, `scan_activities`, `file_metrics`, `code_review_comments`, `scan_comments` |
| `{ session_id: 1 }` | `ai_chat_messages` |
| `{ problem_id: 1 }` | `submissions`, `xp_events` |
| `{ certification_id: 1 }` | `certification_attempts` |
| `{ hackathon_id: 1 }` | `hackathon_teams` |
| `{ workflow_id: 1 }` | `workflow_runs` |
| `{ slug: 1 }` | `problems`, `certifications`, `hackathons` (unique needed) |

## Naming Inconsistencies Discovered

| Collection Name (referenced in code) | Secondary Name (also referenced) | Where |
|--------------------------------------|----------------------------------|-------|
| `job_postings` | `jobs` | `lib/db/content.ts` uses `job_postings`; `seed-all.ts` writes to `jobs`; API reads from `jobs` |
| `user` | `users` | Better Auth uses `user`; `route-auth.ts:141` queries `users` collection |
| `github_scan_queue` | `github_webhook_scan_queue` | `lib/db/misc.ts` defines `github_scan_queue`; `lib/db/leaderboard.ts` defines `github_webhook_scan_queue` → two separate collections |
| `quality_gates` | (duplicate) | Defined in both `lib/db/scans.ts` and `lib/db/misc.ts` |
| `suggested_fixes` | (duplicate) | Defined in both `lib/db/scans.ts` (typed) and `lib/db/misc.ts` (loose) |
