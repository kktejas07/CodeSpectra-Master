/**
 * Certifications data model + repository helpers.
 *
 * Open-source certification modules — questions are sourced from
 * permissively-licensed catalogs (FreeCodeCamp, MDN, exercism) curated in
 * `OPEN_SOURCE_MODULES`. Catalog entries are idempotently seeded on first
 * read so the UI always has something to render even on a fresh DB.
 *
 * Collections:
 *   - certifications       : catalog (one row per certificate)
 *   - certification_attempts : per-user attempts with score + verify token
 *
 * IDs are UUIDv4 strings. Verify tokens are 32-char base64url. Timestamps
 * are ISO-8601 strings so the API can ship them straight to JSON.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

const newId = (): string => randomUUID()
const nowIso = (): string => new Date().toISOString()
const newToken = (): string =>
  randomBytes(24).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export type CertLevel = 'Basic' | 'Intermediate' | 'Advanced'

export interface CertQuestion {
  id: string
  prompt: string
  choices: string[]
  /** index into `choices`. */
  answer: number
}

export interface CertificationDoc {
  id: string
  slug: string
  title: string
  level: CertLevel
  category: 'skill' | 'role'
  description: string
  icon: string
  /** Total duration (minutes). */
  duration: number
  /** Passing score (percentage). */
  passing_score: number
  /** Source of the open-source question bank (attribution). */
  source: string
  source_url?: string
  /** License of the source content (informational). */
  license: string
  questions: CertQuestion[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CertificationAttemptDoc {
  id: string
  user_id: string
  certification_id: string
  /** base64url token used in the public /cert/verify URL. */
  verify_token: string
  started_at: string
  submitted_at?: string | null
  score: number
  passed: boolean
  /** snapshot of the user (so verify still works if the user is deleted). */
  snapshot: { name?: string; email?: string }
  cert_snapshot: { title: string; level: CertLevel; source: string }
}

async function db() {
  return getMongoDb()
}

export async function certifications(): Promise<Collection<CertificationDoc>> {
  return (await db()).collection<CertificationDoc>('certifications')
}
export async function certificationAttempts(): Promise<Collection<CertificationAttemptDoc>> {
  return (await db()).collection<CertificationAttemptDoc>('certification_attempts')
}

/* -------------------- Open source catalog seed -------------------- */

interface SeedQuestion {
  prompt: string
  choices: string[]
  answer: number
}

interface SeedModule {
  slug: string
  title: string
  level: CertLevel
  category: 'skill' | 'role'
  description: string
  icon: string
  duration: number
  passing_score: number
  source: string
  source_url: string
  license: string
  questions: SeedQuestion[]
}

/**
 * Curated open-source certification modules. Question banks are
 * paraphrased from permissively-licensed material (MDN CC-BY-SA, FCC BSD-3,
 * exercism MIT). Each question has 4 choices and 1 correct answer.
 */
export const OPEN_SOURCE_MODULES: SeedModule[] = [
  {
    slug: 'javascript-basic',
    title: 'JavaScript (Basic)',
    level: 'Basic',
    category: 'skill',
    description: 'JavaScript fundamentals — types, scope, async basics. Open-source bank.',
    icon: 'J',
    duration: 60,
    passing_score: 70,
    source: 'MDN Web Docs',
    source_url: 'https://developer.mozilla.org/',
    license: 'CC-BY-SA 2.5',
    questions: [
      {
        prompt: "What is the result of `typeof null` in JavaScript?",
        choices: ['"null"', '"object"', '"undefined"', '"boolean"'],
        answer: 1,
      },
      {
        prompt: 'Which keyword creates a block-scoped variable?',
        choices: ['var', 'let', 'function', 'global'],
        answer: 1,
      },
      {
        prompt: 'What does `[] + []` evaluate to?',
        choices: ['0', 'null', '""', '"[object Object]"'],
        answer: 2,
      },
      {
        prompt: 'Which is NOT a valid Promise state?',
        choices: ['pending', 'fulfilled', 'rejected', 'paused'],
        answer: 3,
      },
      {
        prompt: 'Which method converts JSON text to an object?',
        choices: ['JSON.stringify', 'JSON.parse', 'JSON.read', 'JSON.toObject'],
        answer: 1,
      },
    ],
  },
  {
    slug: 'python-basic',
    title: 'Python (Basic)',
    level: 'Basic',
    category: 'skill',
    description: 'Python language fundamentals — data types, comprehensions, idioms.',
    icon: 'P',
    duration: 60,
    passing_score: 70,
    source: 'exercism Python track',
    source_url: 'https://github.com/exercism/python',
    license: 'MIT',
    questions: [
      {
        prompt: 'What is the output of `len("hello")`?',
        choices: ['4', '5', '6', 'error'],
        answer: 1,
      },
      {
        prompt: 'Which is an immutable type?',
        choices: ['list', 'dict', 'tuple', 'set'],
        answer: 2,
      },
      {
        prompt: 'What does `list(range(3))` return?',
        choices: ['[1,2,3]', '[0,1,2]', '[0,1,2,3]', 'range(3)'],
        answer: 1,
      },
      {
        prompt: 'Which operator performs integer division?',
        choices: ['/', '//', '%', '**'],
        answer: 1,
      },
      {
        prompt: 'How do you start a list comprehension that squares 1..5?',
        choices: [
          '[x*x for x in range(1,6)]',
          '(x*x for x in 1..5)',
          'list(x*x; 1..5)',
          'map(x*x, range(1,6))',
        ],
        answer: 0,
      },
    ],
  },
  {
    slug: 'sql-basic',
    title: 'SQL (Basic)',
    level: 'Basic',
    category: 'skill',
    description: 'SELECT, JOINs, aggregates, GROUP BY.',
    icon: 'Q',
    duration: 60,
    passing_score: 70,
    source: 'FreeCodeCamp Relational DB',
    source_url: 'https://www.freecodecamp.org/learn/relational-database/',
    license: 'BSD-3-Clause',
    questions: [
      {
        prompt: 'Which clause filters rows AFTER aggregation?',
        choices: ['WHERE', 'HAVING', 'GROUP BY', 'ORDER BY'],
        answer: 1,
      },
      {
        prompt: 'Which JOIN returns only matching rows from both tables?',
        choices: ['LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL OUTER JOIN'],
        answer: 2,
      },
      {
        prompt: 'Which aggregate returns the highest value?',
        choices: ['SUM', 'AVG', 'MAX', 'COUNT'],
        answer: 2,
      },
      {
        prompt: 'Which keyword removes duplicates from a result set?',
        choices: ['UNIQUE', 'DISTINCT', 'GROUP', 'NODUP'],
        answer: 1,
      },
      {
        prompt: 'How do you limit a query to 5 rows in PostgreSQL?',
        choices: ['TOP 5', 'LIMIT 5', 'ROWNUM <= 5', 'FETCH 5'],
        answer: 1,
      },
    ],
  },
  {
    slug: 'react-intermediate',
    title: 'React (Intermediate)',
    level: 'Intermediate',
    category: 'skill',
    description: 'Hooks, context, performance patterns.',
    icon: 'R',
    duration: 90,
    passing_score: 75,
    source: 'React Docs (Meta)',
    source_url: 'https://react.dev/',
    license: 'CC-BY-4.0',
    questions: [
      {
        prompt: 'Which hook memoises an expensive computed value?',
        choices: ['useMemo', 'useCallback', 'useEffect', 'useRef'],
        answer: 0,
      },
      {
        prompt: 'Which hook returns a mutable ref that does not trigger re-renders?',
        choices: ['useState', 'useRef', 'useMemo', 'useReducer'],
        answer: 1,
      },
      {
        prompt: 'What does the dependency array `[]` mean in useEffect?',
        choices: [
          'Runs after every render',
          'Runs once on mount',
          'Never runs',
          'Runs on every prop change',
        ],
        answer: 1,
      },
      {
        prompt: 'Which API provides global state without prop drilling?',
        choices: ['useContext', 'useState', 'useEffect', 'useLayoutEffect'],
        answer: 0,
      },
      {
        prompt: 'Which component prevents unnecessary re-renders by shallow comparing props?',
        choices: ['React.memo', 'React.Fragment', 'React.lazy', 'React.Suspense'],
        answer: 0,
      },
    ],
  },
  {
    slug: 'algorithms-basic',
    title: 'Data Structures & Algorithms (Basic)',
    level: 'Basic',
    category: 'role',
    description: 'Big-O, arrays, linked lists, recursion fundamentals.',
    icon: 'A',
    duration: 90,
    passing_score: 70,
    source: 'OSSU CS curriculum',
    source_url: 'https://github.com/ossu/computer-science',
    license: 'MIT',
    questions: [
      {
        prompt: 'What is the average-case time complexity of binary search?',
        choices: ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'],
        answer: 1,
      },
      {
        prompt: 'A stack follows which ordering?',
        choices: ['FIFO', 'LIFO', 'Random', 'Priority'],
        answer: 1,
      },
      {
        prompt: 'Which sort has worst-case O(n²) but is in-place and stable when implemented carefully?',
        choices: ['Quicksort', 'Mergesort', 'Insertion sort', 'Heapsort'],
        answer: 2,
      },
      {
        prompt: 'Best data structure to detect duplicates in O(n)?',
        choices: ['Array', 'Linked list', 'Hash set', 'Binary tree'],
        answer: 2,
      },
      {
        prompt: 'A balanced BST has height of?',
        choices: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
        answer: 1,
      },
    ],
  },
  {
    slug: 'frontend-developer',
    title: 'Frontend Developer',
    level: 'Intermediate',
    category: 'role',
    description: 'HTML, CSS, accessibility, JavaScript and modern frameworks.',
    icon: 'F',
    duration: 120,
    passing_score: 75,
    source: 'web.dev (Google)',
    source_url: 'https://web.dev/',
    license: 'CC-BY-4.0',
    questions: [
      {
        prompt: 'Which ARIA attribute hides decorative elements from screen readers?',
        choices: ['aria-hidden', 'aria-label', 'role=hidden', 'tabindex=-1'],
        answer: 0,
      },
      {
        prompt: 'Which CSS property creates a flex container?',
        choices: ['display: block', 'display: flex', 'display: grid', 'flex: 1'],
        answer: 1,
      },
      {
        prompt: 'Which HTTP header enables long-term caching on static assets?',
        choices: ['Cache-Control', 'ETag', 'Vary', 'Accept-Encoding'],
        answer: 0,
      },
      {
        prompt: 'Which metric measures the largest content paint?',
        choices: ['FCP', 'LCP', 'CLS', 'TTI'],
        answer: 1,
      },
      {
        prompt: 'Which element should wrap a primary page navigation for semantics?',
        choices: ['<div>', '<nav>', '<aside>', '<section>'],
        answer: 1,
      },
    ],
  },
]

/**
 * Idempotently seed the catalog. Each module is keyed by `slug`. New
 * questions/metadata in code overwrite the DB on every call.
 */
export async function seedCertificationsIfEmpty(): Promise<number> {
  const col = await certifications()
  let upserted = 0
  for (const m of OPEN_SOURCE_MODULES) {
    const now = nowIso()
    const existing = await col.findOne({ slug: m.slug })
    if (existing) continue // do not overwrite — admins can edit in place
    const doc: CertificationDoc = {
      id: newId(),
      slug: m.slug,
      title: m.title,
      level: m.level,
      category: m.category,
      description: m.description,
      icon: m.icon,
      duration: m.duration,
      passing_score: m.passing_score,
      source: m.source,
      source_url: m.source_url,
      license: m.license,
      questions: m.questions.map((q) => ({
        id: newId(),
        prompt: q.prompt,
        choices: q.choices,
        answer: q.answer,
      })),
      is_active: true,
      created_at: now,
      updated_at: now,
    }
    await col.insertOne(doc)
    upserted += 1
  }
  return upserted
}

/* -------------------- Public helpers -------------------- */

export function publicCertView(c: CertificationDoc) {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    level: c.level,
    category: c.category,
    description: c.description,
    icon: c.icon,
    duration: c.duration,
    passing_score: c.passing_score,
    source: c.source,
    source_url: c.source_url,
    license: c.license,
    question_count: c.questions.length,
    is_active: c.is_active,
  }
}

export function attemptQuestionView(c: CertificationDoc) {
  // Strip answers when sending to the client during an attempt.
  return c.questions.map((q) => ({ id: q.id, prompt: q.prompt, choices: q.choices }))
}

export function newAttemptToken(): string {
  return newToken()
}

export function newAttemptId(): string {
  return newId()
}
