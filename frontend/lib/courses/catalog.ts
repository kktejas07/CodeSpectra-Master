/** One catalog: industry → subject → 4 exclusive level tracks. Generator reads this; do not slice a mega-list. */

export const COURSE_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'] as const
export type CourseLevelKey = 'beginner' | 'intermediate' | 'advanced' | 'expert'

export const INDUSTRIES = [
  { id: 'software', label: 'Software' },
  { id: 'cloud', label: 'Cloud & DevOps' },
  { id: 'data', label: 'Data & AI' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'manufacturing', label: 'Manufacturing' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'finance', label: 'Finance' },
  { id: 'telecom', label: 'Telecom' },
  { id: 'business', label: 'Product & Business' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'design', label: 'Design' },
  { id: 'people', label: 'People & Sales' },
  { id: 'operations', label: 'Operations & Service' },
  { id: 'legal', label: 'Legal & Privacy' },
  { id: 'education', label: 'Education' },
] as const

export type IndustryId = (typeof INDUSTRIES)[number]['id']

export type Track = {
  title: (subject: string) => string
  brief: string
  modules: string[]
}

type FamilyTracks = Record<CourseLevelKey, Track>

function t(suffix: (s: string) => string, brief: string, modules: string[]): Track {
  return { title: suffix, brief, modules }
}

const LANGUAGE: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Language syntax, tooling, and basics. Not DSA.', [
    'Environment and toolchain', 'Syntax, types, and values', 'Control flow',
    'Functions, scope, and closures', 'Object-oriented programming and the type system',
    'Errors and exceptions', 'Standard library essentials', 'Strings and text processing',
    'Arrays and dynamic lists',
  ]),
  intermediate: t(s => `${s} Data Structures & Algorithms`, 'DSA track for this language.', [
    'Linked lists', 'Stacks and queues', 'Hash tables and maps', 'Trees, BST, and heaps',
    'Graphs', 'Sorting algorithms', 'Searching and binary search', 'Recursion and backtracking',
  ]),
  advanced: t(s => `${s} Advanced`, 'Concurrency, memory, testing, packaging.', [
    'Dynamic programming', 'Greedy, two pointers, and sliding window',
    'Concurrency and async', 'Memory, performance, and complexity',
    'Testing', 'Packaging, modules, and build',
  ]),
  expert: t(s => `${s} Expert`, 'Interview, internals, production.', [
    'Interview problem patterns', 'Design patterns in this language',
    'Profiling and optimization', 'Production debugging', 'Capstone project',
  ]),
}

const FRONTEND: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'UI building blocks. Not backend or DSA.', [
    'Project setup and tooling', 'Language and runtime basics', 'Rendering and the component model',
    'Props, state, and data flow', 'Events and forms', 'Lists, keys, and reconciliation',
  ]),
  intermediate: t(s => `${s} Apps & Data`, 'Routing, fetching, styling, a11y.', [
    'Routing', 'Data fetching and caching', 'Styling', 'Hooks and composition',
    'Accessibility', 'Testing UI',
  ]),
  advanced: t(s => `${s} Advanced`, 'State, auth, performance.', [
    'State management', 'Auth and protected routes', 'Performance',
    'Error boundaries and resilience', 'Design systems',
  ]),
  expert: t(s => `${s} Expert`, 'Production and debugging.', [
    'Build, deploy, and production', 'Interview and debugging patterns',
    'Architecture and code splitting', 'Observability in the browser', 'Capstone app',
  ]),
}

const CLOUD: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Accounts, compute, storage. Not Kubernetes.', [
    'Accounts, IAM, and billing', 'Regions, availability, and networking',
    'Compute', 'Object and block storage', 'Managed databases', 'Load balancing and DNS',
  ]),
  intermediate: t(s => `${s} Build & Operate`, 'Containers, serverless, observability.', [
    'Containers on the cloud', 'Serverless', 'Observability',
    'Encryption and security', 'Infrastructure as code',
  ]),
  advanced: t(s => `${s} Advanced`, 'Cost, identity, events, DR.', [
    'Cost, quotas, and limits', 'Identity federation',
    'Event-driven architecture', 'Disaster recovery',
  ]),
  expert: t(s => `${s} Expert`, 'Production architecture lab.', [
    'End-to-end production lab', 'Multi-account strategy',
    'Well-architected review', 'Incident drills',
  ]),
}

const DATA: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Relational basics. Not Spark.', [
    'Relational model and SQL basics', 'Filtering, joins, and aggregation',
    'Schema design and normalization', 'Constraints and integrity',
    'CRUD workflows', 'Working in a SQL client',
  ]),
  intermediate: t(s => `${s} Query & Integrity`, 'Indexes, transactions, windows.', [
    'Indexes and query plans', 'Transactions and isolation',
    'Window functions', 'Stored logic and views',
  ]),
  advanced: t(s => `${s} Advanced`, 'Ops, NoSQL tradeoffs, ETL.', [
    'Backup, restore, and replication', 'JSON, documents, and NoSQL tradeoffs',
    'ETL and pipelines', 'Performance tuning',
  ]),
  expert: t(s => `${s} Expert`, 'Security and interview SQL.', [
    'Security and roles', 'Interview SQL patterns',
    'Capacity and cost', 'Production incident lab',
  ]),
}

const OPS: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Containers and local workflows.', [
    'Containers from scratch', 'Images, layers, and registries',
    'Compose and local multi-service', 'Networking basics', 'Volumes and persistence',
  ]),
  intermediate: t(s => `${s} Orchestration`, 'Pods, config, scaling.', [
    'Orchestration basics', 'Pods, services, and networking',
    'Config, secrets, and volumes', 'Scaling and health checks',
  ]),
  advanced: t(s => `${s} Advanced`, 'CI/CD, IaC, security.', [
    'CI/CD', 'Infrastructure as code', 'Observability', 'Security hardening',
  ]),
  expert: t(s => `${s} Expert`, 'GitOps and incidents.', [
    'GitOps and rollouts', 'Cost and resource limits', 'Incident and debugging drills',
  ]),
}

const ML: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Framing, features, supervised learning.', [
    'Problem framing and data', 'Features and preprocessing',
    'Supervised learning', 'Model evaluation', 'Notebooks and reproducibility',
  ]),
  intermediate: t(s => `${s} Intermediate`, 'Unsupervised, regularization, neural nets.', [
    'Unsupervised learning', 'Overfitting and regularization',
    'Neural nets basics', 'Classical ML pipelines',
  ]),
  advanced: t(s => `${s} Advanced`, 'Training, NLP/vision, tracking.', [
    'Training loops and hardware', 'NLP or vision track',
    'Pipelines and experiment tracking', 'Feature stores',
  ]),
  expert: t(s => `${s} Expert`, 'Serving and failure modes.', [
    'Serving models', 'Ethics, leakage, and failure modes',
    'Interview ML patterns', 'Production ML lab',
  ]),
}

const SYS: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Load, latency, caching.', [
    'Requirements and constraints', 'Load, latency, and SLOs',
    'Load balancing', 'Caching', 'Back-of-envelope estimates',
  ]),
  intermediate: t(s => `${s} Intermediate`, 'Data stores and async.', [
    'Databases at scale', 'Queues and async', 'Sharding and partitioning',
    'Consistency and replication',
  ]),
  advanced: t(s => `${s} Advanced`, 'Edge, security, observability.', [
    'CDN and edge', 'Security in design', 'Observability', 'Rate limits and backpressure',
  ]),
  expert: t(s => `${s} Expert`, 'Failure and capstone designs.', [
    'Failure and disaster recovery', 'Capstone designs',
    'Interview system design', 'Tradeoff drills',
  ]),
}

const SEC: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Threats, auth, web attacks.', [
    'Threat models', 'Authn and authz', 'Cryptography in practice', 'Web attacks and defenses',
  ]),
  intermediate: t(s => `${s} Intermediate`, 'Network, secrets, secure coding.', [
    'Network security', 'Secrets and key management', 'Secure coding', 'Dependency risk',
  ]),
  advanced: t(s => `${s} Advanced`, 'Detection and cloud security.', [
    'Logging, detection, and response', 'Cloud security', 'Appsec testing',
  ]),
  expert: t(s => `${s} Expert`, 'Compliance and interview.', [
    'Compliance basics', 'Interview security patterns', 'Tabletop incident',
  ]),
}

const HEALTHCARE: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Care settings, roles, patient journey. Not coding DSA.', [
    'Care settings and roles', 'Patient journey', 'Clinical documentation',
    'Safety and quality basics', 'Privacy of health information', 'Working with EHR screens',
  ]),
  intermediate: t(s => `${s}: Operations`, 'Scheduling, staffing, revenue cycle intro.', [
    'Scheduling and access', 'Staffing and capacity', 'Revenue cycle basics',
    'Supply and pharmacy workflows', 'Referrals and care coordination',
  ]),
  advanced: t(s => `${s} Systems`, 'Informatics, interoperability, improvement.', [
    'Clinical informatics', 'Interoperability and data exchange',
    'Quality improvement methods', 'Analytics for operations',
  ]),
  expert: t(s => `${s} Expert`, 'Governance, regulation, leadership.', [
    'Regulatory programs', 'Risk and incident management',
    'Leadership and change', 'Capstone: improve a clinic workflow',
  ]),
}

const FINANCE: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Statements, time value, basic analysis.', [
    'Financial statements', 'Debits, credits, and the accounting cycle',
    'Time value of money', 'Ratio analysis', 'Budgets vs actuals', 'Excel for finance',
  ]),
  intermediate: t(s => `${s} Analysis`, 'Valuation, markets, risk intro.', [
    'Discounted cash flow', 'Markets and instruments', 'Credit risk basics',
    'Working capital', 'Forecasting',
  ]),
  advanced: t(s => `${s} Advanced`, 'Controls, products, regulation.', [
    'Internal controls', 'Financial products and FinTech rails',
    'Regulatory reporting intro', 'Stress and scenario analysis',
  ]),
  expert: t(s => `${s} Expert`, 'Portfolio, governance, capstone.', [
    'Portfolio construction', 'Risk governance', 'Audit and assurance',
    'Capstone: investment or credit memo',
  ]),
}

const BUSINESS: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Discovery, users, requirements.', [
    'Problem discovery', 'Users and jobs-to-be-done', 'Writing requirements',
    'Prioritization', 'Roadmaps', 'Stakeholder mapping',
  ]),
  intermediate: t(s => `${s} Delivery`, 'Agile delivery and measurement.', [
    'Agile and Scrum in practice', 'User stories and acceptance criteria',
    'Estimation and sequencing', 'Metrics and experiments', 'Go-to-market basics',
  ]),
  advanced: t(s => `${s} Advanced`, 'Strategy, platforms, org design.', [
    'Product strategy', 'Platform and ecosystem thinking',
    'Pricing and packaging', 'Org design for delivery',
  ]),
  expert: t(s => `${s} Expert`, 'Executive communication and capstone.', [
    'Executive communication', 'Portfolio governance',
    'Turnaround and sunsetting', 'Capstone: 0-to-1 product case',
  ]),
}

const MARKETING: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Audience, channels, messaging.', [
    'Audience and positioning', 'Channel map', 'Messaging and copy',
    'Landing pages', 'Analytics basics', 'Brand vs performance',
  ]),
  intermediate: t(s => `${s} Growth`, 'Acquisition, content, SEO/SEM.', [
    'Acquisition loops', 'Content systems', 'SEO fundamentals',
    'Paid media basics', 'Email and lifecycle',
  ]),
  advanced: t(s => `${s} Advanced`, 'Experimentation and attribution.', [
    'Experimentation', 'Attribution and incrementality',
    'Creative testing', 'Retention and monetization',
  ]),
  expert: t(s => `${s} Expert`, 'Brand systems and capstone.', [
    'Brand systems', 'Budget and mix modeling',
    'Privacy-safe marketing', 'Capstone: 90-day growth plan',
  ]),
}

const DESIGN: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Research, flows, visual basics.', [
    'Design problems and users', 'Research methods', 'Flows and information architecture',
    'Wireframes', 'Visual fundamentals', 'Critique',
  ]),
  intermediate: t(s => `${s} Practice`, 'Interaction, systems, prototyping.', [
    'Interaction design', 'Design systems', 'Prototyping',
    'Usability testing', 'Handoff to engineering',
  ]),
  advanced: t(s => `${s} Advanced`, 'Complex products and accessibility.', [
    'Complex product UX', 'Accessibility in design',
    'Content design', 'Metrics for design',
  ]),
  expert: t(s => `${s} Expert`, 'Design leadership.', [
    'Design ops', 'Stakeholder influence',
    'Portfolio and case studies', 'Capstone: end-to-end redesign',
  ]),
}

const PEOPLE: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Roles, process, conversations.', [
    'Role of the function', 'Pipeline or employee journey',
    'Discovery conversations', 'Notes and CRM/HRIS hygiene',
    'Objection handling or employee relations basics', 'Ethics and fairness',
  ]),
  intermediate: t(s => `${s} Practice`, 'Process design and coaching.', [
    'Process design', 'Coaching and feedback',
    'Compensation or deal basics', 'Forecasting', 'Enablement',
  ]),
  advanced: t(s => `${s} Advanced`, 'Systems and analytics.', [
    'Systems of record', 'People or revenue analytics',
    'Change management', 'Manager effectiveness',
  ]),
  expert: t(s => `${s} Expert`, 'Org design and capstone.', [
    'Org design', 'Executive alignment',
    'Risk and compliance in people/sales', 'Capstone: operating cadence',
  ]),
}

const LEGAL: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Contracts, privacy, risk language.', [
    'How law shows up at work', 'Contracts basics', 'Privacy fundamentals',
    'Intellectual property intro', 'Record keeping', 'When to escalate',
  ]),
  intermediate: t(s => `${s} Practice`, 'Vendor, employment, data processing.', [
    'Vendor and procurement', 'Employment basics',
    'Data processing agreements', 'Marketing and consumer law intro',
  ]),
  advanced: t(s => `${s} Advanced`, 'Security, incidents, cross-border.', [
    'Security and incident response legal', 'Cross-border data',
    'Regulatory investigations intro', 'Product counsel workflows',
  ]),
  expert: t(s => `${s} Expert`, 'Program design.', [
    'Privacy program design', 'Board and audit reporting',
    'Litigation hold basics', 'Capstone: policy pack',
  ]),
}

const EDUCATION: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Outcomes, lessons, assessment.', [
    'Learning outcomes', 'Audience and prior knowledge',
    'Lesson design', 'Assessment basics', 'Feedback', 'Facilitation',
  ]),
  intermediate: t(s => `${s} Practice`, 'Curriculum and media.', [
    'Curriculum mapping', 'Practice and spaced retrieval',
    'Media and accessibility', 'Cohorts and community',
  ]),
  advanced: t(s => `${s} Advanced`, 'Measurement and platforms.', [
    'Measurement and evaluation', 'Learning platforms',
    'Certification design', 'Workplace learning',
  ]),
  expert: t(s => `${s} Expert`, 'Program leadership.', [
    'Program strategy', 'Faculty or SME operations',
    'Quality and accreditation', 'Capstone: full course design',
  ]),
}

/** Split a topic list into 4 exclusive level tracks (reuse assessment branch topics). */
export function tracksFromTopics(topics: string[], labels?: Partial<Record<CourseLevelKey, string>>): FamilyTracks {
  const list = topics.filter(Boolean)
  // Ensure ≥3 modules per level: pad with generic stems if the source list is short.
  const pad = (slice: string[], extras: string[]) => {
    const out = [...slice]
    for (const e of extras) {
      if (out.length >= 3) break
      if (!out.includes(e)) out.push(e)
    }
    while (out.length < 3) out.push(`Practice lab ${out.length + 1}`)
    return out
  }
  const n = list.length
  const a = Math.max(3, Math.ceil(n * 0.35))
  const b = Math.max(a + 3, Math.ceil(n * 0.6))
  const c = Math.max(b + 3, Math.ceil(n * 0.8))
  const beginner = pad(list.slice(0, a), ['Foundations', 'Core vocabulary', 'First worked example'])
  const intermediate = pad(list.slice(a, b), ['Standard workflows', 'Quality bar', 'Case studies'])
  const advanced = pad(list.slice(b, c), ['Hard cases', 'Systems and tooling', 'Scale'])
  const expert = pad(
    [...list.slice(c), 'Capstone project', 'Interview and professional practice'],
    ['Leadership in this field', 'Teaching others', 'Portfolio'],
  )
  return {
    beginner: t(s => `${s} Fundamentals`, labels?.beginner || 'Core foundations for this field.', beginner),
    intermediate: t(s => `${s} Intermediate`, labels?.intermediate || 'Standard practice.', intermediate),
    advanced: t(s => `${s} Advanced`, labels?.advanced || 'Harder systems and analysis.', advanced),
    expert: t(s => `${s} Expert`, labels?.expert || 'Leadership and capstone.', expert),
  }
}

const ENGINEERING: FamilyTracks = tracksFromTopics([
  'Units, dimensions, and engineering math', 'Materials and properties', 'Statics and free-body diagrams',
  'Energy and power', 'Instrumentation and measurement', 'Safety and standards',
  'Design process', 'Manufacturing or construction intro', 'Thermofluids or circuits intro',
  'Control systems intro', 'Project planning', 'Failure modes',
  'Systems integration', 'Reliability', 'Cost and sustainability',
  'Professional ethics', 'Capstone design',
])

const OPERATIONS: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Customer journey, SOPs, quality.', [
    'Customer journey', 'Standard operating procedures', 'Quality and safety basics',
    'Cash or inventory hygiene', 'Communication under pressure', 'Tools of the job',
  ]),
  intermediate: t(s => `${s} Practice`, 'Shift ops, metrics, coaching.', [
    'Shift and floor operations', 'Metrics and dashboards', 'Coaching teammates',
    'Handling escalations', 'Loss prevention or SLA',
  ]),
  advanced: t(s => `${s} Advanced`, 'Process improvement and systems.', [
    'Process improvement', 'Workforce planning', 'Systems of record',
    'Compliance in operations',
  ]),
  expert: t(s => `${s} Expert`, 'Multi-site leadership.', [
    'Multi-site or multi-queue ops', 'P&L awareness',
    'Crisis drills', 'Capstone: improve a site KPI',
  ]),
}

const MANUFACTURING: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Shop floor, safety, quality basics.', [
    'Shop floor roles', 'Safety and PPE', 'Quality basics',
    '5S and workplace organization', 'Standard work', 'Material flow intro',
  ]),
  intermediate: t(s => `${s} Practice`, 'Lean, TPM, problem solving.', [
    'Lean wastes', 'Problem solving (A3/PDCA)', 'TPM intro',
    'Changeovers', 'Visual management',
  ]),
  advanced: t(s => `${s} Advanced`, 'Six Sigma and supply.', [
    'Six Sigma DMAIC intro', 'SPC basics', 'Supply and inventory',
    'Cost of quality',
  ]),
  expert: t(s => `${s} Expert`, 'Plant leadership.', [
    'Plant KPIs', 'Continuous improvement systems',
    'Capstone: reduce a defect or cycle time', 'Audit readiness',
  ]),
}

const TELECOM: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Networks, spectrum, services.', [
    'How telecom networks fit together', 'Spectrum and radio basics',
    'Access vs core', 'IP and transport intro', 'Service quality (voice/data)',
    'Customer and field roles',
  ]),
  intermediate: t(s => `${s} Practice`, 'LTE/5G and fiber ops.', [
    'LTE and 5G NR intro', 'Fiber and transport', 'Signalling overview',
    'Capacity and coverage tradeoffs', 'NOC workflows',
  ]),
  advanced: t(s => `${s} Advanced`, 'QoS, security, performance.', [
    'QoS and SLA', 'Network security basics', 'Performance troubleshooting',
    'Vendor and OSS/BSS touchpoints',
  ]),
  expert: t(s => `${s} Expert`, 'Architecture and incidents.', [
    'Network architecture tradeoffs', 'Incident and outage drills',
    'Capstone: design a coverage fix', 'Regulatory awareness',
  ]),
}

const GENERAL: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'First-principles intro to this subject.', [
    'What this field is', 'Core vocabulary', 'Mental models',
    'Tools of the trade', 'A first complete example', 'Common mistakes',
  ]),
  intermediate: t(s => `${s} Intermediate`, 'Standard practice.', [
    'Standard workflows', 'Quality bar', 'Collaboration',
    'Measurement', 'Case studies',
  ]),
  advanced: t(s => `${s} Advanced`, 'Hard cases and systems.', [
    'Hard cases', 'Systems and tooling', 'Risk and ethics', 'Scale',
  ]),
  expert: t(s => `${s} Expert`, 'Leadership and capstone.', [
    'Leadership in this field', 'Teaching others',
    'Capstone project', 'Portfolio and interview',
  ]),
}

export const FAMILY_TRACKS: Record<string, FamilyTracks> = {
  language: LANGUAGE,
  frontend: FRONTEND,
  cloud: CLOUD,
  data: DATA,
  ops: OPS,
  ml: ML,
  sys: SYS,
  sec: SEC,
  healthcare: HEALTHCARE,
  finance: FINANCE,
  business: BUSINESS,
  marketing: MARKETING,
  design: DESIGN,
  people: PEOPLE,
  legal: LEGAL,
  education: EDUCATION,
  engineering: ENGINEERING,
  manufacturing: MANUFACTURING,
  telecom: TELECOM,
  operations: OPERATIONS,
  general: GENERAL,
}

export const SOFTWARE_FAMILIES = new Set(['language', 'frontend', 'cloud', 'data', 'ops', 'ml', 'sys', 'sec'])

const NEXT: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'App Router, pages, routing. Not DSA.', [
    'Project setup and Next.js mental model', 'App Router and file conventions',
    'Server vs client components', 'Pages, layouts, and templates',
    'Linking and navigation', 'Styling in Next.js',
  ]),
  intermediate: t(s => `${s} Data & Rendering`, 'Fetching, caching, metadata.', [
    'Data fetching and caching', 'Server actions and forms',
    'Metadata and SEO', 'Route handlers', 'Auth patterns',
  ]),
  advanced: t(s => `${s} Advanced`, 'Streaming, performance, deploy.', [
    'Streaming and suspense', 'Performance and bundle control',
    'Middleware', 'Testing Next apps', 'Deploy and env',
  ]),
  expert: t(s => `${s} Expert`, 'Production architecture.', [
    'Multi-zone and monorepos', 'Observability',
    'Cost and caching at the edge', 'Capstone: production app',
  ]),
}

const MONGO: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Documents and CRUD. Not SQL joins as the core.', [
    'Document model', 'CRUD in MongoDB', 'Query operators',
    'Indexes', 'Data modeling', 'Drivers and Compass',
  ]),
  intermediate: t(s => `${s} Aggregation & Replica Sets`, 'Pipelines and HA.', [
    'Aggregation pipeline', 'Replica sets', 'Transactions',
    'Schema validation', 'Change streams intro',
  ]),
  advanced: t(s => `${s} Advanced`, 'Sharding and performance.', [
    'Sharding', 'Performance tuning', 'Security and roles', 'Backup and restore',
  ]),
  expert: t(s => `${s} Expert`, 'Production ops.', [
    'Production operations', 'Search and Atlas patterns',
    'Data modeling at scale', 'Incident lab',
  ]),
}

const DATA_ENG: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Warehouses, batch vs stream, SQL for pipelines.', [
    'Data lifecycle', 'Warehouses vs lakes', 'Batch vs stream',
    'SQL for pipelines', 'File formats', 'Orchestration intro',
  ]),
  intermediate: t(s => `${s} Pipelines`, 'ETL/ELT, quality, orchestration.', [
    'ETL and ELT', 'Orchestration in practice', 'Data quality',
    'Dimensional modeling', 'Scheduling and SLA',
  ]),
  advanced: t(s => `${s} Advanced`, 'Scale, streaming, cost.', [
    'Distributed processing', 'Streaming systems',
    'Cost and performance', 'Governance and lineage',
  ]),
  expert: t(s => `${s} Expert`, 'Platform and production.', [
    'Data platform design', 'Privacy in pipelines',
    'On-call for data', 'Capstone: end-to-end pipeline',
  ]),
}

const K8S: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Cluster mental model, kubectl, pods.', [
    'Cluster mental model', 'kubectl and YAML', 'Pods',
    'Deployments', 'Services', 'ConfigMaps and Secrets',
  ]),
  intermediate: t(s => `${s} Workloads`, 'Ingress, probes, HPA, RBAC.', [
    'Volumes and storage', 'Ingress and DNS', 'Probes and health',
    'HPA and resources', 'RBAC',
  ]),
  advanced: t(s => `${s} Advanced`, 'Helm, network policy, observability.', [
    'Helm', 'Network policies', 'Observability', 'Security hardening',
  ]),
  expert: t(s => `${s} Expert`, 'Production Kubernetes.', [
    'GitOps', 'Multi-tenancy', 'Cost and bin packing', 'Incident drills',
  ]),
}

const DOCKER: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Images, run, Dockerfile.', [
    'Why containers', 'Images and layers', 'Dockerfile',
    'Run, exec, logs', 'Volumes', 'Networks',
  ]),
  intermediate: t(s => `${s} Compose & Build`, 'Compose, registries, multi-stage.', [
    'Compose multi-service', 'Registries', 'BuildKit and multi-stage',
    'Env and secrets locally', 'Debugging containers',
  ]),
  advanced: t(s => `${s} Advanced`, 'Security and CI.', [
    'Image security scanning', 'CI with Docker', 'Rootless and hardening',
    'Production compose vs orchestrators',
  ]),
  expert: t(s => `${s} Expert`, 'Production container ops.', [
    'Supply chain', 'Runtime security', 'Cost of images', 'Capstone: ship an app',
  ]),
}

const TERRAFORM: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'HCL, providers, state.', [
    'IaC mental model', 'HCL and providers', 'Resources and data sources',
    'Variables and outputs', 'State', 'Plan and apply',
  ]),
  intermediate: t(s => `${s} Modules & Backends`, 'Modules, workspaces.', [
    'Modules', 'Backends', 'Workspaces', 'State locking', 'Refactoring',
  ]),
  advanced: t(s => `${s} Advanced`, 'Policy, CI, drift.', [
    'Policy as code', 'CI for Terraform', 'Drift and import', 'Secrets and IAM',
  ]),
  expert: t(s => `${s} Expert`, 'Org-scale Terraform.', [
    'Terragrunt or stacks', 'Multi-account patterns',
    'Break-glass and disasters', 'Capstone: landing zone',
  ]),
}

const DEVOPS: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Git, CI, environments.', [
    'Delivery mental model', 'Git workflows', 'CI pipelines',
    'Artifacts', 'Environments', 'Basic monitoring',
  ]),
  intermediate: t(s => `${s} Delivery`, 'CD, IaC, quality gates.', [
    'Continuous delivery', 'Infrastructure as code intro',
    'Quality gates', 'Feature flags', 'On-call intro',
  ]),
  advanced: t(s => `${s} Advanced`, 'SRE practices.', [
    'SLOs and error budgets', 'Incident management',
    'Observability', 'Security in the pipeline',
  ]),
  expert: t(s => `${s} Expert`, 'Platform engineering.', [
    'Internal developer platforms', 'Cost and capacity',
    'Reliability reviews', 'Capstone: golden path',
  ]),
}

const AI_APPLIED: FamilyTracks = {
  beginner: t(s => `${s} Fundamentals`, 'Prompts, models, evals. Not DSA.', [
    'What generative AI can and cannot do', 'Prompts and context',
    'Model choices', 'Safety and leakage', 'Evals by hand', 'Building a first app',
  ]),
  intermediate: t(s => `${s} Applications`, 'RAG, tools, agents.', [
    'RAG', 'Tools and function calling', 'Agents',
    'Memory and state', 'Product UX for AI',
  ]),
  advanced: t(s => `${s} Advanced`, 'Evals, cost, fine-tuning.', [
    'Automated evals', 'Cost and latency', 'Fine-tuning vs RAG',
    'Observability for LLM apps',
  ]),
  expert: t(s => `${s} Expert`, 'Production AI systems.', [
    'Production architecture', 'Governance and policy',
    'Red teaming', 'Capstone: reliable AI feature',
  ]),
}

export type CatalogSubject = {
  name: string
  industry: IndustryId
  family: string
  aliases?: string[]
  tracks?: FamilyTracks
}

export const CATALOG_SUBJECTS: CatalogSubject[] = [
  { name: 'Java', industry: 'software', family: 'language' },
  { name: 'Python', industry: 'software', family: 'language' },
  { name: 'JavaScript', industry: 'software', family: 'language' },
  { name: 'TypeScript', industry: 'software', family: 'language' },
  { name: 'C#', industry: 'software', family: 'language' },
  { name: '.NET', industry: 'software', family: 'language' },
  { name: 'C++', industry: 'software', family: 'language' },
  { name: 'Go', industry: 'software', family: 'language' },
  { name: 'Rust', industry: 'software', family: 'language' },
  { name: 'Kotlin', industry: 'software', family: 'language' },
  { name: 'Swift', industry: 'software', family: 'language' },
  { name: 'Node.js', industry: 'software', family: 'language' },
  { name: 'React', industry: 'software', family: 'frontend' },
  { name: 'Next.js', industry: 'software', family: 'frontend', tracks: NEXT },
  { name: 'SQL', industry: 'data', family: 'data' },
  { name: 'PostgreSQL', industry: 'data', family: 'data' },
  { name: 'MongoDB', industry: 'data', family: 'data', tracks: MONGO },
  { name: 'Data Engineering', industry: 'data', family: 'data', tracks: DATA_ENG },
  { name: 'Machine Learning', industry: 'data', family: 'ml' },
  { name: 'AI', industry: 'data', family: 'ml', tracks: AI_APPLIED },
  { name: 'System Design', industry: 'software', family: 'sys' },
  { name: 'Cybersecurity', industry: 'software', family: 'sec' },
  { name: 'AWS', industry: 'cloud', family: 'cloud' },
  { name: 'Azure', industry: 'cloud', family: 'cloud' },
  { name: 'GCP', industry: 'cloud', family: 'cloud', aliases: ['google cloud'] },
  { name: 'Docker', industry: 'cloud', family: 'ops', tracks: DOCKER },
  { name: 'Kubernetes', industry: 'cloud', family: 'ops', tracks: K8S, aliases: ['k8s'] },
  { name: 'Terraform', industry: 'cloud', family: 'ops', tracks: TERRAFORM },
  { name: 'DevOps', industry: 'cloud', family: 'ops', tracks: DEVOPS },
  { name: 'Mechanical Engineering', industry: 'engineering', family: 'engineering', tracks: tracksFromTopics([
    'Thermodynamics', 'Fluid Mechanics', 'Strength of Materials', 'Machine Design',
    'Manufacturing Processes', 'Theory of Machines', 'Heat Transfer', 'CAD and drawings',
    'Vibration and dynamics', 'Mechatronics intro', 'Industrial safety', 'Capstone design',
  ]) },
  { name: 'Electrical Engineering', industry: 'engineering', family: 'engineering', tracks: tracksFromTopics([
    'Circuit Theory', 'Electrical Machines', 'Power Systems', 'Control Systems',
    'Power Electronics', 'Electrical Measurements', 'Electromagnetic Theory', 'Protection',
    'Renewables intro', 'Industrial drives', 'Safety and codes', 'Capstone design',
  ]) },
  { name: 'Electronics & Communication', industry: 'engineering', family: 'engineering', tracks: tracksFromTopics([
    'Signals & Systems', 'Digital Electronics', 'Analog Electronics', 'Communication Systems',
    'Microprocessors', 'Control Systems', 'Electronic Devices', 'Embedded intro',
    'RF basics', 'PCB and lab practice', 'Test and measurement', 'Capstone design',
  ]) },
  { name: 'Civil Engineering', industry: 'engineering', family: 'engineering', tracks: tracksFromTopics([
    'Structural Analysis', 'Concrete Technology', 'Geotechnical Engineering', 'Fluid Mechanics',
    'Environmental Engineering', 'Surveying', 'Transportation Engineering', 'Construction management',
    'Building codes', 'Estimation and costing', 'Site safety', 'Capstone design',
  ]) },
  { name: 'Chemical Engineering', industry: 'engineering', family: 'engineering', tracks: tracksFromTopics([
    'Chemical Reaction Engineering', 'Mass Transfer', 'Heat Transfer', 'Thermodynamics',
    'Fluid Mechanics', 'Process Control', 'Chemical Technology', 'Plant safety',
    'Separation processes', 'Process design', 'Sustainability', 'Capstone design',
  ]) },
  { name: 'Lean Manufacturing', industry: 'manufacturing', family: 'manufacturing' },
  { name: 'Quality & Six Sigma', industry: 'manufacturing', family: 'manufacturing' },
  { name: 'Healthcare Operations', industry: 'healthcare', family: 'healthcare' },
  { name: 'Clinical Informatics', industry: 'healthcare', family: 'healthcare', tracks: tracksFromTopics([
    'Clinical data and documentation', 'EHR workflows', 'Interoperability standards',
    'Orders and results', 'Clinical decision support', 'Privacy and access control',
    'Analytics for care quality', 'Implementation and change', 'Vendor and interface ops',
    'Safety and downtime', 'Reporting and registries', 'Capstone: clinic digital workflow',
  ]) },
  { name: 'HIPAA & Privacy', industry: 'healthcare', family: 'legal' },
  { name: 'Accounting Fundamentals', industry: 'finance', family: 'finance' },
  { name: 'Financial Analysis', industry: 'finance', family: 'finance' },
  { name: 'FinTech', industry: 'finance', family: 'finance' },
  { name: 'Banking Operations', industry: 'finance', family: 'finance', tracks: tracksFromTopics([
    'Deposit and payment products', 'KYC and AML basics', 'Credit lifecycle',
    'Core banking systems', 'Risk and capital intro', 'Fraud and monitoring',
    'Regulatory reporting intro', 'Customer journeys in banking', 'Treasury intro',
    'Ops controls', 'Incident handling', 'Capstone: improve a banking process',
  ]) },
  { name: 'Telecom Networks', industry: 'telecom', family: 'telecom' },
  { name: '5G & Wireless', industry: 'telecom', family: 'telecom' },
  { name: 'Product Management', industry: 'business', family: 'business' },
  { name: 'Business Analysis', industry: 'business', family: 'business' },
  { name: 'Project Management', industry: 'business', family: 'business' },
  { name: 'Digital Marketing', industry: 'marketing', family: 'marketing' },
  { name: 'Content Strategy', industry: 'marketing', family: 'marketing' },
  { name: 'UX Design', industry: 'design', family: 'design' },
  { name: 'UI Design', industry: 'design', family: 'design' },
  { name: 'HR Operations', industry: 'people', family: 'people' },
  { name: 'B2B Sales', industry: 'people', family: 'people' },
  { name: 'Retail Operations', industry: 'operations', family: 'operations' },
  { name: 'Hospitality Operations', industry: 'operations', family: 'operations' },
  { name: 'Customer Support / Contact Center', industry: 'operations', family: 'operations' },
  { name: 'Data Privacy & Compliance', industry: 'legal', family: 'legal' },
  { name: 'Instructional Design', industry: 'education', family: 'education' },
]

export const SOFTWARE_STEM = [
  'Foundations and vocabulary',
  'Mental model and why it exists',
  'APIs and syntax in this stack',
  'Worked example from scratch',
  'Edge cases and failure modes',
  'Complexity, performance, and tradeoffs',
  'Common bugs and debugging',
  'Interview-style problem with a full solution',
]

export const DOMAIN_STEM = [
  'Foundations and vocabulary',
  'Mental model and why it exists',
  'How professionals do this in practice',
  'Worked example from scratch',
  'Edge cases and failure modes',
  'Common mistakes and how to catch them',
  'Constraints, ethics, or regulation',
  'Capstone scenario with a full solution',
]

export function levelKey(level: string): CourseLevelKey {
  const lv = (level || 'beginner').toLowerCase()
  if (lv === 'intermediate' || lv === 'advanced' || lv === 'expert') return lv
  return 'beginner'
}

function norm(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function findSubject(name: string): CatalogSubject | undefined {
  const n = norm(name)
  if (!n) return undefined
  return CATALOG_SUBJECTS.find(s => {
    if (norm(s.name) === n) return true
    return (s.aliases || []).some(a => norm(a) === n)
  })
}

export function familyFor(name: string): string {
  const hit = findSubject(name)
  if (hit) return hit.family
  const t = norm(name)
  if (/react|next/.test(t)) return 'frontend'
  if (/aws|azure|gcp|google cloud/.test(t)) return 'cloud'
  if (/sql|postgres|mongo|data engineer/.test(t)) return 'data'
  if (/docker|kubernetes|k8s|terraform|devops/.test(t)) return 'ops'
  if (/machine learning|^ai$|artificial intelligence/.test(t)) return 'ml'
  if (/system design/.test(t)) return 'sys'
  if (/cyber|security/.test(t)) return 'sec'
  if (/health|clinic|hipaa|ehr|nurs|pharma/.test(t)) return 'healthcare'
  if (/mechanical|electrical|civil|chemical|electronics|thermo|fluid mech|structural/.test(t)) return 'engineering'
  if (/lean|six sigma|manufactur|shop floor|tpm/.test(t)) return 'manufacturing'
  if (/telecom|5g|wireless|lte|rf\b|spectrum/.test(t)) return 'telecom'
  if (/retail|hospitality|contact center|call center|customer support/.test(t)) return 'operations'
  if (/account|financ|fintech|invest|credit/.test(t)) return 'finance'
  if (/product manag|business analy|project manag|scrum|agile/.test(t)) return 'business'
  if (/market|seo|brand|growth/.test(t)) return 'marketing'
  if (/\bux\b|\bui\b|design/.test(t)) return 'design'
  if (/\bhr\b|people ops|sales|customer success/.test(t)) return 'people'
  if (/legal|privacy|gdpr|compliance/.test(t)) return 'legal'
  if (/teach|instruction|curriculum|learning design/.test(t)) return 'education'
  if (/java|python|javascript|typescript|kotlin|swift|golang|^go$|rust|c\+\+|c#|node|\.net/.test(t)) return 'language'
  return 'general'
}

export function trackFor(subject: string, level: string): Track {
  const key = levelKey(level)
  const found = findSubject(subject)
  const tracks = found?.tracks || FAMILY_TRACKS[found?.family || familyFor(subject)] || FAMILY_TRACKS.general
  return tracks[key]
}

export function subjectsForIndustry(industry: string): CatalogSubject[] {
  return CATALOG_SUBJECTS.filter(s => s.industry === industry)
}
