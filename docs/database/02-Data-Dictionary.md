> **Auto-Generated Documentation**
> **Last Updated**: 2026-07-08
> **Source**: CodeSpectra Codebase Audit
> **Auto-Update Rule**: This document must be regenerated when API endpoints or database schemas change.

# Data Dictionary

## Auth Domain

### `user` — User accounts (Better Auth managed)
| Field | Type | Required | Indexed | Description | Example |
|-------|------|----------|---------|-------------|---------|
| `_id` | string | ✓ | PK | UUID | `"a1b2c3d4-..."` |
| `email` | string | ✓ | ✓ | Login email (lowercase) | `"user@example.com"` |
| `passwordHash` | string | ✓ | | bcrypt hash | `"$2b$12$..."` |
| `role` | string | | | `superadmin`, `tenant_admin`, `user` | `"user"` |
| `plan` | string | | | `free`, `pro_monthly`, `pro_yearly` | `"free"` |
| `name` | string | | | Display name | `"John Doe"` |
| `fullName` | string | | | Full name field | `"John Doe"` |
| `emailVerified` | bool | | | Email verification flag | `false` |
| `isActive` | bool | | | Account active flag | `true` |
| `tenantId` | string | | | Org/tenant identifier | `"tenant_abc"` |
| `organizationId` | string | | | Org ID | `"org_123"` |
| `twoFactorEnabled` | bool | | | 2FA status | `false` |
| `twoFactorSecret` | string | | | Encrypted TOTP secret | `"JBSWY3..."` |
| `createdAt` | date | ✓ | | Account creation timestamp | `2026-01-15T00:00:00Z` |
| `updatedAt` | date | ✓ | | Last update timestamp | `2026-07-01T12:00:00Z` |

### `account` — OAuth/social accounts (Better Auth)
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `userId` | string | ✓ | FK | → `user._id` |
| `provider` | string | ✓ | | `email`, `google`, `github` |
| `providerAccountId` | string | ✓ | | Provider-specific user ID |
| `accessToken` | string | | | OAuth access token |
| `refreshToken` | string | | | OAuth refresh token |
| `createdAt` | date | ✓ | | |
| `updatedAt` | date | ✓ | | |

### `session` — Active sessions (Better Auth)
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `userId` | string | ✓ | FK | → `user._id` |
| `sessionToken` | string | ✓ | | JWT session token |
| `expiresAt` | date | ✓ | | Session expiry |
| `createdAt` | date | ✓ | | |
| `updatedAt` | date | ✓ | | |

### `user_roles` — Role assignments
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `organization_id` | string | ✓ | | Org scoping |
| `role` | string | ✓ | | `superadmin`, `tenant_admin`, `user` |
| `joined_at` | string | ✓ | | ISO timestamp |
| `is_active` | bool | ✓ | | |

### `organization_invitations` — Pending invites
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `organization_id` | string | ✓ | | |
| `email` | string | ✓ | | Invited email |
| `invited_by` | string | ✓ | → `user._id` |
| `role` | string | ✓ | | Role to assign |
| `token` | string | ✓ | | Invite token |
| `expires_at` | string | ✓ | | ISO timestamp |
| `status` | string | ✓ | | `pending`, `accepted`, `revoked` |
| `created_at` | string | ✓ | | ISO timestamp |

### `tenants` — Organizations (multi-tenant)
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `name` | string | ✓ | | Organization name |
| `slug` | string | | ✓ | Unique short code (auto-generated when omitted) |
| `plan` | string | | | Plan label (default `enterprise`) |
| `is_active` | bool | ✓ | | |
| `created_at` | string | ✓ | | ISO timestamp |
| `created_by` | string | ✓ | → `user._id` |
| `member_count` | number | | | Computed at read time via `user.countDocuments({tenantId})` |

---

## Scanner Domain

### `code_scans` — Scan runs
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `scan_type` | string | ✓ | | `manual`, `github_file`, `github_push` |
| `language` | string | ✓ | | `python`, `javascript`, `cpp` |
| `scan_status` | string | ✓ | | `queued`, `running`, `completed`, `failed` |
| `scan_duration_ms` | number | | | Execution time (ms) |
| `code_snippet` | string | | | Source code scanned |
| `github_repo_url` | string | | | Full repo URL |
| `github_repo_owner` | string | | | Owner name |
| `github_repo_name` | string | | | Repo name |
| `branch` | string | | | Git branch |
| `commit_hash` | string | | | Git commit SHA |
| `file_path` | string | | | Scanned file path |
| `project_id` | string | | | Project identifier |
| `created_at` | string | ✓ | | ISO timestamp |
| `completed_at` | string | | | ISO timestamp |

### `code_metrics` — Scan quality metrics
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `scan_id` | string | ✓ | FK | → `code_scans.id` |
| `overall_quality_score` | number | ✓ | | 0–100 |
| `bugs` | number | ✓ | | Count |
| `vulnerabilities` | number | ✓ | | Count |
| `security_hotspots` | number | ✓ | | Count |
| `code_smells` | number | ✓ | | Count |
| `duplicated_code_percentage` | number | ✓ | | 0–100 |
| `complexity_score` | number | ✓ | | Cyclomatic complexity |
| `maintainability_index` | number | ✓ | | 0–100 |
| `test_coverage_percentage` | number | ✓ | | 0–100 |
| `metrics_json` | object | | | Extended metrics |
| `created_at` | string | ✓ | | ISO timestamp |

### `code_issues` — Individual findings
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `scan_id` | string | ✓ | FK | → `code_scans.id` |
| `project_id` | string | | | Project identifier |
| `user_id` | string | ✓ | | → `user._id` |
| `severity` | string | ✓ | | `blocker`, `critical`, `major`, `minor`, `info` |
| `type` | string | ✓ | | `bug`, `vulnerability`, `code_smell`, `security_hotspot` |
| `status` | string | ✓ | | `open`, `confirmed`, `resolved`, `false_positive`, `wontfix` |
| `message` | string | ✓ | | Issue description |
| `rule` | string | | | Linting/analysis rule |
| `file_path` | string | | | |
| `line_number` | number | | | |
| `column_number` | number | | | |
| `created_at` | string | ✓ | | |
| `updated_at` | string | ✓ | | |

### `suggested_fixes` — AI-generated fixes
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `issue_id` | string | ✓ | FK | → `code_issues.id` |
| `scan_id` | string | ✓ | FK | → `code_scans.id` |
| `user_id` | string | ✓ | | → `user._id` |
| `description` | string | ✓ | | Fix description |
| `patch` | string | | | Diff/patch content |
| `applied` | bool | ✓ | | Whether fix was applied |
| `created_at` | string | ✓ | | |

### `quality_gates` — Quality rule sets
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `project_id` | string | | | |
| `user_id` | string | ✓ | | → `user._id` |
| `name` | string | ✓ | | Gate name |
| `conditions` | array | ✓ | | `[{metric, op, value}]` |
| `is_default` | bool | ✓ | | |
| `created_at` | string | ✓ | | |
| `updated_at` | string | ✓ | | |

### `scan_activities` — Activity feed
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `scan_id` | string | | FK | → `code_scans.id` |
| `type` | string | ✓ | | Event type |
| `message` | string | ✓ | | Human-readable message |
| `metadata` | object | | | |
| `created_at` | string | ✓ | | |

### `file_metrics` — Per-file metrics
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `scan_id` | string | | FK | → `code_scans.id` |
| `project_id` | string | | | |
| `user_id` | string | ✓ | | |
| `file_path` | string | ✓ | | |
| `lines_of_code` | number | ✓ | | |
| `language` | string | | | |
| `complexity` | number | | | |
| `created_at` | string | ✓ | | |

### `quality_ratings` — Per-project ratings
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `project_id` | string | | | |
| `user_id` | string | ✓ | | |
| `rating` | number | | | |
| `created_at` | string | ✓ | | |

### `code_review_comments`, `scan_comments` — Review/scan comments
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `scan_id` | string | ✓ | | → `code_scans.id` |
| `comment` | string | | | |
| `created_at` | string | ✓ | | |

---

## AI Domain

### `ai_chat_sessions` — Chat conversations
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `title` | string | ✓ | | Auto-generated from first message |
| `model_role` | string | ✓ | | `reasoning`, `fast`, `vision` |
| `created_at` | string | ✓ | | |
| `updated_at` | string | ✓ | | |

### `ai_chat_messages` — Individual messages
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `session_id` | string | ✓ | FK | → `ai_chat_sessions.id` |
| `user_id` | string | ✓ | | → `user._id` |
| `role` | string | ✓ | | `user`, `assistant` |
| `content` | string | ✓ | | Message body |
| `created_at` | string | ✓ | | |

### `ai_code_reviews` — AI review records
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `scan_id` | string | | FK | → `code_scans.id` |
| `problem_slug` | string | | | |
| `language` | string | ✓ | | |
| `result` | object | ✓ | | LLM response |
| `created_at` | string | ✓ | | |

### `ai_grades` — AI grading records
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `submission_id` | string | | FK | → `submissions.id` |
| `problem_slug` | string | | | |
| `rubric` | object | ✓ | | `{criterion: max_points}` |
| `result` | object | ✓ | | LLM response with scores |
| `created_at` | string | ✓ | | |

### `ai_generated_problems` — LLM-generated problems
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `payload` | object | ✓ | | Full LLM response |
| `published_problem_id` | string | | FK | → `problems.id` (if published) |
| `created_at` | string | ✓ | | |

### `proctor_events` — Proctoring event log
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `session_kind` | string | ✓ | | `exam`, `problem`, `interview` |
| `session_id` | string | ✓ | | |
| `event_type` | string | ✓ | | |
| `meta` | object | | | |
| `created_at` | string | ✓ | | |

### `identity_verifications` — ID verification records
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `selfie_data_url` | string | | | Base64 selfie |
| `id_data_url` | string | | | Base64 ID photo |
| `result` | object | ✓ | | LLM vision result |
| `status` | string | ✓ | | `pending`, `approved`, `rejected`, `manual_review` |
| `created_at` | string | ✓ | | |

### `skill_insights_cache` — Cached AI skill analysis
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `result` | object | ✓ | | AI analysis |
| `created_at` | string | ✓ | | |

---

## Content Domain (Problems)

### `problems` — Coding problem catalog
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `slug` | string | ✓ | | URL-friendly unique key |
| `title` | string | ✓ | | |
| `difficulty` | string | ✓ | | `easy`, `medium`, `hard` |
| `topics` | array | ✓ | | `["Array", "Hash Map", ...]` |
| `statement_md` | string | ✓ | | Markdown problem statement |
| `input_format` | string | | | |
| `output_format` | string | | | |
| `constraints` | string | | | |
| `example_explanation` | string | | | |
| `test_cases` | array | ✓ | | `[{stdin, expected_stdout, is_sample}]` |
| `starter_code` | object | ✓ | | `{python: "...", javascript: "..."}` |
| `time_limit_ms` | number | ✓ | | Default 2000 |
| `memory_limit_kb` | number | ✓ | | Default 65536 |
| `is_published` | bool | ✓ | | |
| `is_premium` | bool | | | Premium problem flag |
| `created_by` | string | | | → `user._id` |
| `created_at` | string | ✓ | | |
| `updated_at` | string | ✓ | | |

### `submissions` — User solution attempts
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `problem_id` | string | ✓ | FK | → `problems.id` |
| `user_id` | string | ✓ | | → `user._id` |
| `language` | string | ✓ | | |
| `language_version` | string | | | |
| `source_code` | string | ✓ | | User-submitted code |
| `status` | string | ✓ | | `queued`, `running`, `accepted`, `wrong_answer`, `runtime_error`, `compile_error`, `time_limit`, `error` |
| `score` | number | ✓ | | 0–100 |
| `total_tests` | number | ✓ | | |
| `passed_tests` | number | ✓ | | |
| `results` | array | ✓ | | `[{test_id, passed, stdout, ...}]` |
| `stderr_excerpt` | string | | | |
| `total_time_ms` | number | | | |
| `created_at` | string | ✓ | | |

---

## Certifications Domain

### `certifications` — Certification catalog
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `slug` | string | ✓ | | URL-friendly unique key |
| `title` | string | ✓ | | |
| `level` | string | ✓ | | `Basic`, `Intermediate`, `Advanced` |
| `category` | string | ✓ | | `skill`, `role` |
| `description` | string | ✓ | | |
| `icon` | string | ✓ | | |
| `duration` | number | ✓ | | Minutes |
| `passing_score` | number | ✓ | | 0–100 |
| `source` | string | ✓ | | Attribution |
| `source_url` | string | | | |
| `license` | string | ✓ | | |
| `questions` | array | ✓ | | `[{prompt, choices, answer}]` |
| `is_active` | bool | ✓ | | |
| `created_at` | string | ✓ | | |
| `updated_at` | string | ✓ | | |

### `certification_attempts` — User attempts
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `certification_id` | string | ✓ | FK | → `certifications.id` |
| `verify_token` | string | ✓ | | 32-char base64url |
| `started_at` | string | ✓ | | |
| `submitted_at` | string | | | |
| `score` | number | ✓ | | 0–100 |
| `passed` | bool | ✓ | | |
| `snapshot` | object | ✓ | | `{name, email}` |
| `cert_snapshot` | object | ✓ | | `{title, level, source}` |

---

## Billing Domain

### `billing_orders` — Razorpay orders
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `razorpay_order_id` | string | ✓ | | Razorpay order ID |
| `amount_paise` | number | ✓ | | Amount in paise |
| `currency` | string | ✓ | | `INR` |
| `plan_id` | string | ✓ | | `pro_monthly`, `pro_yearly`, `problem_pack_50` |
| `receipt` | string | ✓ | | Max 40 chars |
| `status` | string | ✓ | | `created`, `attempted`, `paid`, `failed`, `refunded` |
| `notes` | object | | | |
| `created_at` | string | ✓ | | |
| `updated_at` | string | ✓ | | |

### `billing_payments` — Payment records
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `order_id` | string | ✓ | FK | → `billing_orders.id` |
| `razorpay_payment_id` | string | ✓ | | |
| `signature` | string | | | HMAC signature |
| `status` | string | ✓ | | `captured`, `failed`, `refunded`, `authorized` |
| `amount_paise` | number | ✓ | | |
| `method` | string | | | `upi`, `card`, `netbanking`, `wallet` |
| `created_at` | string | ✓ | | |
| `raw_event` | object | | | Full Razorpay webhook payload |

### `billing_subscriptions` — Recurring subscriptions
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `plan_id` | string | ✓ | | |
| `status` | string | ✓ | | `active`, `cancelled`, `expired`, `past_due` |
| `started_at` | string | ✓ | | |
| `ends_at` | string | ✓ | | |
| `last_payment_id` | string | | FK | → `billing_payments.id` |
| `created_at` | string | ✓ | | |

---

## Content Domain (Codeathons, Exams, Jobs)

### `codeathons` — Hackathon-like events
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `title` | string | ✓ | | |
| `description` | string | ✓ | | |
| `start_date` | string | ✓ | | |
| `end_date` | string | ✓ | | |
| `prize_pool` | string | | | |
| `participants` | number | ✓ | | |
| `status` | string | ✓ | | `upcoming`, `live`, `completed`, `archived` |
| `rules` | string | | | |
| `tracks` | array | | | |
| `created_by` | string | | | |
| `created_at` | string | ✓ | | |
| `updated_at` | string | ✓ | | |

### `codeathon_registrations`
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `codeathon_id` | string | ✓ | FK | → `codeathons.id` |
| `user_id` | string | ✓ | | → `user._id` |
| `team_name` | string | | | |
| `registered_at` | string | ✓ | | |

### `exams` — Assessment exams
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `title` | string | ✓ | | |
| `subject` | string | | | Target role / subject |
| `level` | string | | | `Beginner`, `Intermediate`, `Advanced`, `Expert` |
| `difficulty_level` | string | | | |
| `degree_type` | string | | | `btech`, `mtech`, `mca`, `diploma`, `other` — see `lib/engineering-catalog.ts` |
| `branch` | string | | | `cse`, `it`, `ece`, `eee`, `mech`, `civil`, `chem`, `ai_ds` |
| `screening_type` | string | | | `aptitude`, `technical`, `coding`, `mixed` |
| `techStack` | array | | | Topics / skills assessed |
| `duration` | number | | | minutes |
| `passing_score` | number | | | 0–100 |
| `description` | string | | | |
| `status` | string | ✓ | | `available`, `archived`, `draft` |
| `questionList` | array | | | Embedded `[{id, type, title, prompt, options?, answer?, score}]` |
| `questions` | number | | | Question count |
| `access_type` | string | | | `invite_only` / `open` |
| `published` | bool | | | |
| `created_by` | string | | | |
| `created_at` | string | ✓ | | |

### `question_bank` — Reusable engineering questions
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `title` | string | ✓ | | Short question label |
| `question` | string | ✓ | | Full question prompt |
| `type` | string | ✓ | | `mcq`, `multiple_response`, `true_false`, `coding`, `descriptive`, `fill_blanks` |
| `options` | array | | | Only for choice types |
| `answer` | string | | | Correct answer / explanation for coding-descriptive |
| `explanation` | string | | | Optional post-answer explanation |
| `difficulty` | string | ✓ | | `Easy`, `Medium`, `Hard` |
| `marks` | number | ✓ | | Default 10 |
| `degree_type` | string | | | `btech`, `mtech`, `mca`, `diploma`, `other` |
| `branch` | string | | | `cse`, `it`, `ece`, `eee`, `mech`, `civil`, `chem`, `ai_ds` |
| `subject` | string | | | Topic / subject tag |
| `tech_stack` | array | | | |
| `tags` | array | | | |
| `source` | string | | | `seed`, `ai`, `import`, `manual` |
| `is_active` | bool | | | Default true |
| `createdAt` | string | ✓ | | |
| `updatedAt` | string | ✓ | | |

### `exam_submissions`
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `exam_id` | string | ✓ | FK | → `exams.id` |
| `user_id` | string | ✓ | | → `user._id` |
| `score` | number | ✓ | | |
| `passed` | bool | ✓ | | |
| `certificate_url` | string | | | |
| `submitted_at` | string | ✓ | | |

### `job_postings` — Job listings (declared as `jobs` collection in seed-all.ts)
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `title` | string | ✓ | | |
| `company` | string | | | |
| `location` | string | | | |
| `job_type` | string | | | `Full-time`, `Part-time`, `Contract` |
| `experience_level` | string | | | |
| `description` | string | | | |
| `requirements` | string | | | |
| `benefits` | string | | | |
| `skills` | array | | | |
| `salary` | object | | | `{min, max, currency}` |
| `applicants` | number | ✓ | | |
| `is_active` | bool | ✓ | | |
| `created_by` | string | | | |
| `created_at` | string | ✓ | | |

### `job_applications`
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `job_id` | string | ✓ | FK | → `job_postings.id` |
| `user_id` | string | ✓ | | → `user._id` |
| `resume_id` | string | | FK | → `resumes.id` |
| `cover_letter` | string | | | |
| `status` | string | ✓ | | `submitted`, `in_review`, `rejected`, `accepted`, `withdrawn` |
| `applied_at` | string | ✓ | | |

### `resumes`
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `file_name` | string | ✓ | | |
| `file_size` | number | ✓ | | |
| `storage_url` | string | | | |
| `is_primary` | bool | ✓ | | |
| `status` | string | ✓ | | `uploaded`, `analyzing`, `analyzed`, `failed` |
| `analysis` | object | | | |
| `uploaded_at` | string | ✓ | | |

---

## QR / Hackathon Domain

### `id_card_tokens` — ID card QR tokens
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `token` | string | ✓ | | 32-char base64url |
| `user_id` | string | ✓ | | → `user._id` |
| `role_variant` | string | ✓ | | `user`, `admin`, `tenant` |
| `snapshot` | object | | | `{name, email, role}` |
| `revoked_at` | string | | | ISO timestamp |
| `created_at` | string | ✓ | | |

### `hackathons` — Event definitions
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `name` | string | ✓ | | |
| `slug` | string | ✓ | | |
| `description` | string | | | |
| `num_teams` | number | ✓ | | Registration cap |
| `max_per_team` | number | ✓ | | |
| `timeout_minutes` | number | ✓ | | |
| `starts_at` | string | ✓ | | |
| `ends_at` | string | ✓ | | |
| `status` | string | ✓ | | `draft`, `open`, `live`, `closed` |
| `created_by` | string | ✓ | | |
| `created_at` | string | ✓ | | |
| `updated_at` | string | ✓ | | |

### `hackathon_teams`
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `hackathon_id` | string | ✓ | FK | → `hackathons.id` |
| `name` | string | ✓ | | |
| `slug` | string | ✓ | | |
| `qr_token` | string | ✓ | | |
| `members` | array | ✓ | | `[{user_id, name, role}]` |
| `xp` | number | ✓ | | |
| `level` | number | ✓ | | |
| `achievements` | array | ✓ | | `[{id, name, awarded_at}]` |
| `submissions` | number | ✓ | | |
| `created_at` | string | ✓ | | |
| `updated_at` | string | ✓ | | |

---

## XP / Leaderboard Domain

### `xp_events` — Per-award XP log
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `amount` | number | ✓ | | XP amount |
| `reason` | string | ✓ | | `submission_accepted`, `first_blood`, `daily_login`, `admin_grant`, `workflow_reward` |
| `problem_id` | string | | FK | → `problems.id` |
| `submission_id` | string | | FK | → `submissions.id` |
| `metadata` | object | | | |
| `created_at` | string | ✓ | | |

### `github_webhook_events` — Raw webhook payloads
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `delivery_id` | string | | | GitHub delivery GUID |
| `event_type` | string | ✓ | | `push`, `pull_request` |
| `action` | string | | | PR action |
| `repository_full_name` | string | | | |
| `payload` | object | ✓ | | Full webhook payload |
| `created_at` | string | ✓ | | |

### `github_webhook_scan_queue` — Pending GitHub scans
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `delivery_id` | string | ✓ | | |
| `repository_full_name` | string | ✓ | | |
| `owner_login` | string | | | |
| `ref` | string | ✓ | | |
| `before_commit_sha` | string | ✓ | | |
| `head_commit_sha` | string | ✓ | | |
| `event_type` | string | | | `push`, `pull_request` |
| `pull_request_number` | number | | | |
| `status` | string | ✓ | | `pending`, `running`, `completed`, `failed`, `skipped` |
| `attempts` | number | ✓ | | |
| `last_error` | string | | | |
| `scan_id` | string | | FK | → `code_scans.id` |
| `pr_comment_url` | string | | | |
| `created_at` | string | ✓ | | |
| `updated_at` | string | ✓ | | |
| `locked_at` | string | | | |

### `workflows` — Automation workflows
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `name` | string | ✓ | | |
| `description` | string | | | |
| `trigger` | string | ✓ | | `manual`, `schedule`, `webhook` |
| `cron_expression` | string | | | 5-field cron |
| `is_active` | bool | ✓ | | |
| `nodes` | array | ✓ | | `[{id, type, label, config}]` |
| `edges` | array | ✓ | | `[{from, to, condition}]` |
| `created_by` | string | ✓ | | |
| `created_at` | string | ✓ | | |
| `updated_at` | string | ✓ | | |

### `workflow_runs` — Workflow execution logs
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `workflow_id` | string | ✓ | FK | → `workflows.id` |
| `user_id` | string | ✓ | | |
| `status` | string | ✓ | | `success`, `failed`, `partial` |
| `started_at` | string | ✓ | | |
| `finished_at` | string | ✓ | | |
| `steps` | array | ✓ | | Log of each node execution |
| `duration_ms` | number | ✓ | | |

---

## Admin / Settings Domain

### `roles` — RBAC roles with permissions
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | |
| `role` | string | ✓ | | `superadmin`, `tenant_admin`, `user` |
| `permissions` | array | ✓ | | `[{resource, actions}]` |
| `created_at` | string | | | |
| `updated_at` | string | | | |

### `notifications`
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `title` | string | ✓ | | |
| `message` | string | ✓ | | |
| `type` | string | ✓ | | |
| `is_read` | bool | ✓ | | |
| `read_at` | string | | | |
| `created_at` | string | ✓ | | |

### `admin_audit_logs` — Admin activity trail
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `actor` | string | ✓ | | Email of actor |
| `actorIp` | string | | | |
| `action` | string | ✓ | | `user.role.change`, `platform_settings.update` |
| `resource` | string | ✓ | | |
| `resourceType` | string | ✓ | | |
| `severity` | string | ✓ | | `info`, `warning`, `critical` |
| `outcome` | string | ✓ | | `success`, `denied`, `error` |
| `detail` | string | | | |
| `created_at` | string | ✓ | | |

### `teams` — Admin teams
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | number | ✓ | PK | |
| `name` | string | ✓ | | |
| `members` | number | ✓ | | |
| `admin` | string | ✓ | | |
| `status` | string | ✓ | | `active` |

### `support_tickets`
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `subject` | string | ✓ | | |
| `message` | string | ✓ | | |
| `status` | string | ✓ | | `open`, `in_progress`, `resolved`, `closed` |
| `priority` | string | ✓ | | `low`, `medium`, `high`, `urgent` |

---

## Remaining Seeded Collections

### `courses`, `challenges`, `tracks`, `interview_types`, `achievements`, `arena_challenges`
These are seeded by `seed-all.ts` with static data. Schemas vary but all include:
- `id` (string or number)
- `created_at` (ISO string)
- Domain-specific metadata fields

### `daily_challenges`
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | |
| `user_id` | string | ✓ | | → `user._id` |
| `problem_id` | string | ✓ | | → `problems.id` |
| `completedAt` | string | | | |
| `createdAt` | string | | | |

### `integrations` — Connected accounts
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✓ | PK | UUID |
| `user_id` | string | ✓ | | → `user._id` |
| `provider` | string | ✓ | | `github`, `slack`, `sonarqube` |
| `access_token` | string | | | |
| `provider_account_id` | string | | | |
| `metadata` | object | | | |
| `created_at` | string | ✓ | | |
| `updated_at` | string | ✓ | | |

### `pricing_tiers`, `pricing_features`, `tier_features` — Pricing catalog
- `pricing_tiers`: `{id, name, price, interval, description}`
- `pricing_features`: `{id, name, description}`
- `tier_features`: `{id, tier_id, feature_id, included, limit_value}`

### `newsletter_subscribers` — Email newsletter signups
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `email` | string | ✓ | ✓ (unique) | Subscriber email (lowercased) |
| `status` | string | ✓ | | `subscribed` \| `unsubscribed` |
| `source` | string | | | Where the signup came from (e.g. `web`) |
| `created_at` | string | ✓ | | ISO timestamp |
| `unsubscribed_at` | string | | | ISO timestamp when opted out |

### `push_tokens` — FCM web push tokens
| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `user_id` | string | ✓ | ✓ | → `user._id` |
| `token` | string | ✓ | ✓ (unique) | FCM registration token |
| `created_at` | string | ✓ | | ISO timestamp |
