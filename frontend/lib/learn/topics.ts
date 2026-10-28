/**
 * Topic planner (pure): the seeded taxonomy, duplicate detection (topic hash +
 * title similarity) and the scheduler's pick of the next topics to write.
 * Database operations live in lib/learn/store.ts.
 */
import { createHash } from 'node:crypto'
import type { LearnCategoryId, LearnLevel, LearnTopicDoc } from './types'
import { LEARN_LEVELS } from './types'

type SeedRow = [title: string, level: LearnLevel, tags?: string[], series?: string]

/** Seed taxonomy. Tags match problem-bank topics so posts can link to practice problems. */
export const SEED_TOPICS: Record<LearnCategoryId, SeedRow[]> = {
  dsa: [
    ['Big-O notation and complexity analysis', 'beginner', ['complexity'], 'DSA foundations'],
    ['Arrays and dynamic arrays', 'beginner', ['arrays'], 'DSA foundations'],
    ['Two pointers technique', 'beginner', ['two pointers', 'arrays'], 'DSA foundations'],
    ['Sliding window technique', 'intermediate', ['sliding window', 'arrays', 'strings'], 'DSA foundations'],
    ['Prefix sums', 'beginner', ['prefix sum', 'arrays']],
    ['Linked lists', 'beginner', ['linked list']],
    ['Stacks and queues', 'beginner', ['stack', 'queue']],
    ['Monotonic stack', 'intermediate', ['stack', 'monotonic stack']],
    ['Hash tables and hashing', 'beginner', ['hashing', 'hash table'], 'DSA foundations'],
    ['Bubble, selection and insertion sort', 'beginner', ['sorting'], 'Sorting algorithms'],
    ['Merge sort', 'beginner', ['sorting', 'divide and conquer'], 'Sorting algorithms'],
    ['Quicksort', 'intermediate', ['sorting', 'divide and conquer'], 'Sorting algorithms'],
    ['Heap sort and binary heaps', 'intermediate', ['sorting', 'heap', 'priority queue'], 'Sorting algorithms'],
    ['Counting sort and radix sort', 'intermediate', ['sorting'], 'Sorting algorithms'],
    ['Linear search', 'beginner', ['searching'], 'Searching algorithms'],
    ['Binary search', 'beginner', ['binary search', 'searching'], 'Searching algorithms'],
    ['Binary search on the answer', 'intermediate', ['binary search'], 'Searching algorithms'],
    ['Recursion and backtracking', 'intermediate', ['recursion', 'backtracking']],
    ['Binary trees and traversals', 'beginner', ['trees', 'binary tree'], 'Trees'],
    ['Binary search trees', 'intermediate', ['trees', 'binary search tree'], 'Trees'],
    ['Balanced trees: AVL and red-black', 'advanced', ['trees'], 'Trees'],
    ['Tries (prefix trees)', 'intermediate', ['trie', 'strings'], 'Trees'],
    ['Segment trees', 'advanced', ['segment tree'], 'Trees'],
    ['Fenwick trees (binary indexed trees)', 'advanced', ['fenwick tree', 'binary indexed tree'], 'Trees'],
    ['Graph representations', 'beginner', ['graphs'], 'Graph algorithms'],
    ['Breadth-first search (BFS)', 'beginner', ['graphs', 'bfs'], 'Graph algorithms'],
    ['Depth-first search (DFS)', 'beginner', ['graphs', 'dfs'], 'Graph algorithms'],
    ['Topological sort', 'intermediate', ['graphs', 'topological sort'], 'Graph algorithms'],
    ["Dijkstra's shortest path algorithm", 'intermediate', ['graphs', 'shortest path'], 'Graph algorithms'],
    ['Bellman-Ford algorithm', 'advanced', ['graphs', 'shortest path'], 'Graph algorithms'],
    ['Floyd-Warshall algorithm', 'advanced', ['graphs', 'shortest path', 'dynamic programming'], 'Graph algorithms'],
    ['Union-find (disjoint set union)', 'intermediate', ['union find', 'graphs'], 'Graph algorithms'],
    ["Minimum spanning trees: Kruskal and Prim", 'intermediate', ['graphs', 'mst'], 'Graph algorithms'],
    ['Introduction to dynamic programming', 'intermediate', ['dynamic programming'], 'Dynamic programming'],
    ['Knapsack problems', 'intermediate', ['dynamic programming', 'knapsack'], 'Dynamic programming'],
    ['Longest common subsequence', 'intermediate', ['dynamic programming', 'strings'], 'Dynamic programming'],
    ['Dynamic programming on trees', 'advanced', ['dynamic programming', 'trees'], 'Dynamic programming'],
    ['Bitmask dynamic programming', 'advanced', ['dynamic programming', 'bit manipulation'], 'Dynamic programming'],
    ['Greedy algorithms', 'intermediate', ['greedy']],
    ['Interval scheduling and merging intervals', 'intermediate', ['greedy', 'intervals', 'sorting']],
    ['String matching: KMP', 'advanced', ['strings', 'kmp']],
    ['Rolling hash and Rabin-Karp', 'advanced', ['strings', 'hashing']],
    ['Bit manipulation basics', 'beginner', ['bit manipulation']],
  ],
  'system-design': [
    ['System design interview framework', 'beginner', [], 'System design basics'],
    ['Load balancing', 'beginner', [], 'System design basics'],
    ['Caching strategies', 'intermediate', [], 'System design basics'],
    ['Database sharding and partitioning', 'intermediate', [], 'System design basics'],
    ['Consistent hashing', 'intermediate', ['hashing']],
    ['CAP theorem and consistency models', 'intermediate', []],
    ['Message queues and event streaming', 'intermediate', []],
    ['Rate limiting algorithms', 'intermediate', []],
    ['Designing a URL shortener', 'beginner', []],
    ['Designing a chat system', 'advanced', []],
    ['Content delivery networks (CDNs)', 'beginner', []],
  ],
  'design-patterns': [
    ['SOLID principles', 'beginner', [], 'Design patterns'],
    ['Singleton pattern', 'beginner', [], 'Design patterns'],
    ['Factory and abstract factory patterns', 'beginner', [], 'Design patterns'],
    ['Builder pattern', 'beginner', [], 'Design patterns'],
    ['Strategy pattern', 'beginner', [], 'Design patterns'],
    ['Observer pattern', 'intermediate', [], 'Design patterns'],
    ['Decorator pattern', 'intermediate', [], 'Design patterns'],
    ['Adapter pattern', 'intermediate', [], 'Design patterns'],
    ['Dependency injection', 'intermediate', []],
  ],
  architecture: [
    ['Monolith vs microservices', 'intermediate', []],
    ['Layered architecture', 'beginner', []],
    ['Hexagonal architecture (ports and adapters)', 'advanced', []],
    ['Event-driven architecture', 'intermediate', []],
    ['CQRS and event sourcing', 'advanced', []],
    ['Serverless architecture', 'intermediate', []],
    ['REST vs GraphQL vs gRPC', 'intermediate', []],
  ],
  methodologies: [
    ['Agile fundamentals', 'beginner', [], 'Ways of working'],
    ['Scrum: roles, events and artifacts', 'beginner', [], 'Ways of working'],
    ['Kanban', 'beginner', [], 'Ways of working'],
    ['Test-driven development (TDD)', 'intermediate', [], 'Ways of working'],
    ['Behaviour-driven development (BDD)', 'intermediate', [], 'Ways of working'],
    ['Domain-driven design (DDD)', 'advanced', [], 'Ways of working'],
    ['DevOps culture and practices', 'beginner', [], 'Ways of working'],
    ['CI/CD pipelines', 'intermediate', [], 'Ways of working'],
    ['Trunk-based development', 'intermediate', [], 'Ways of working'],
    ['Code review best practices', 'beginner', []],
  ],
  testing: [
    ['The testing pyramid', 'beginner', []],
    ['Unit testing', 'beginner', []],
    ['Mocks, stubs and fakes', 'intermediate', []],
    ['Integration testing', 'intermediate', []],
    ['End-to-end testing', 'intermediate', []],
    ['Property-based testing', 'advanced', []],
  ],
  security: [
    ['OWASP Top 10 overview', 'beginner', [], 'Secure coding'],
    ['SQL injection and how to prevent it', 'beginner', [], 'Secure coding'],
    ['Cross-site scripting (XSS)', 'beginner', [], 'Secure coding'],
    ['Cross-site request forgery (CSRF)', 'intermediate', [], 'Secure coding'],
    ['Authentication vs authorisation', 'beginner', [], 'Secure coding'],
    ['Password hashing done right', 'intermediate', [], 'Secure coding'],
    ['JSON Web Tokens (JWT)', 'intermediate', []],
    ['OAuth 2.0 and OpenID Connect', 'advanced', []],
  ],
  databases: [
    ['SQL joins', 'beginner', ['sql']],
    ['Database indexing', 'intermediate', ['sql']],
    ['Normalisation and normal forms', 'beginner', ['sql']],
    ['Transactions and ACID', 'intermediate', ['sql']],
    ['SQL vs NoSQL', 'beginner', []],
    ['Query optimisation basics', 'advanced', ['sql']],
  ],
  cloud: [
    ['Containers and Docker', 'beginner', []],
    ['Kubernetes fundamentals', 'intermediate', []],
    ['Infrastructure as code', 'intermediate', []],
    ['Observability: logs, metrics and traces', 'intermediate', []],
    ['Cloud service models: IaaS, PaaS, SaaS', 'beginner', []],
  ],
  'ai-ml': [
    ['Machine learning fundamentals for developers', 'beginner', [], 'AI engineering'],
    ['Embeddings and vector search', 'intermediate', [], 'AI engineering'],
    ['Retrieval-augmented generation (RAG)', 'intermediate', [], 'AI engineering'],
    ['Prompt engineering for developers', 'beginner', [], 'AI engineering'],
    ['Evaluating LLM applications', 'advanced', [], 'AI engineering'],
    ['Gradient descent', 'intermediate', []],
  ],
  'interview-prep': [
    ['How to approach a coding interview problem', 'beginner', []],
    ['Common coding interview patterns', 'intermediate', []],
    ['Behavioural interviews with the STAR method', 'beginner', []],
  ],
  career: [
    ['Writing a developer résumé', 'beginner', []],
    ['Git workflow essentials', 'beginner', ['git']],
    ['Reading other people\'s code', 'beginner', []],
    ['Technical writing for engineers', 'intermediate', []],
  ],
  languages: [
    ['When to use Python', 'beginner', ['python'], 'Python'],
    ['Your first Python project: an expense tracker CLI', 'beginner', ['python'], 'Python'],
    ['Python interview questions', 'intermediate', ['python'], 'Python'],
    ['When to use Java', 'beginner', ['java'], 'Java'],
    ['Your first Java project: a library management console app', 'beginner', ['java'], 'Java'],
    ['Java interview questions', 'intermediate', ['java'], 'Java'],
    ['When to use JavaScript and TypeScript', 'beginner', ['javascript', 'typescript'], 'JavaScript and TypeScript'],
    ['Your first TypeScript project: a to-do web app', 'beginner', ['javascript', 'typescript'], 'JavaScript and TypeScript'],
    ['JavaScript and TypeScript interview questions', 'intermediate', ['javascript', 'typescript'], 'JavaScript and TypeScript'],
    ['When to use C++', 'beginner', ['c++'], 'C++'],
    ['Your first C++ project: a terminal snake game', 'intermediate', ['c++'], 'C++'],
    ['C++ interview questions: memory, pointers and the STL', 'intermediate', ['c++'], 'C++'],
    ['When to use Go', 'beginner', ['go'], 'Go'],
    ['Your first Go project: a website uptime checker', 'beginner', ['go'], 'Go'],
    ['Go interview questions: goroutines and channels', 'intermediate', ['go'], 'Go'],
    ['When to use Rust', 'beginner', ['rust'], 'Rust'],
    ['Your first Rust project: a word-count CLI', 'intermediate', ['rust'], 'Rust'],
    ['Rust interview questions: ownership and borrowing', 'advanced', ['rust'], 'Rust'],
    ['When to use Kotlin', 'beginner', ['kotlin'], 'Kotlin'],
    ['Your first Kotlin project: an Android notes app', 'beginner', ['kotlin', 'android'], 'Kotlin'],
    ['Kotlin interview questions: null safety and coroutines', 'intermediate', ['kotlin'], 'Kotlin'],
    ['When to use SQL', 'beginner', ['sql'], 'SQL'],
    ['Your first SQL project: analysing a sales dataset', 'beginner', ['sql'], 'SQL'],
    ['SQL interview questions: window functions and GROUP BY', 'intermediate', ['sql'], 'SQL'],
  ],
  technologies: [
    ['React fundamentals: components, props and state', 'beginner', ['react', 'javascript'], 'Frontend stack'],
    ['React hooks in practice', 'intermediate', ['react'], 'Frontend stack'],
    ['Next.js App Router: routing, layouts and server components', 'intermediate', ['next.js', 'react'], 'Frontend stack'],
    ['Server rendering vs static generation in Next.js', 'intermediate', ['next.js'], 'Frontend stack'],
    ['Node.js and the event loop', 'intermediate', ['node.js', 'javascript'], 'Backend stack'],
    ['Building a REST API with Node.js and Express', 'beginner', ['node.js', 'rest'], 'Backend stack'],
    ['Spring Boot: your first REST service', 'beginner', ['spring boot', 'java'], 'Backend stack'],
    ['Spring Boot with JPA and a relational database', 'intermediate', ['spring boot', 'sql'], 'Backend stack'],
    ['Docker for application developers: images, volumes and Compose', 'beginner', ['docker'], 'Shipping to production'],
    ['Deploying an app to Kubernetes: deployments, services and ingress', 'intermediate', ['kubernetes'], 'Shipping to production'],
    ['AWS essentials: EC2, S3, Lambda and IAM', 'beginner', ['aws', 'cloud'], 'Cloud platforms'],
    ['Azure essentials: App Service, Blob Storage and Entra ID', 'beginner', ['azure', 'cloud'], 'Cloud platforms'],
    ['Google Cloud essentials: Cloud Run, Cloud Storage and BigQuery', 'beginner', ['gcp', 'cloud'], 'Cloud platforms'],
    ['Choosing between AWS, Azure and GCP', 'intermediate', ['aws', 'azure', 'gcp'], 'Cloud platforms'],
    ['How large language models work, for developers', 'intermediate', ['llm'], 'Building with LLMs'],
    ['Building an LLM app with retrieval end to end', 'advanced', ['llm', 'rag'], 'Building with LLMs'],
    ['Function calling and tool-using AI agents', 'intermediate', ['llm', 'agents'], 'Building with LLMs'],
    ['Data engineering fundamentals: ETL, ELT and pipelines', 'beginner', ['data engineering'], 'Data engineering'],
    ['Batch vs stream processing with Spark and Kafka', 'intermediate', ['data engineering', 'kafka', 'spark'], 'Data engineering'],
    ['Data warehouses and lakehouses', 'intermediate', ['data engineering', 'sql'], 'Data engineering'],
  ],
  'competitions-careers': [
    ['Why join hackathons as a student', 'beginner', ['hackathon'], 'Hackathons'],
    ['Hackathon vs codeathon vs CTF: which one to join', 'beginner', ['hackathon', 'ctf'], 'Hackathons'],
    ['Building a hackathon team', 'beginner', ['hackathon'], 'Hackathons'],
    ['How to win a hackathon', 'intermediate', ['hackathon'], 'Hackathons'],
    ['Pitching and demoing your hackathon project', 'beginner', ['hackathon'], 'Hackathons'],
    ['Turning a hackathon project into a portfolio piece', 'beginner', ['hackathon', 'portfolio'], 'Hackathons'],
    ['What a datathon is and how to prepare', 'beginner', ['datathon', 'data science']],
    ['Ideathons: pitching an idea without writing code', 'beginner', ['ideathon']],
    ['Competitive programming contests: getting started', 'beginner', ['competitive programming']],
    ['CTF basics: categories, tools and your first flag', 'beginner', ['ctf', 'security'], 'Capture the flag'],
    ['Web exploitation challenges in CTFs', 'intermediate', ['ctf', 'security'], 'Capture the flag'],
    ['Open-source sprints and your first contribution', 'beginner', ['open source', 'git'], 'Open source'],
    ['Google Summer of Code and other open-source programmes', 'beginner', ['open source'], 'Open source'],
    ['How company exams like TCS NQT work', 'beginner', ['aptitude', 'campus hiring'], 'Campus hiring'],
    ['Preparing for aptitude and logical reasoning tests', 'beginner', ['aptitude'], 'Campus hiring'],
    ['Online coding assessments in campus placements', 'intermediate', ['campus hiring', 'coding test'], 'Campus hiring'],
    ['Landing your first internship', 'beginner', ['internship']],
    ['Off-campus job hunting for freshers', 'beginner', ['job search']],
    ['Building a project portfolio that gets interviews', 'beginner', ['portfolio']],
  ],
}

const STOPWORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'how', 'what', 'is', 'vs', 'versus', 'it', 'your', 'do', 'done', 'right', 'introduction', 'intro', 'guide', 'basics', 'explained', 'understanding'])

/** Lowercase, strip punctuation/diacritics, collapse spaces. */
export function normalizeTitle(title: string): string {
  return String(title || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.length > 3 && w.endsWith('es') && /(s|x|ch|sh)es$/.test(w)) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

/** Significant, stemmed words of a title. */
export function titleTokens(title: string): Set<string> {
  return new Set(
    normalizeTitle(title)
      .split(' ')
      .filter((w) => w && !STOPWORDS.has(w))
      .map(stem),
  )
}

/** Jaccard similarity of significant title words, 0..1. */
export function titleSimilarity(a: string, b: string): number {
  const A = titleTokens(a)
  const B = titleTokens(b)
  if (!A.size && !B.size) return 1
  let inter = 0
  for (const w of A) if (B.has(w)) inter++
  return inter / (A.size + B.size - inter)
}

export const DUPLICATE_SIMILARITY = 0.75

/** Stable topic key: same normalised words (any order) + category → same hash. */
export function topicHash(title: string, category: string): string {
  const words = [...titleTokens(title)].sort().join(' ')
  return createHash('sha256').update(`${category}|${words}`).digest('hex').slice(0, 32)
}

/** The first existing title that duplicates `title` (exact hash or similar words), or null. */
export function findDuplicateTitle(title: string, existing: readonly string[], threshold = DUPLICATE_SIMILARITY): string | null {
  const n = normalizeTitle(title)
  for (const e of existing) {
    if (normalizeTitle(e) === n || titleSimilarity(title, e) >= threshold) return e
  }
  return null
}

/** URL slug from a title (ASCII, ≤ 80 chars). */
export function slugify(title: string): string {
  return normalizeTitle(title).replace(/\+\+/g, 'pp').replace(/\+/g, ' plus ').replace(/#/g, 'sharp').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80).replace(/^-|-$/g, '') || 'post'
}

/** First free slug: base, base-2, base-3, … */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let i = 2; i < 1000; i++) {
    const s = `${base}-${i}`
    if (!taken.has(s)) return s
  }
  return `${base}-${Date.now().toString(36)}`
}

/** Seed rows → topic docs (without ids/timestamps filled by the store). */
export function seedTopicRows(): Array<Pick<LearnTopicDoc, 'title' | 'category' | 'level' | 'tags' | 'series' | 'series_order' | 'hash' | 'priority'>> {
  const out: Array<Pick<LearnTopicDoc, 'title' | 'category' | 'level' | 'tags' | 'series' | 'series_order' | 'hash' | 'priority'>> = []
  for (const [category, rows] of Object.entries(SEED_TOPICS) as Array<[LearnCategoryId, SeedRow[]]>) {
    const seriesCount = new Map<string, number>()
    for (const [title, level, tags = [], series] of rows) {
      const order = series ? (seriesCount.get(series) ?? 0) + 1 : null
      if (series) seriesCount.set(series, order!)
      out.push({ title, category, level, tags, series: series ?? null, series_order: order, hash: topicHash(title, category), priority: 0 })
    }
  }
  return out
}

/**
 * Seed rows not in the database yet (pure). A row is skipped when its hash is
 * already stored, or when its title duplicates a stored topic in ANY category
 * (e.g. a new "Docker" topic vs an admin's existing one) — so new seed
 * categories can be added to a live database without duplicates.
 */
export function missingSeedRows(existing: readonly { hash: string; title: string }[]): ReturnType<typeof seedTopicRows> {
  const hashes = new Set(existing.map((t) => t.hash))
  const titles = existing.map((t) => t.title)
  const out: ReturnType<typeof seedTopicRows> = []
  for (const r of seedTopicRows()) {
    if (hashes.has(r.hash) || findDuplicateTitle(r.title, titles)) continue
    out.push(r)
    titles.push(r.title)
  }
  return out
}

/** What the scheduler needs to know about a topic and the posts already written. */
export type PlannerTopic = Pick<LearnTopicDoc, 'id' | 'title' | 'category' | 'level' | 'enabled' | 'priority' | 'generated_count' | 'series' | 'series_order'> & {
  generating_until?: string | null
}
export type PlannerPost = { topic_id?: string | null; title: string; status: string }

/**
 * Pick the next `n` topics to write:
 *  - only enabled topics that are not being generated right now;
 *  - skip topics that already have a live post (any status but rejected), and
 *    topics whose title duplicates an existing post title;
 *  - order by priority (desc), then fewest generations, then level
 *    (beginner first), then series order;
 *  - round-robin across categories so one day's posts cover different areas.
 */
export function pickNextTopics(topics: readonly PlannerTopic[], posts: readonly PlannerPost[], n: number, now: Date = new Date()): PlannerTopic[] {
  if (n <= 0) return []
  const covered = new Set(posts.filter((p) => p.status !== 'rejected' && p.topic_id).map((p) => p.topic_id as string))
  const liveTitles = posts.filter((p) => p.status !== 'rejected').map((p) => p.title)
  const nowIso = now.toISOString()
  const levelRank = (l: string) => Math.max(0, LEARN_LEVELS.indexOf(l as LearnLevel))
  const candidates = topics
    .filter((t) => t.enabled && !covered.has(t.id) && !(t.generating_until && t.generating_until > nowIso))
    .filter((t) => !findDuplicateTitle(t.title, liveTitles))
    .sort((a, b) =>
      (b.priority || 0) - (a.priority || 0) ||
      (a.generated_count || 0) - (b.generated_count || 0) ||
      levelRank(a.level) - levelRank(b.level) ||
      (a.series_order ?? 999) - (b.series_order ?? 999) ||
      a.title.localeCompare(b.title),
    )
  // Group by category keeping order; then take round-robin.
  const byCat = new Map<string, PlannerTopic[]>()
  for (const t of candidates) {
    const list = byCat.get(t.category) ?? []
    list.push(t)
    byCat.set(t.category, list)
  }
  // Category order: the category of the best candidate first.
  const cats = [...byCat.keys()]
  const picked: PlannerTopic[] = []
  while (picked.length < n && cats.some((c) => (byCat.get(c)?.length ?? 0) > 0)) {
    for (const c of cats) {
      const next = byCat.get(c)?.shift()
      if (next) picked.push(next)
      if (picked.length >= n) break
    }
  }
  return picked
}
