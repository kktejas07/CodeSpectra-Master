/**
 * Synthetic fixtures for the offline RAG evaluation: two organisations
 * ("acme", "globex") with tests, results, a hackathon, an uploaded JD + rubric /
 * policy, résumés and candidate attempts, plus a few platform-wide items (a
 * public course and codeathon; superadmin-only question bank items, a draft
 * hackathon, a platform upload and a platform test).
 *
 * These are stored in the shapes the real loaders read (exams, exam_submissions,
 * proctor_events, hackathons, codeathons, rag_uploads, resume_drafts, resumes,
 * user, courses, question_bank), so ingestion runs through lib/rag/sources/*.
 * Names are invented. Nothing here is used outside the evaluation.
 */
import type { AgentCaller } from '@/lib/agent/contract'

export const TENANT_A = 'acme'
export const TENANT_B = 'globex'

export const EVAL_CALLERS: Record<'superadmin' | 'tenant_a' | 'tenant_b', AgentCaller> = {
  superadmin: { userId: 'eval-superadmin', role: 'superadmin', tenantId: null },
  tenant_a: { userId: 'eval-acme-admin', role: 'tenant_admin', tenantId: TENANT_A },
  tenant_b: { userId: 'eval-globex-admin', role: 'tenant_admin', tenantId: TENANT_B },
}

type Doc = Record<string, unknown>
const iso = (d: string) => new Date(d).toISOString()

// ─── Tests (exams) ───────────────────────────────────────────────────────────

const EXAMS: Doc[] = [
  {
    id: 'acme-t-backend', tenant_id: TENANT_A, title: 'Backend engineer (Node.js) screening',
    subject: 'Backend engineer', level: 'Mid-level', techStack: ['Node.js', 'PostgreSQL', 'Redis'],
    duration: 90, passing_score: 65, published: true, access_type: 'invite', proctoring_mode: 'strict',
    description: 'Screens mid-level backend engineers for the payments squad. Covers data structures, API design and SQL. Candidates write real code against hidden tests.',
    questionList: [
      { id: 'q1', title: 'Sliding-window rate limiter', type: 'coding' },
      { id: 'q2', title: 'LRU cache implementation', type: 'coding' },
      { id: 'q3', title: 'Idempotent payment endpoint design', type: 'written' },
      { id: 'q4', title: 'Top merchants by refund volume', type: 'sql' },
    ],
    sections: [
      { id: 'ds', title: 'Data structures', time_limit_minutes: 40, question_ids: ['q1', 'q2'] },
      { id: 'api', title: 'API design', time_limit_minutes: 25, lock_after_leave: true, instructions: 'Design a REST endpoint that accepts payment requests safely when the client retries. Explain idempotency keys and status codes.', question_ids: ['q3'] },
      { id: 'sql', title: 'SQL', time_limit_minutes: 25, question_ids: ['q4'] },
    ],
  },
  {
    id: 'acme-t-qa', tenant_id: TENANT_A, title: 'QA automation engineer test',
    subject: 'QA automation', level: 'Junior', techStack: ['Playwright', 'Selenium', 'TypeScript'],
    duration: 60, passing_score: 60, published: true, proctoring_mode: 'standard',
    description: 'End-to-end browser testing skills: writing Playwright specs, flaky test triage and test case design for a checkout flow.',
    questionList: [
      { id: 'qa1', title: 'Write a Playwright spec for login', type: 'coding' },
      { id: 'qa2', title: 'Equivalence partitioning for coupon codes', type: 'mcq' },
    ],
  },
  {
    id: 'globex-t-data', tenant_id: TENANT_B, title: 'Data analyst assessment (SQL + Python)',
    subject: 'Data analyst', level: 'Entry', techStack: ['SQL', 'Python', 'pandas'],
    duration: 75, passing_score: 55, published: true, proctoring_mode: 'standard',
    description: 'For the analytics team: SQL window functions, cohort retention queries and pandas data cleaning.',
    questionList: [
      { id: 'd1', title: 'Running total with window functions', type: 'sql' },
      { id: 'd2', title: 'Monthly cohort retention', type: 'sql' },
      { id: 'd3', title: 'Clean messy CSV with pandas', type: 'coding' },
    ],
    sections: [
      { id: 'win', title: 'SQL window functions', time_limit_minutes: 35, question_ids: ['d1', 'd2'] },
      { id: 'py', title: 'Pandas', time_limit_minutes: 40, question_ids: ['d3'] },
    ],
  },
  {
    id: 'plat-t-aptitude', tenant_id: null, title: 'Campus hiring aptitude test',
    subject: 'Aptitude', level: 'Graduate', duration: 45, passing_score: 50, published: false,
    description: 'Platform-run aptitude round for campus drives: quantitative reasoning, logical puzzles and verbal ability.',
    questionList: [{ id: 'ap1', title: 'Train speed and distance', type: 'mcq' }],
  },
]

const USERS: Doc[] = [
  { id: 'u-priya', name: 'Priya Raman', email: 'priya@example.test' },
  { id: 'u-arjun', name: 'Arjun Mehta', email: 'arjun@example.test' },
  { id: 'u-lena', name: 'Lena Fischer', email: 'lena@example.test' },
  { id: 'u-mei', name: 'Mei Chen', email: 'mei@example.test' },
  { id: 'u-omar', name: 'Omar Haddad', email: 'omar@example.test' },
  { id: 'u-sam', name: 'Sam Patel', email: 'sam@example.test' },
]

const sub = (exam: string, user: string, score: number, max: number, extra: Doc = {}): Doc => ({
  exam_id: exam, user_id: user, email: `${user}@example.test`, score, max_score: max, attempt_no: 1,
  total_time_ms: 55 * 60_000, submitted_at: iso('2026-09-20T10:00:00Z'), score_released: false, ...extra,
})

const SUBMISSIONS: Doc[] = [
  sub('acme-t-backend', 'u-priya', 82, 100, { extension_detected: false, identity_check: { method: 'face_match', needs_manual_review: false } }),
  sub('acme-t-backend', 'u-arjun', 41, 100, { identity_check: { method: 'face_match', needs_manual_review: true }, auto_submitted: true }),
  sub('acme-t-backend', 'u-lena', 70, 100, { has_pending_review: true }),
  sub('acme-t-backend', 'u-sam', 58, 100),
  sub('acme-t-qa', 'u-lena', 66, 100),
  sub('globex-t-data', 'u-mei', 88, 100, { identity_check: { method: 'id_document', needs_manual_review: false } }),
  sub('globex-t-data', 'u-omar', 49, 100, { late_submit: true }),
  sub('globex-t-data', 'u-sam', 73, 100),
]

const PROCTOR_EVENTS: Doc[] = [
  ...Array.from({ length: 3 }, () => ({ session_kind: 'exam', session_id: 'acme-t-backend', user_id: 'u-priya', event_type: 'tab_switch' })),
  ...Array.from({ length: 2 }, () => ({ session_kind: 'exam', session_id: 'acme-t-backend', user_id: 'u-arjun', event_type: 'face_mismatch' })),
  { session_kind: 'exam', session_id: 'acme-t-backend', user_id: 'u-arjun', event_type: 'multiple_faces' },
  { session_kind: 'exam', session_id: 'globex-t-data', user_id: 'u-omar', event_type: 'copy_paste' },
]

const RESUME_DRAFTS: Doc[] = [
  { user_id: 'u-priya', updated_at: iso('2026-09-01'), data: {
    personal: { location: 'Bengaluru' },
    summary: 'Backend engineer with six years building payment systems in Go and Node.js.',
    experience: [
      { role: 'Senior software engineer', company: 'Razorpay', dates: '2022–2026', description: 'Owned the refunds service; moved settlement jobs to Kubernetes; cut p99 latency of the payouts API by 40%.' },
      { role: 'Software engineer', company: 'Freshworks', dates: '2019–2022', description: 'Built webhook delivery with retries and idempotency keys.' },
    ],
    education: [{ degree: 'B.Tech Computer Science', institution: 'NIT Trichy', dates: '2019' }],
    skills: 'Go, Node.js, PostgreSQL, Kafka, Kubernetes, Redis',
  } },
  { user_id: 'u-arjun', updated_at: iso('2026-08-11'), data: {
    summary: 'Mobile developer focused on React Native apps for e-commerce.',
    experience: [{ role: 'Mobile developer', company: 'Meesho', dates: '2021–2026', description: 'Shipped the React Native checkout; Expo, Redux Toolkit, offline caching.' }],
    skills: 'React Native, TypeScript, Expo, Redux',
  } },
  { user_id: 'u-mei', updated_at: iso('2026-07-30'), data: {
    summary: 'Data analyst who builds Tableau dashboards and writes a lot of SQL.',
    experience: [{ role: 'Analyst', company: 'Swiggy', dates: '2023–2026', description: 'Weekly retention dashboards in Tableau; dbt models; A/B test readouts.' }],
    skills: 'SQL, Tableau, dbt, Python, Excel',
  } },
  { user_id: 'u-sam', updated_at: iso('2026-08-02'), data: {
    summary: 'Generalist engineer moving into data engineering; Airflow and Spark pipelines.',
    experience: [{ role: 'Engineer', company: 'Zoho', dates: '2020–2026', description: 'Airflow DAGs, Spark batch jobs, internal admin tools.' }],
    skills: 'Python, Spark, Airflow, SQL',
  } },
]
/**
 * RAG-004: only résumés a candidate attached to an organisation's job posting
 * are indexed for it. The drafts above are private and must never be indexed —
 * the uploaded résumés below (same content) are what each person shared.
 * u-lena has a private draft only (an ACL probe checks it stays out).
 */
RESUME_DRAFTS.push({ user_id: 'u-lena', updated_at: iso('2026-08-05'), data: {
  summary: 'Embedded firmware engineer writing Rust for battery management systems.',
  skills: 'Rust, embedded C, CAN bus, RTOS',
} })

const RESUMES: Doc[] = [
  { id: 'r-priya', user_id: 'u-priya', is_primary: true, uploaded_at: iso('2026-09-01'), file_name: 'priya-raman.pdf', text_content: 'Priya Raman. Bengaluru. Backend engineer with six years building payment systems in Go and Node.js. Senior software engineer at Razorpay (2022–2026): owned the refunds service; moved settlement jobs to Kubernetes; cut p99 latency of the payouts API by 40%. Software engineer at Freshworks (2019–2022): built webhook delivery with retries and idempotency keys. B.Tech Computer Science, NIT Trichy, 2019. Skills: Go, Node.js, PostgreSQL, Kafka, Kubernetes, Redis. priya@example.test +91 90000 11111' },
  { id: 'r-arjun', user_id: 'u-arjun', is_primary: true, uploaded_at: iso('2026-08-11'), file_name: 'arjun-mehta.pdf', text_content: 'Arjun Mehta. Mobile developer focused on React Native apps for e-commerce. Mobile developer at Meesho (2021–2026): shipped the React Native checkout; Expo, Redux Toolkit, offline caching. Skills: React Native, TypeScript, Expo, Redux.' },
  { id: 'r-mei', user_id: 'u-mei', is_primary: true, uploaded_at: iso('2026-07-30'), file_name: 'mei-chen.pdf', text_content: 'Mei Chen. Data analyst who builds Tableau dashboards and writes a lot of SQL. Analyst at Swiggy (2023–2026): weekly retention dashboards in Tableau; dbt models; A/B test readouts. Skills: SQL, Tableau, dbt, Python, Excel.' },
  { id: 'r-sam', user_id: 'u-sam', is_primary: true, uploaded_at: iso('2026-08-02'), file_name: 'sam-patel.pdf', text_content: 'Sam Patel. Generalist engineer moving into data engineering; Airflow and Spark pipelines. Engineer at Zoho (2020–2026): Airflow DAGs, Spark batch jobs, internal admin tools. Skills: Python, Spark, Airflow, SQL.' },
  { id: 'r-omar', user_id: 'u-omar', is_primary: true, uploaded_at: iso('2026-08-20'), file_name: 'omar-cv.pdf', text_content: 'Omar Haddad. Business intelligence analyst. Power BI, SQL Server, SSIS. Built finance KPI dashboards. omar@example.test +91 98765 43210' },
]

const JOB_POSTINGS: Doc[] = [
  { id: 'acme-jp-backend', tenant_id: TENANT_A, title: 'Backend engineer (payments)', is_active: true },
  { id: 'acme-jp-mobile', tenant_id: TENANT_A, title: 'React Native developer', is_active: true },
  { id: 'globex-jp-analyst', tenant_id: TENANT_B, title: 'Data analyst II', is_active: true },
  { id: 'globex-jp-dataeng', tenant_id: TENANT_B, title: 'Data engineer', is_active: true },
]

const JOB_APPLICATIONS: Doc[] = [
  { id: 'ja-1', job_id: 'acme-jp-backend', user_id: 'u-priya', resume_id: 'r-priya', status: 'submitted', applied_at: iso('2026-09-02') },
  { id: 'ja-2', job_id: 'acme-jp-mobile', user_id: 'u-arjun', resume_id: 'r-arjun', status: 'submitted', applied_at: iso('2026-09-02') },
  { id: 'ja-3', job_id: 'acme-jp-backend', user_id: 'u-sam', resume_id: 'r-sam', status: 'submitted', applied_at: iso('2026-09-03') },
  { id: 'ja-4', job_id: 'globex-jp-dataeng', user_id: 'u-sam', resume_id: 'r-sam', status: 'submitted', applied_at: iso('2026-09-03') },
  { id: 'ja-5', job_id: 'globex-jp-analyst', user_id: 'u-mei', resume_id: 'r-mei', status: 'submitted', applied_at: iso('2026-09-04') },
  { id: 'ja-6', job_id: 'globex-jp-analyst', user_id: 'u-omar', resume_id: 'r-omar', status: 'submitted', applied_at: iso('2026-09-04') },
  // u-lena applied without attaching a résumé: nothing of hers is indexed.
  { id: 'ja-7', job_id: 'acme-jp-backend', user_id: 'u-lena', resume_id: null, status: 'submitted', applied_at: iso('2026-09-05') },
]

// ─── Hiring pipeline (ATS) — RAG-001 ────────────────────────────────────────

const PIPELINE = [
  { id: 's_applied', type: 'applied', name: 'Applied' },
  { id: 's_screening', type: 'screening', name: 'Screening' },
  { id: 's_interview', type: 'virtual_interview', name: 'Technical interview' },
  { id: 's_rejected', type: 'rejected', name: 'Rejected' },
]

const ATS_JOBS: Doc[] = [
  { id: 'acme-job-sre', tenant_id: TENANT_A, title: 'Site reliability engineer (SRE)', status: 'open', location: 'Bengaluru', work_mode: 'hybrid', employment_type: 'full_time', experience_min: 4, experience_max: 8, openings: 2,
    skills: ['Kubernetes', 'Terraform', 'Prometheus', 'Grafana', 'Linux'],
    criteria: { must_have_skills: ['Kubernetes', 'Terraform'], nice_to_have_skills: ['Prometheus', 'Grafana'], keywords: [], pass_score: 60, use_ai_match: false, must_have_required: false },
    description: 'Keep the payments platform up: run the on-call rotation, write incident postmortems, own observability with Prometheus and Grafana, and manage infrastructure as code with Terraform.',
    requirements: 'Four or more years running production Kubernetes; infrastructure as code; strong Linux and networking basics.', pipeline: PIPELINE },
  { id: 'globex-job-ml', tenant_id: TENANT_B, title: 'Machine learning engineer — demand forecasting', status: 'open', location: 'Remote', work_mode: 'remote', employment_type: 'full_time', experience_min: 3, experience_max: 6, openings: 1,
    skills: ['Python', 'LightGBM', 'MLflow', 'time series'],
    criteria: { must_have_skills: ['Python', 'time series'], nice_to_have_skills: ['MLflow'], keywords: [], pass_score: 60, use_ai_match: false, must_have_required: false },
    description: 'Build the models that forecast electricity demand for Globex plants, from feature pipelines to monitored production models.',
    requirements: 'Gradient boosting or deep learning for time-series forecasting; experiment tracking; deploying models to production.', pipeline: PIPELINE },
]

const ATS_CANDIDATES: Doc[] = [
  { id: 'c-ravi', tenant_id: TENANT_A, name: 'Ravi Kumar', email: 'ravi@example.test', phone: '+919811122233', tags: ['referral'],
    parsed: { skills: ['Kubernetes', 'Terraform', 'Prometheus', 'Grafana', 'Go'], titles: ['Site reliability engineer'], companies: ['Flipkart'], total_years: 6, education: [{ degree: 'B.E.', field: 'Electronics', institution: 'PES University' }], summary: 'SRE who led the move of checkout services to Kubernetes.', parser: 'heuristic' },
    resume: { file_name: 'ravi.pdf', text: 'Ravi Kumar — ravi@example.test — +91 98111 22233. Site reliability engineer at Flipkart. Led migration of checkout services to Kubernetes, wrote Terraform modules for every environment, built Prometheus alerting and Grafana dashboards, ran blameless postmortems.', uploaded_at: iso('2026-09-10') } },
  { id: 'c-nina', tenant_id: TENANT_A, name: 'Nina Rossi', email: 'nina@example.test', phone: null, tags: [],
    parsed: { skills: ['Vue', 'Nuxt', 'CSS'], titles: ['Frontend developer'], companies: ['Zalando'], total_years: 3, education: [], summary: 'Frontend developer building Vue storefronts.', parser: 'heuristic' },
    resume: { file_name: 'nina.pdf', text: 'Nina Rossi. Frontend developer building Vue and Nuxt storefronts at Zalando.', uploaded_at: iso('2026-09-11') } },
  { id: 'c-tom', tenant_id: TENANT_B, name: 'Tom Becker', email: 'tom@example.test', phone: null, tags: [],
    parsed: { skills: ['Python', 'LightGBM', 'MLflow', 'Airflow'], titles: ['Data scientist'], companies: ['E.ON'], total_years: 4, education: [{ degree: 'M.Sc.', field: 'Statistics', institution: 'TU Munich' }], summary: 'Forecasts grid load with gradient boosting.', parser: 'heuristic' },
    resume: { file_name: 'tom.pdf', text: 'Tom Becker. Data scientist at E.ON forecasting grid load with LightGBM; experiment tracking in MLflow; Airflow pipelines feeding a feature store.', uploaded_at: iso('2026-09-12') } },
]

const ATS_APPLICATIONS: Doc[] = [
  { id: 'app-ravi', tenant_id: TENANT_A, job_id: 'acme-job-sre', candidate_id: 'c-ravi', client_id: null, stage_id: 's_screening', stage_entered_at: iso('2026-09-12'), status: 'active',
    match: { score: 86, breakdown: {}, missing_must: [], reasons: ['Has Kubernetes and Terraform', 'Six years of SRE work'] }, results: [], history: [], source: 'referral', created_at: iso('2026-09-10'), updated_at: iso('2026-09-12'),
    compensation: { current: 3_200_000, expected: 4_000_000, currency: 'INR', period: 'year' } },
  { id: 'app-nina', tenant_id: TENANT_A, job_id: 'acme-job-sre', candidate_id: 'c-nina', client_id: null, stage_id: 's_applied', stage_entered_at: iso('2026-09-11'), status: 'withdrawn',
    match: { score: 22, breakdown: {}, missing_must: ['Kubernetes', 'Terraform'], reasons: [] }, results: [], history: [], source: 'apply_page', created_at: iso('2026-09-11'), updated_at: iso('2026-09-13') },
  { id: 'app-tom', tenant_id: TENANT_B, job_id: 'globex-job-ml', candidate_id: 'c-tom', client_id: null, stage_id: 's_interview', stage_entered_at: iso('2026-09-15'), status: 'active',
    match: { score: 78, breakdown: {}, missing_must: [], reasons: ['Time-series forecasting with LightGBM'] }, results: [], history: [], source: 'apply_page', created_at: iso('2026-09-12'), updated_at: iso('2026-09-15') },
]

// ─── Events ──────────────────────────────────────────────────────────────────

const HACKATHONS: Doc[] = [
  {
    id: 'acme-h-fintech', tenant_id: TENANT_A, name: 'Acme FinTech Build Weekend', status: 'published', slug: 'acme-fintech-weekend',
    starts_at: iso('2026-11-07T09:00:00Z'), ends_at: iso('2026-11-08T18:00:00Z'), num_teams: 40, max_per_team: 4,
    description: 'A 36-hour internal build weekend for payments ideas: faster settlements, fraud signals and merchant tools.',
    rules: [{ title: 'Team size', description: 'Teams of up to four people. Everyone must be an Acme employee or intern.' }, { title: 'Code ownership', description: 'All code is written during the event and pushed to the event GitHub organisation.' }],
    features: {
      judging_rubrics: true,
      rubric_criteria: [{ name: 'Innovation', weight: 30 }, { name: 'Code quality', weight: 25 }, { name: 'Business impact', weight: 25 }, { name: 'Presentation', weight: 20 }],
      sponsor_tracks: [{ name: 'Best use of UPI APIs', prize: '₹50,000', description: 'Most useful product built on UPI collect or autopay.' }],
    },
  },
  {
    id: 'globex-h-green', tenant_id: TENANT_B, name: 'Globex Green Energy Hackathon', status: 'published', slug: 'globex-green',
    starts_at: iso('2026-12-05T09:00:00Z'), ends_at: iso('2026-12-06T17:00:00Z'), num_teams: 25, max_per_team: 5,
    description: 'Ideas that cut energy use in Globex plants: smart metering, demand forecasting and carbon reporting.',
    features: {
      judging_rubrics: true,
      rubric_criteria: [{ name: 'Sustainability impact', weight: 40 }, { name: 'Feasibility', weight: 30 }, { name: 'Demo', weight: 30 }],
    },
  },
  {
    id: 'plat-h-winter', tenant_id: null, name: 'Platform Winter Hackathon', status: 'draft', slug: 'winter-hack',
    description: 'Draft: a public winter hackathon on open-source developer tools. Dates and prizes not final.',
  },
]

const CODEATHONS: Doc[] = [
  {
    id: 'cd-monsoon', tenant_id: null, title: 'Monsoon Codeathon 2026', status: 'upcoming', difficulty: 'medium',
    topics: ['graphs', 'dynamic programming'], startDate: iso('2026-10-25T10:00:00Z'), endDate: iso('2026-10-25T14:00:00Z'),
    prizePool: '₹1,00,000 in cash prizes', maxParticipants: 2000,
    description: 'Four hours, six algorithmic problems, individual format. Top 50 get certificates.',
    problems: [{ title: 'Flooded roads shortest path', difficulty: 'medium', points: 100, topics: ['graphs'] }, { title: 'Rain gauge partitions', difficulty: 'hard', points: 200 }],
    rules: 'No team play. Plagiarism checks run on every submission.',
  },
]

const COURSES: Doc[] = [
  {
    id: 'c-sql-basics', title: 'SQL for beginners', level: 'Beginner', category: 'Databases', tags: ['sql', 'databases'],
    description: 'Learn to query relational databases from scratch.',
    whatYoullLearn: ['SELECT and WHERE', 'Joining tables', 'GROUP BY and aggregates'],
    sections: [{ title: 'Querying', lessons: [
      { title: 'Inner and outer joins', content: 'An inner join returns rows that match in both tables; a left join keeps every row from the left table.' },
      { title: 'Grouping rows', content: 'GROUP BY collapses rows; HAVING filters groups after aggregation.' },
    ] }],
  },
]

const QUESTIONS: Doc[] = [
  { id: 'qb-consistency', title: 'Eventual consistency trade-offs', type: 'written', difficulty: 'hard', subject: 'System design', tags: ['distributed systems'],
    question: 'Explain eventual consistency and when a payments ledger can or cannot tolerate it.', answer: 'Ledger writes need strong consistency…', explanation: 'Staff only.' },
  { id: 'qb-binary-search', title: 'Binary search complexity', type: 'mcq', difficulty: 'easy', subject: 'Algorithms',
    question: 'What is the time complexity of binary search on a sorted array?', options: ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'], answer: 'O(log n)' },
]

// ─── Uploads ─────────────────────────────────────────────────────────────────

const now = iso('2026-10-01T00:00:00Z')
const upload = (id: string, tenant: string | null, title: string, kind: string, file: string, text: string, tags: string[] = []): Doc => ({
  id, tenant_id: tenant, title, kind, tags, file_name: file, mime: 'md', size: text.length, text, scan_status: 'clean',
  prompt_flags: [], uploaded_by: 'eval', created_at: now, updated_at: now,
})

const UPLOADS: Doc[] = [
  upload('acme-jd-payments', TENANT_A, 'Senior backend engineer — payments', 'jd', 'jd-payments.md', [
    '# About the role', 'You will own the services that move money for 200,000 merchants: payouts, refunds and settlement.',
    '# What you will do', '- Design idempotent APIs and reliable webhook delivery', '- Run services on Kubernetes with good observability', '- Mentor two mid-level engineers',
    '# Must have', '- 5+ years of backend work in Go, Java or Node.js', '- PostgreSQL at scale; Kafka or another log', '- Experience with payment systems or ledgers',
    '# Nice to have', '- UPI or card network experience',
  ].join('\n\n'), ['backend', 'senior']),
  upload('acme-rubric-backend', TENANT_A, 'Backend interview scorecard', 'rubric', 'backend-scorecard.docx', [
    '# Scoring', 'Each interviewer scores 1–4 on four areas. Hire bar: average 3.0 with no 1s.',
    '## Code quality (30%)', 'Readable names, small functions, tests for edge cases, no copy-paste. A 4 means production-ready code on the first pass.',
    '## System design (30%)', 'Trade-offs between consistency and availability; idempotency; back-pressure.',
    '## Problem solving (25%)', 'Breaks the problem down, checks complexity, tests with examples.',
    '## Communication (15%)', 'Explains decisions and asks clarifying questions.',
  ].join('\n\n'), ['backend']),
  upload('globex-jd-analyst', TENANT_B, 'Data analyst II', 'jd', 'data-analyst-ii.pdf', [
    'Globex is hiring a Data analyst II for the energy analytics team.',
    'Responsibilities: build demand-forecast dashboards, write SQL against the plant telemetry warehouse, present findings to plant managers.',
    'Requirements: 2+ years SQL, Python or R, a BI tool such as Tableau or Power BI. Bonus: time-series forecasting.',
  ].join('\n\n'), ['analytics']),
  upload('globex-policy-retention', TENANT_B, 'Candidate data retention policy', 'policy', 'retention-policy.txt', [
    'Globex keeps candidate assessment data for 180 days after the hiring decision, then deletes it.',
    'Candidates can ask for deletion earlier by emailing the recruiting team. Résumés of hired candidates move to the HR system.',
  ].join('\n\n'), ['privacy', 'hr']),
  upload('plat-up-handbook', null, 'Interviewer handbook (platform team)', 'policy', 'interviewer-handbook.md', [
    '# Interviewer handbook', 'How platform staff run live coding interviews: shadowing, calibration sessions and writing feedback within 24 hours.',
    'Never share the hidden test cases with candidates.',
  ].join('\n\n')),
]

/** Owner of every synthetic source: tenant id, or null with `adminOnly` for platform staff-only. */
// ─── Marketplace (public: published products of approved sellers) ─────────

const MKT_SELLERS: Doc[] = [
  { id: 'sel-asha', user_id: 'u-asha', display_name: 'Asha Books', slug: 'asha-books', status: 'approved', country: 'IN' },
  { id: 'sel-gone', user_id: 'u-gone', display_name: 'Suspended Store', slug: 'suspended-store', status: 'suspended', country: 'US' },
]
const MKT_PRODUCTS: Doc[] = [
  { id: 'mp-sysdesign-book', seller_id: 'sel-asha', kind: 'physical', title: 'Designing Data Systems — paperback', slug: 'designing-data-systems', status: 'published', category: 'books', tags: ['system-design', 'databases'], currency: 'INR', price: 89900,
    description_md: 'A printed guide to replication, partitioning, consensus and stream processing, with worked interview examples. Ships in 3 days across India.',
    shipping: { ships_from: 'IN', regions: ['IN'], fee: 4900, dispatch_days: 3 } },
  { id: 'mp-mock-interview', seller_id: 'sel-asha', kind: 'service', title: '1:1 mock interview with a senior engineer', slug: 'mock-interview', status: 'published', category: 'mock-interviews', tags: ['interview'], currency: 'INR', price: 249900,
    description_md: 'A 60-minute live coding and behavioural practice round over video, with written feedback on problem solving and communication afterwards.',
    service: { duration_min: 60, mode: 'virtual', slots_source: 'weekly_rules', weekly: [], timezone: 'Asia/Kolkata' } },
  { id: 'mp-resume-pack', seller_id: 'sel-asha', kind: 'digital', title: 'ATS-friendly résumé template pack', slug: 'resume-template-pack', status: 'published', category: 'templates', tags: ['resume'], currency: 'USD', price: 1900,
    description_md: 'Five editable résumé layouts that parse cleanly in applicant tracking systems, in Word and Google Docs formats. Instant download.',
    digital: { file_ids: ['f-secret'], download_limit: 5 } },
  { id: 'mp-draft-course', seller_id: 'sel-asha', kind: 'digital', title: 'Unreleased Kubernetes video course', slug: 'k8s-course', status: 'draft', category: 'courses', tags: ['kubernetes'], currency: 'USD', price: 4900,
    description_md: 'Draft: twelve videos on Kubernetes operators and helm charts.' },
  { id: 'mp-suspended-mug', seller_id: 'sel-gone', kind: 'physical', title: 'Rubber duck debugging mug', slug: 'duck-mug', status: 'published', category: 'merch', tags: ['merch'], currency: 'USD', price: 1500,
    description_md: 'A ceramic mug with a rubber duck for talking through bugs.' },
]

// ─── Events feed (public: published only) ───────────────────────────────────

const FEED_EVENTS: Doc[] = [
  { id: 'ef_climate', title: 'Global Climate Tech Hack 2026', url: 'https://example.org/climate', organiser: 'Green Devs', kind: 'hackathon', mode: 'online', location: { city: null, country: null },
    starts_at: '2026-11-14T09:00:00.000Z', ends_at: '2026-11-16T18:00:00.000Z', registration_deadline: '2026-11-10T23:59:00.000Z', prize: { text: '$25,000 in prizes', amount_minor: 2500000, currency: 'USD', usd_minor: 2500000 },
    themes: ['climate', 'sustainability'], description_summary: 'A weekend online hackathon building carbon tracking and clean energy tools.', status: 'published', source: 'devpost', internal: false },
  { id: 'ef_blr_ctf', title: 'Bengaluru Capture the Flag Night', url: 'https://example.org/ctf', organiser: 'BLR Security Guild', kind: 'ctf', mode: 'offline', location: { city: 'Bengaluru', country: 'IN' },
    starts_at: '2026-12-05T13:30:00.000Z', ends_at: '2026-12-05T20:30:00.000Z', registration_deadline: '2026-12-01T18:30:00.000Z', prize: null,
    themes: ['security'], description_summary: 'An in-person jeopardy-style CTF with web exploitation, reverse engineering and cryptography challenges.', status: 'published', source: 'partner', internal: false },
  { id: 'ef_weekly_round', title: 'Weekly Algorithms Round 412', url: 'https://example.org/round', organiser: 'Codeforces', kind: 'codeathon', mode: 'online', location: { city: null, country: null },
    starts_at: '2026-11-02T14:35:00.000Z', ends_at: '2026-11-02T16:35:00.000Z', registration_deadline: '2026-11-02T14:35:00.000Z', prize: null,
    themes: ['algorithms'], description_summary: 'A two-hour rated competitive programming contest.', status: 'published', source: 'codeforces', internal: false },
  { id: 'ef_hidden_spam', title: 'Crypto airdrop buildathon', url: 'https://example.org/spam', organiser: 'Unknown', kind: 'buildathon', mode: 'online', location: { city: null, country: null },
    starts_at: '2026-11-20T00:00:00.000Z', ends_at: null, registration_deadline: null, prize: null,
    themes: ['web3'], description_summary: 'Hidden by an admin as spam.', status: 'hidden', source: 'rss', internal: false },
]

// ─── Tech news + daily digests (public: published only) ─────────────────────

const NEWS_POSTS: Doc[] = [
  { id: 'np_open_weights', slug: 'open-weights-reasoning-model-released', title: 'A new open-weights reasoning model is released for local use', status: 'published', tags: ['signals', 'techcrunch-ai', 'news:ai'],
    excerpt: 'An AI lab published the weights of a mid-size reasoning model under a permissive licence, with a quantised build that runs on a laptop GPU.',
    body: '<p>The release includes evaluation results on maths and coding benchmarks and a model card describing training data and safety testing.</p>', source_note: 'Based on public reporting (techcrunch-ai).', published_at: '2026-10-21T06:00:00.000Z' },
  { id: 'np_k8s_release', slug: 'kubernetes-release-sidecar-containers-stable', title: 'Kubernetes promotes sidecar containers to stable', status: 'published', tags: ['signals', 'kubernetes-blog', 'news:cloud'],
    excerpt: 'The latest Kubernetes release makes native sidecar containers generally available and deprecates an older in-tree storage driver.',
    body: '<p>Cluster operators should check pod specs that relied on init-container ordering before upgrading.</p>', source_note: 'Based on public reporting (kubernetes-blog).', published_at: '2026-10-20T09:00:00.000Z' },
  { id: 'np_draft_leak', slug: 'unreleased-chip-rumour', title: 'Unverified rumour about a quantum laptop chip', status: 'draft', tags: ['signals', 'news:industry'],
    excerpt: 'Draft that an admin has not approved: quantum laptop chip rumour.', body: '<p>Draft.</p>', published_at: null },
]

const DIGESTS: Doc[] = [
  { id: 'dg_2026-10-20', date: '2026-10-20', status: 'published', items: [
    { key: 'event:ef_climate', rank: 1, category: 'hackathon', title: 'Global Climate Tech Hack 2026', url: 'https://codespectra.ai/events/ef_climate', starts_at: '2026-11-14T09:00:00.000Z', deadline: '2026-11-10T23:59:00.000Z', prize_text: '$25,000 in prizes', mode: 'online', source_name: 'Devpost',
      summaries: { en: { text: 'Open hackathon building carbon tracking tools; registration open now.', ai: false } } },
    { key: 'event:ef_blr_ctf', rank: 2, category: 'ctf', title: 'Bengaluru Capture the Flag Night', url: 'https://codespectra.ai/events/ef_blr_ctf', starts_at: '2026-12-05T13:30:00.000Z', deadline: '2026-12-01T18:30:00.000Z', mode: 'in_person', city: 'Bengaluru', source_name: 'Partner',
      summaries: { en: { text: 'In-person CTF with web, reversing and crypto challenges.', ai: false } } },
    { key: 'news:np_open_weights', rank: 3, category: 'news', topic: 'ai', title: 'A new open-weights reasoning model is released for local use', url: 'https://codespectra.ai/news/open-weights-reasoning-model-released', source_name: 'TechCrunch AI',
      summaries: { en: { text: 'Laptop-friendly open model weights with a permissive licence.', ai: false } } },
  ] },
  { id: 'dg_2026-10-19', date: '2026-10-19', status: 'review', items: [
    { key: 'event:ef_secret', rank: 1, category: 'hackathon', title: 'Moonbase robotics buildathon waiting for review', url: 'https://codespectra.ai/events/ef_secret', source_name: 'Unknown', summaries: { en: { text: 'Robotics buildathon on the moon base, not yet approved.', ai: false } } },
  ] },
]

export const SYNTHETIC_OWNERS: Record<string, { tenant: string | null; adminOnly: boolean }> = (() => {
  const out: Record<string, { tenant: string | null; adminOnly: boolean }> = {}
  for (const e of EXAMS) {
    const t = (e.tenant_id as string | null) ?? null
    out[`test:${e.id}`] = { tenant: t, adminOnly: !t }
    out[`test_result_summary:${e.id}`] = { tenant: t, adminOnly: !t }
  }
  for (const s of SUBMISSIONS) {
    const t = (EXAMS.find((e) => e.id === s.exam_id)?.tenant_id as string | null) ?? null
    out[`attempt_summary:${s.exam_id}:${s.user_id}`] = { tenant: t, adminOnly: !t }
  }
  // Résumés: owned by the organisation the candidate applied to with that résumé (RAG-004).
  for (const a of JOB_APPLICATIONS) {
    const t = (JOB_POSTINGS.find((j) => j.id === a.job_id)?.tenant_id as string | null) ?? null
    out[`resume:${t ?? '_platform'}:${a.user_id}`] = { tenant: t, adminOnly: !t }
  }
  out['resume:acme:u-lena'] = { tenant: TENANT_A, adminOnly: false }
  for (const j of ATS_JOBS) out[`ats_job:${j.id}`] = { tenant: j.tenant_id as string, adminOnly: false }
  for (const a of ATS_APPLICATIONS) out[`ats_application:${a.id}`] = { tenant: a.tenant_id as string, adminOnly: false }
  for (const h of HACKATHONS) out[`hackathon:${h.id}`] = { tenant: (h.tenant_id as string | null) ?? null, adminOnly: !h.tenant_id && h.status === 'draft' }
  for (const c of CODEATHONS) out[`codeathon:${c.id}`] = { tenant: null, adminOnly: false }
  for (const c of COURSES) out[`course:${c.id}`] = { tenant: null, adminOnly: false }
  for (const q of QUESTIONS) out[`question:${q.id}`] = { tenant: null, adminOnly: true }
  for (const u of UPLOADS) out[`upload:${u.id}`] = { tenant: (u.tenant_id as string | null) ?? null, adminOnly: !u.tenant_id }
  for (const p of MKT_PRODUCTS) out[`marketplace_product:${p.id}`] = { tenant: null, adminOnly: false }
  for (const e of FEED_EVENTS) out[`external_event:${e.id}`] = { tenant: null, adminOnly: false }
  for (const p of NEWS_POSTS) out[`news:${p.id}`] = { tenant: null, adminOnly: false }
  for (const d of DIGESTS) out[`digest:${d.id}`] = { tenant: null, adminOnly: false }
  return out
})()

interface InsertableDb { collection(name: string): { insertMany(docs: Doc[]): Promise<unknown> } }

/** Insert the synthetic organisations + platform items, and the given problems. */
export async function seedEvalCorpus(db: InsertableDb, problems: readonly Doc[]): Promise<void> {
  const put = async (name: string, docs: Doc[]) => { if (docs.length) await db.collection(name).insertMany(JSON.parse(JSON.stringify(docs))) }
  await put('problems', problems.map((p) => ({ ...p })))
  await put('exams', EXAMS)
  await put('user', USERS)
  await put('exam_submissions', SUBMISSIONS)
  await put('proctor_events', PROCTOR_EVENTS)
  await put('resume_drafts', RESUME_DRAFTS)
  await put('resumes', RESUMES)
  await put('job_postings', JOB_POSTINGS)
  await put('job_applications', JOB_APPLICATIONS)
  await put('ats_jobs', ATS_JOBS)
  await put('ats_candidates', ATS_CANDIDATES)
  await put('ats_applications', ATS_APPLICATIONS)
  await put('hackathons', HACKATHONS)
  await put('codeathons', CODEATHONS)
  await put('courses', COURSES)
  await put('question_bank', QUESTIONS)
  await put('rag_uploads', UPLOADS)
  await put('mkt_sellers', MKT_SELLERS)
  await put('mkt_products', MKT_PRODUCTS)
  await put('events_feed', FEED_EVENTS)
  await put('blog_posts', NEWS_POSTS)
  await put('daily_digests', DIGESTS)
}
