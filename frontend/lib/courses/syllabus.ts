/** Required modules so a generated course cannot skip a whole topic family. */

export const MIN_LESSONS_PER_MODULE = 6

const LANGUAGE = [
  'Environment and toolchain',
  'Syntax, types, and values',
  'Control flow',
  'Functions, scope, and closures',
  'Object-oriented programming and the type system',
  'Errors and exceptions',
  'Standard library essentials',
  'Strings and text processing',
  'Arrays and dynamic lists',
  'Linked lists',
  'Stacks and queues',
  'Hash tables and maps',
  'Trees, BST, and heaps',
  'Graphs',
  'Sorting algorithms',
  'Searching and binary search',
  'Recursion and backtracking',
  'Dynamic programming',
  'Greedy, two pointers, and sliding window',
  'Concurrency and async',
  'Memory, performance, and complexity',
  'Testing',
  'Packaging, modules, and build',
  'Interview problem patterns',
]

const FRONTEND = [
  'Project setup and tooling',
  'Language and runtime basics',
  'Rendering and the component model',
  'Props, state, and data flow',
  'Events and forms',
  'Lists, keys, and reconciliation',
  'Routing',
  'Data fetching and caching',
  'Styling',
  'Hooks and composition',
  'Performance',
  'Accessibility',
  'Testing UI',
  'State management',
  'Auth and protected routes',
  'Build, deploy, and production',
  'Interview and debugging patterns',
]

const CLOUD = [
  'Accounts, IAM, and billing',
  'Regions, availability, and networking',
  'Compute',
  'Object and block storage',
  'Managed databases',
  'Load balancing and DNS',
  'Containers on the cloud',
  'Serverless',
  'Observability',
  'Encryption and security',
  'Infrastructure as code',
  'Cost, quotas, and limits',
  'Identity federation',
  'Event-driven architecture',
  'Disaster recovery',
  'End-to-end production lab',
]

const DATA = [
  'Relational model and SQL basics',
  'Filtering, joins, and aggregation',
  'Indexes and query plans',
  'Transactions and isolation',
  'Schema design and normalization',
  'Constraints and integrity',
  'Window functions',
  'Stored logic and views',
  'Backup, restore, and replication',
  'JSON, documents, and NoSQL tradeoffs',
  'ETL and pipelines',
  'Performance tuning',
  'Security and roles',
  'Interview SQL patterns',
]

const OPS = [
  'Containers from scratch',
  'Images, layers, and registries',
  'Compose and local multi-service',
  'Orchestration basics',
  'Pods, services, and networking',
  'Config, secrets, and volumes',
  'Scaling and health checks',
  'CI/CD',
  'Infrastructure as code',
  'Observability',
  'Security hardening',
  'GitOps and rollouts',
  'Cost and resource limits',
  'Incident and debugging drills',
]

const ML = [
  'Problem framing and data',
  'Features and preprocessing',
  'Supervised learning',
  'Unsupervised learning',
  'Model evaluation',
  'Overfitting and regularization',
  'Neural nets basics',
  'Training loops and hardware',
  'NLP or vision track',
  'Pipelines and experiment tracking',
  'Serving models',
  'Ethics, leakage, and failure modes',
  'Interview ML patterns',
]

const SYS = [
  'Requirements and constraints',
  'Load, latency, and SLOs',
  'Load balancing',
  'Caching',
  'Databases at scale',
  'Queues and async',
  'Sharding and partitioning',
  'Consistency and replication',
  'CDN and edge',
  'Security in design',
  'Observability',
  'Failure and disaster recovery',
  'Capstone designs',
]

const SEC = [
  'Threat models',
  'Authn and authz',
  'Cryptography in practice',
  'Web attacks and defenses',
  'Network security',
  'Secrets and key management',
  'Secure coding',
  'Logging, detection, and response',
  'Cloud security',
  'Compliance basics',
  'Interview security patterns',
]

function norm(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function syllabusFamily(techStack: string): string {
  const t = norm(techStack)
  if (/react|next/.test(t)) return 'frontend'
  if (/aws|azure|gcp|google cloud/.test(t)) return 'cloud'
  if (/sql|postgres|mongo|data engineer/.test(t)) return 'data'
  if (/docker|kubernetes|k8s|terraform|devops/.test(t)) return 'ops'
  if (/machine learning|^ai$|artificial intelligence/.test(t)) return 'ml'
  if (/system design/.test(t)) return 'sys'
  if (/cyber|security/.test(t)) return 'sec'
  return 'language'
}

export function requiredModules(techStack: string): string[] {
  switch (syllabusFamily(techStack)) {
    case 'frontend': return FRONTEND
    case 'cloud': return CLOUD
    case 'data': return DATA
    case 'ops': return OPS
    case 'ml': return ML
    case 'sys': return SYS
    case 'sec': return SEC
    default: return LANGUAGE
  }
}

export function slugify(s: string): string {
  return norm(s).replace(/\s+/g, '-').slice(0, 80) || 'topic'
}

export function courseIdFor(techStack: string, level: string): string {
  return slugify(`${techStack}-${level || 'beginner'}`)
}

const STEM = [
  'Foundations and vocabulary',
  'Mental model and why it exists',
  'APIs and syntax in this stack',
  'Worked example from scratch',
  'Edge cases and failure modes',
  'Complexity, performance, and tradeoffs',
  'Common bugs and debugging',
  'Interview-style problem with a full solution',
]

export function lessonStub(moduleTitle: string, stem: string, tech: string, level: string) {
  return {
    title: `${moduleTitle}: ${stem}`,
    slug: slugify(`${moduleTitle}-${stem}`),
    description: stem,
    content: `Teach "${moduleTitle}" focusing on "${stem}" in ${tech} at ${level} level. Cover the topic completely with working ${tech} examples. Do not assume the student already knows this module. Do not skip subtopics or say details are out of scope.`,
    duration: 720,
    free: false,
    videoType: 'ai' as const,
  }
}

export function defaultLessons(moduleTitle: string, tech: string, level: string) {
  return STEM.map(stem => lessonStub(moduleTitle, stem, tech, level))
}

export function padCurriculum(
  tech: string,
  level: string,
  sections: Array<{ title?: string; slug?: string; description?: string; lessons?: any[] }>,
): typeof sections {
  const out = [...(sections || [])]

  for (const mod of requiredModules(tech)) {
    const key = norm(mod)
    let section = out.find(s => {
      const t = norm(s.title || s.slug || '')
      return t === key || t.includes(key) || key.includes(t)
    })
    if (!section) {
      section = { title: mod, slug: slugify(mod), description: `${tech} — ${mod}`, lessons: defaultLessons(mod, tech, level) }
      out.push(section)
      continue
    }
    const lessons = Array.isArray(section.lessons) ? [...section.lessons] : []
    if (lessons.length < MIN_LESSONS_PER_MODULE) {
      const titles = new Set(lessons.map(l => norm(l.title || '')))
      for (const stub of defaultLessons(mod, tech, level)) {
        if (lessons.length >= MIN_LESSONS_PER_MODULE) break
        if (titles.has(norm(stub.title))) continue
        lessons.push(stub)
        titles.add(norm(stub.title))
      }
      section.lessons = lessons
    }
  }
  return out
}
