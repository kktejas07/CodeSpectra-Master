import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { publicCourse } from '@/app/api/user/courses/_lib/course-rules'

// Every course has its own unique, purpose-built thumbnail and full curriculum structure
const SEED_COURSES = [
  {
    id: 'cpp-dsa',
    title: 'C++ DSA',
    description: 'A complete, structured journey to master Data Structures & Algorithms in C++. From arrays to graphs, with LeetCode-style problem sets at every step.',
    type: 'video', instructor: 'CodeSpectra', level: 'intermediate',
    rating: 4.5, sessions: 13, category: 'CPP',
    tags: ['CPP', 'DSA', 'Coding'],
    image: '/courses/cpp.jpg',
    whatYoullLearn: [
      'Master arrays, linked lists, trees, graphs from scratch',
      'Solve 100+ LeetCode problems with C++ patterns',
      'Understand time & space complexity deeply',
      'Dynamic programming and greedy techniques',
      'Graph algorithms: BFS, DFS, Dijkstra, Floyd-Warshall',
      'Preparation for FAANG coding interviews'
    ],
    sections: [
      {
        title: 'Introduction to C++ & Complexity',
        slug: 'intro',
        lessons: [
          { id: 'l1', title: 'C++ Setup & Hello World', slug: 'setup', free: true, duration: 720, url: 'https://www.youtube.com/embed/vLnPwxZdW4Y' },
          { id: 'l2', title: 'Variables, Data Types & I/O', slug: 'vars', duration: 900, url: 'https://www.youtube.com/embed/vLnPwxZdW4Y' },
          { id: 'l3', title: 'Time & Space Complexity', slug: 'complexity', duration: 1200, url: 'https://www.youtube.com/embed/vLnPwxZdW4Y' },
        ]
      },
      {
        title: 'Arrays & Strings',
        slug: 'arrays',
        lessons: [
          { id: 'l4', title: 'Array Fundamentals', slug: 'array-basics', free: true, duration: 1500, url: 'https://www.youtube.com/embed/vLnPwxZdW4Y' },
          { id: 'l5', title: 'Two Pointers Pattern', slug: 'two-pointers', duration: 1800, url: 'https://www.youtube.com/embed/vLnPwxZdW4Y' },
          { id: 'l6', title: 'Sliding Window', slug: 'sliding-window', duration: 1800, url: 'https://www.youtube.com/embed/vLnPwxZdW4Y' },
          { id: 'l7', title: 'String Manipulation', slug: 'strings', duration: 1200, url: 'https://www.youtube.com/embed/vLnPwxZdW4Y' },
        ]
      },
      {
        title: 'Linked Lists & Stacks',
        slug: 'linked-lists',
        lessons: [
          { id: 'l8', title: 'Singly & Doubly Linked List', slug: 'll-basics', duration: 2100, url: 'https://www.youtube.com/embed/vLnPwxZdW4Y' },
          { id: 'l9', title: 'Fast & Slow Pointers', slug: 'll-pointers', duration: 1500, url: 'https://www.youtube.com/embed/vLnPwxZdW4Y' },
          { id: 'l10', title: 'Stack & Monotonic Stack', slug: 'stacks', duration: 1800, url: 'https://www.youtube.com/embed/vLnPwxZdW4Y' },
        ]
      },
      {
        title: 'Trees & Graphs',
        slug: 'trees-graphs',
        lessons: [
          { id: 'l11', title: 'Binary Trees & BST', slug: 'bst', duration: 2400, url: 'https://www.youtube.com/embed/vLnPwxZdW4Y' },
          { id: 'l12', title: 'Tree Traversals (BFS/DFS)', slug: 'traversals', duration: 1800, url: 'https://www.youtube.com/embed/vLnPwxZdW4Y' },
          { id: 'l13', title: 'Graph Algorithms', slug: 'graphs', duration: 3000, url: 'https://www.youtube.com/embed/vLnPwxZdW4Y' },
        ]
      }
    ]
  },
  {
    id: 'os-mastery',
    title: 'Operating System (OS)',
    description: 'Build strong foundations in OS concepts: processes, threads, scheduling, memory management, and file systems.',
    type: 'video', instructor: 'CodeSpectra', level: 'beginner',
    rating: 4.5, sessions: 6, category: 'Software Tools',
    tags: ['Software Tools', 'OS'],
    image: '/courses/os.jpg',
    whatYoullLearn: [],
    sections: []
  },
  {
    id: 'web-dev',
    title: 'Full Stack Web Development',
    description: 'Master frontend and backend web development from scratch. React, Node.js, MongoDB, REST APIs, and deployment.',
    type: 'video', instructor: 'CodeSpectra', level: 'beginner',
    rating: 4.8, sessions: 24, category: 'Full Stack Web dev',
    tags: ['Full Stack Web dev', 'React', 'Node.js', 'Web Dev'],
    image: '/courses/web.jpg',
    whatYoullLearn: [
      'Build responsive UIs with HTML5, CSS3, and JavaScript',
      'Master React: hooks, context, server components',
      'Node.js + Express REST API development',
      'MongoDB & Mongoose for database operations',
      'Authentication with JWT & OAuth',
      'Deploy full-stack apps to Vercel & Railway'
    ],
    sections: [
      {
        title: 'HTML & CSS Foundations',
        slug: 'html-css',
        lessons: [
          { id: 'l1', title: 'HTML5 Semantic Elements', slug: 'html5', free: true, duration: 900, url: 'https://www.youtube.com/embed/pQN-pnXPaVg' },
          { id: 'l2', title: 'CSS Flexbox & Grid', slug: 'css-layout', free: true, duration: 1200, url: 'https://www.youtube.com/embed/pQN-pnXPaVg' },
          { id: 'l3', title: 'Responsive Design', slug: 'responsive', duration: 1500, url: 'https://www.youtube.com/embed/pQN-pnXPaVg' },
        ]
      },
      {
        title: 'JavaScript & React',
        slug: 'js-react',
        lessons: [
          { id: 'l4', title: 'ES6+ Modern JavaScript', slug: 'es6', duration: 2100, url: 'https://www.youtube.com/embed/pQN-pnXPaVg' },
          { id: 'l5', title: 'React Fundamentals', slug: 'react-basics', duration: 1800, url: 'https://www.youtube.com/embed/pQN-pnXPaVg' },
          { id: 'l6', title: 'React Hooks Deep Dive', slug: 'hooks', duration: 2400, url: 'https://www.youtube.com/embed/pQN-pnXPaVg' },
        ]
      },
      {
        title: 'Backend with Node.js',
        slug: 'backend',
        lessons: [
          { id: 'l7', title: 'Node.js & Express Setup', slug: 'node', duration: 1800, url: 'https://www.youtube.com/embed/pQN-pnXPaVg' },
          { id: 'l8', title: 'REST API Design', slug: 'rest-api', duration: 2100, url: 'https://www.youtube.com/embed/pQN-pnXPaVg' },
          { id: 'l9', title: 'MongoDB & Mongoose', slug: 'mongodb', duration: 2400, url: 'https://www.youtube.com/embed/pQN-pnXPaVg' },
          { id: 'l10', title: 'JWT Authentication', slug: 'jwt', duration: 1800, url: 'https://www.youtube.com/embed/pQN-pnXPaVg' },
        ]
      }
    ]
  },
  {
    id: 'python-ai',
    title: 'Python for AI & ML',
    description: 'Learn Python programming specifically tailored for Artificial Intelligence and Machine Learning. NumPy, Pandas, Scikit-learn, and TensorFlow.',
    type: 'video', instructor: 'CodeSpectra', level: 'intermediate',
    rating: 4.9, sessions: 18, category: 'Coding',
    tags: ['Coding', 'Python', 'AI', 'ML', 'Machine Learning'],
    image: '/courses/python.jpg',
    whatYoullLearn: [
      'Python syntax, functions, and OOP concepts',
      'NumPy, Pandas for data manipulation',
      'Scikit-learn ML algorithms: regression, classification, clustering',
      'Neural networks with TensorFlow & Keras',
      'Data visualization with Matplotlib & Seaborn',
      'Build real AI projects: image classifier, NLP model'
    ],
    sections: [
      {
        title: 'Python for Data Science',
        slug: 'python-basics',
        lessons: [
          { id: 'l1', title: 'Python Fundamentals', slug: 'python', free: true, duration: 1200, url: 'https://www.youtube.com/embed/rfscVS0vtbw' },
          { id: 'l2', title: 'NumPy Arrays & Operations', slug: 'numpy', duration: 1500, url: 'https://www.youtube.com/embed/rfscVS0vtbw' },
          { id: 'l3', title: 'Pandas DataFrames', slug: 'pandas', duration: 1800, url: 'https://www.youtube.com/embed/rfscVS0vtbw' },
        ]
      },
      {
        title: 'Machine Learning',
        slug: 'ml',
        lessons: [
          { id: 'l4', title: 'Linear & Logistic Regression', slug: 'regression', duration: 2400, url: 'https://www.youtube.com/embed/rfscVS0vtbw' },
          { id: 'l5', title: 'Decision Trees & Random Forest', slug: 'trees', duration: 2100, url: 'https://www.youtube.com/embed/rfscVS0vtbw' },
          { id: 'l6', title: 'Neural Networks from Scratch', slug: 'nn', duration: 3000, url: 'https://www.youtube.com/embed/rfscVS0vtbw' },
        ]
      }
    ]
  },
  {
    id: 'system-design',
    title: 'System Design Interview',
    description: 'A comprehensive guide to cracking system design interviews at top tech companies. Scalability, caching, databases, microservices.',
    type: 'text', instructor: 'CodeSpectra', level: 'advanced',
    rating: 4.7, sessions: 10, category: 'Management',
    tags: ['Management', 'System Design', 'Architecture'],
    image: '/courses/system.jpg',
    whatYoullLearn: [],
    sections: []
  },
  // ponytail: no seed `java-fundamentals` — generated catalog course `java-beginner`
  // is also titled "Java Fundamentals"; seeding both caused a duplicate card.
  {
    id: 'react-deep-dive',
    title: 'React: Hooks & Server Components',
    description: 'Modern React patterns with Server Components, Suspense, concurrent rendering, and performance optimization.',
    type: 'video', instructor: 'CodeSpectra', level: 'advanced',
    rating: 4.9, sessions: 16, category: 'Full Stack Web dev',
    tags: ['Full Stack Web dev', 'React', 'JavaScript'],
    image: '/courses/react.jpg',
    whatYoullLearn: [],
    sections: []
  },
  {
    id: 'sql-practice',
    title: 'SQL for Data Engineers',
    description: 'Joins, window functions, CTEs, query optimization, and real-world data engineering problems.',
    type: 'text', instructor: 'CodeSpectra', level: 'beginner',
    rating: 4.5, sessions: 12, category: 'General Aptitude',
    tags: ['General Aptitude', 'SQL', 'Databases'],
    image: '/courses/sql.jpg',
    whatYoullLearn: [],
    sections: []
  },
  {
    id: 'javascript-mastery',
    title: 'JavaScript Interview Mastery',
    description: 'Closures, event loop, async patterns, prototypes, and the most common JavaScript interview questions at FAANG.',
    type: 'video', instructor: 'CodeSpectra', level: 'intermediate',
    rating: 4.7, sessions: 14, category: 'Coding',
    tags: ['Coding', 'JavaScript', 'Web Dev'],
    image: '/courses/javascript.jpg',
    whatYoullLearn: [],
    sections: []
  },
  {
    id: 'c-programming',
    title: 'C Programming Masterclass',
    description: 'Foundation C programming: pointers, memory management, structs, file I/O, and low-level systems programming.',
    type: 'video', instructor: 'CodeSpectra', level: 'beginner',
    rating: 4.4, sessions: 15, category: 'C',
    tags: ['C'],
    image: '/courses/c.jpg',
    whatYoullLearn: [],
    sections: []
  },
  {
    id: 'devops-essentials',
    title: 'DevOps & Cloud Essentials',
    description: 'Docker, Kubernetes, CI/CD pipelines, AWS fundamentals, and infrastructure as code with Terraform.',
    type: 'video', instructor: 'CodeSpectra', level: 'intermediate',
    rating: 4.6, sessions: 22, category: 'Software Tools',
    tags: ['Software Tools', 'DevOps', 'Docker', 'AWS', 'Kubernetes'],
    image: '/courses/devops.jpg',
    whatYoullLearn: [],
    sections: []
  },
  {
    id: 'git-mastery',
    title: 'Git & GitHub Mastery',
    description: 'Branching strategies, rebasing, cherry-picking, GitHub Actions, and professional team workflows.',
    type: 'video', instructor: 'CodeSpectra', level: 'beginner',
    rating: 4.5, sessions: 8, category: 'Software Tools',
    tags: ['Software Tools', 'Git', 'GitHub'],
    image: '/courses/git.jpg',
    whatYoullLearn: [],
    sections: []
  },
]

/** Prefer generated / content-rich courses when titles collide. */
function courseRichness(c: Record<string, unknown>): number {
  const sections = Array.isArray(c.sections)
    ? c.sections
    : Array.isArray(c.modules)
      ? (c.modules as unknown[])
      : []
  const lessons = sections.reduce((n: number, s: any) => {
    const items = s?.lessons || s?.videos || []
    return n + (Array.isArray(items) ? items.length : 0)
  }, 0)
  const generatedBonus = c.id === 'java-beginner' || c.source === 'generated' || c.techStack ? 1000 : 0
  return generatedBonus + lessons + sections.length * 10 + (Number(c.sessions) || 0)
}

function dedupeCoursesByTitle<T extends { id?: string; title?: string }>(courses: T[]): T[] {
  const best = new Map<string, T>()
  for (const c of courses) {
    const key = (c.title || '').trim().toLowerCase()
    if (!key) {
      best.set(`__id:${c.id || Math.random()}`, c)
      continue
    }
    const prev = best.get(key)
    if (!prev || courseRichness(c as any) > courseRichness(prev as any)) best.set(key, c)
  }
  return [...best.values()]
}

// Seed stubs superseded by generated catalog tracks (same display title).
// Prod still had this doc because every GET re-upserted it from SEED_COURSES.
const OBSOLETE_SEED_IDS = ['java-fundamentals'] as const

export async function GET(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const db = await getMongoDb()
    const col = db.collection('courses')
    const enrollments = db.collection('course_enrollments')

    // Seed catalog only if the database is completely empty
    const courseCount = await col.countDocuments()
    if (courseCount === 0) {
      const now = new Date().toISOString()
      await Promise.all(
        SEED_COURSES.map((c) =>
          col.updateOne(
            { id: c.id },
            { $setOnInsert: { ...c, updated_at: now, created_at: now, enrolled: 0 } },
            { upsert: true }
          )
        )
      )
    }

    const courses = await col.find({}).toArray()
    const unique = dedupeCoursesByTitle(courses as any[])

    // Real enrolled count per course from course_enrollments
    const enriched = await Promise.all(
      unique.map(async (c) => {
        const enrolledCount = await enrollments.countDocuments({ courseId: c.id })
        const sectionCount = Array.isArray(c.sections)
          ? c.sections.length
          : Array.isArray(c.modules)
            ? c.modules.length
            : 0
        return {
          ...publicCourse(c),
          enrolled: enrolledCount || (c.enrolled as number) || 0,
          sessions: Number(c.sessions) || sectionCount || 0,
        }
      }),
    )

    return NextResponse.json({ data: enriched })
  } catch (e) {
    console.error('[courses]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}
