export interface InterviewStep {
  step: string
  description: string
  tip: string
}

export interface DifficultyDistribution {
  easy: number
  medium: number
  hard: number
}

export interface SampleQuestion {
  question: string
  difficulty: 'easy' | 'medium' | 'hard'
  category: string
}

export interface CompanyEntry {
  slug: string
  name: string
  logo: string
  industry: string
  founded: number
  headquarters: string
  techStack: string[]
  interviewProcess: InterviewStep[]
  difficultyDistribution: DifficultyDistribution
  sampleQuestions: SampleQuestion[]
  tips: string[]
  salaryRange: string
  glassdoor: number
}

export const COMPANY_CATALOG: CompanyEntry[] = [
  {
    slug: 'google',
    name: 'Google',
    logo: '🔍',
    industry: 'Technology',
    founded: 1998,
    headquarters: 'Mountain View, CA',
    techStack: ['Java', 'C++', 'Python', 'Go', 'TypeScript', 'React', 'Angular', 'gRPC', 'Spanner', 'Bigtable'],
    interviewProcess: [
      {
        step: 'Online Assessment',
        description: 'Coding challenge with 2 problems (arrays, strings, trees). Time: 90 minutes. Medium to Hard difficulty.',
        tip: 'Practice on LeetCode tagged "Google". Focus on optimization — Google cares about time/space complexity.',
      },
      {
        step: 'Phone Screen (45 min)',
        description: '1-2 coding problems with a Google engineer. Data structures and algorithms focus.',
        tip: 'Think out loud. Interviewers evaluate your communication as much as your code.',
      },
      {
        step: 'Onsite Loop (4-5 rounds)',
        description: 'Coding (2 rounds), System Design (1-2 rounds), Googleyness/Leadership (1 round).',
        tip: 'For system design: start with requirements, then high-level design, then deep dive. Google values scalability.',
      },
      {
        step: 'Googleyness & Leadership',
        description: 'Behavioral interview assessing culture fit, handling ambiguity, and leadership potential.',
        tip: 'Use STAR format. Google values "intellectual humility" — admit what you don\'t know.',
      },
    ],
    difficultyDistribution: { easy: 20, medium: 45, hard: 35 },
    sampleQuestions: [
      { question: 'Given a matrix of 0s and 1s, find the largest rectangle containing only 1s.', difficulty: 'hard', category: 'Dynamic Programming' },
      { question: 'Design a URL shortener that handles 1B URLs with 100K reads/sec.', difficulty: 'hard', category: 'System Design' },
      { question: 'Merge k sorted arrays efficiently.', difficulty: 'medium', category: 'Heap / Priority Queue' },
    ],
    tips: [
      'Google interviews test problem-solving depth — don\'t rush to code. Discuss trade-offs first.',
      'Practice system design with real Google products: Gmail, YouTube, Maps.',
      'Googleyness is real — show passion for technology and ability to collaborate on ambiguous problems.',
    ],
    salaryRange: '$120K - $350K+',
    glassdoor: 4.3,
  },
  {
    slug: 'amazon',
    name: 'Amazon',
    logo: '📦',
    industry: 'Technology',
    founded: 1994,
    headquarters: 'Seattle, WA',
    techStack: ['Java', 'Python', 'AWS', 'DynamoDB', 'Lambda', 'React', 'Node.js', 'Kotlin', 'Swift', 'Terraform'],
    interviewProcess: [
      {
        step: 'Online Assessment (OA)',
        description: 'Two coding problems + Work Simulation (simulation of Amazon work environment). 80 minutes.',
        tip: 'The work simulation tests leadership principles in action — prioritize customer impact.',
      },
      {
        step: 'Phone Screen (45-60 min)',
        description: '1-2 coding problems. Focus on arrays, strings, trees, and linked lists.',
        tip: 'Amazon loves edge cases. Always ask: "What about empty input? Single element?"',
      },
      {
        step: 'Loop (5 rounds, virtual or onsite)',
        description: '2 Coding rounds + 2-3 Behavioral (LP-focused) rounds. Each behavioral round maps 2-3 leadership principles.',
        tip: 'Prepare 10+ stories mapped to Amazon\'s 16 Leadership Principles. "Customer Obsession" is #1.',
      },
      {
        step: 'Bar Raiser',
        description: 'One round is a "Bar Raiser" — a trained interviewer who ensures hiring bar stays high.',
        tip: 'Bar raisers look for long-term potential. Show growth mindset and ownership.',
      },
      {
        step: 'Hiring Manager Final',
        description: 'Conversation with the hiring manager about team fit, role scope, and mutual expectations.',
        tip: 'Ask thoughtful questions about the team\'s biggest challenges and roadmap.',
      },
    ],
    difficultyDistribution: { easy: 15, medium: 50, hard: 35 },
    sampleQuestions: [
      { question: 'Design an online bookstore with cart, checkout, and inventory management.', difficulty: 'hard', category: 'System Design' },
      { question: 'Find the shortest path in a binary maze.', difficulty: 'medium', category: 'BFS / Graph' },
      { question: 'LRU Cache implementation with O(1) get and put.', difficulty: 'medium', category: 'Design / Hash Map' },
    ],
    tips: [
      'Amazon\'s Leadership Principles aren\'t optional — they\'re the backbone of every interview round.',
      'Use STAR method (Situation, Task, Action, Result) for every behavioral answer.',
      'Show "Bias for Action" — Amazon values decisions made with 70% info over waiting for 100%.',
    ],
    salaryRange: '$110K - $320K+',
    glassdoor: 3.8,
  },
  {
    slug: 'meta',
    name: 'Meta',
    logo: '👤',
    industry: 'Technology',
    founded: 2004,
    headquarters: 'Menlo Park, CA',
    techStack: ['React', 'React Native', 'Hack', 'PHP', 'Python', 'C++', 'GraphQL', 'PyTorch', 'DynamoDB', 'MySQL'],
    interviewProcess: [
      {
        step: 'Phone Screen (45 min)',
        description: '1 coding problem (Medium/Hard LeetCode level). Focus on arrays, strings, trees, graphs.',
        tip: 'Meta interviews are heavily LeetCode-based. Practice their tagged problems — pattern recognition is key.',
      },
      {
        step: 'Onsite Loop (4-5 rounds)',
        description: 'Coding (2 rounds), System Design (1-2 rounds), Behavioral (1 round).',
        tip: 'For coding: optimize step by step. Brute force → optimized. Meta values clean, modular code.',
      },
      {
        step: 'System Design',
        description: 'Design a large-scale social system (News Feed, Messenger, Instagram). Focus on read-heavy patterns.',
        tip: 'Meta system design emphasizes caching, CDN strategies, and real-time data flow.',
      },
      {
        step: 'Behavioral',
        description: '"Move Fast" culture assessment. Focus on impact, navigating ambiguity, and collaboration.',
        tip: 'Quantify your impact. "I reduced latency by 40%" beats "I worked on performance."',
      },
    ],
    difficultyDistribution: { easy: 15, medium: 50, hard: 35 },
    sampleQuestions: [
      { question: 'Design Facebook\'s News Feed ranking algorithm.', difficulty: 'hard', category: 'System Design' },
      { question: 'Given a string with nested brackets, find the deepest level of nesting.', difficulty: 'medium', category: 'Stack / DFS' },
      { question: 'Serialize and deserialize a binary tree.', difficulty: 'medium', category: 'Tree / BFS' },
    ],
    tips: [
      'Meta heavily tags LeetCode problems — filter by "Facebook" tag for the best practice set.',
      '"Move Fast" doesn\'t mean sloppy — it means decisive action with calculated risk.',
      'System design at Meta is about scale: 3B users, billions of reads per day.',
    ],
    salaryRange: '$120K - $350K+',
    glassdoor: 4.1,
  },
  {
    slug: 'microsoft',
    name: 'Microsoft',
    logo: '🪟',
    industry: 'Technology',
    founded: 1975,
    headquarters: 'Redmond, WA',
    techStack: ['C#', '.NET', 'TypeScript', 'Azure', 'React', 'Python', 'SQL Server', 'PowerShell', 'Blazor', 'MAUI'],
    interviewProcess: [
      {
        step: 'Phone Screen (30-45 min)',
        description: '1-2 coding problems. Focus on arrays, strings, linked lists, and binary trees.',
        tip: 'Microsoft values clean code and clear explanation. Comment your code and discuss approach first.',
      },
      {
        step: 'Onsite Loop (3-5 rounds)',
        description: 'Coding (2-3 rounds), System Design (1 round), Behavioral (1 round). Less pressure than FAANG peers.',
        tip: 'Microsoft interviews are collaborative — they want to see how you work WITH them, not perform for them.',
      },
      {
        step: 'System Design (for L60+)',
        description: 'Design a distributed system (Azure service, Office feature). Focus on availability and consistency.',
        tip: 'Microsoft values "growth mindset" — show willingness to learn and adapt.',
      },
      {
        step: 'As Applicable Round',
        description: 'Could be coding, design, or behavioral depending on team needs. Flexible format.',
        tip: 'This round is team-specific. Research the team\'s products before the interview.',
      },
    ],
    difficultyDistribution: { easy: 25, medium: 45, hard: 30 },
    sampleQuestions: [
      { question: 'Design a real-time collaborative editor like Google Docs.', difficulty: 'hard', category: 'System Design' },
      { question: 'Reverse a linked list in groups of k.', difficulty: 'medium', category: 'Linked List' },
      { question: 'Find the median of two sorted arrays.', difficulty: 'hard', category: 'Binary Search' },
    ],
    tips: [
      'Microsoft\'s culture is "growth mindset" — be curious, admit gaps, show learning velocity.',
      'Know Azure services and how they map to system design patterns.',
      'The interview is less adversarial than other FAANG — be collaborative, not performative.',
    ],
    salaryRange: '$110K - $300K+',
    glassdoor: 4.2,
  },
  {
    slug: 'apple',
    name: 'Apple',
    logo: '🍎',
    industry: 'Technology',
    founded: 1976,
    headquarters: 'Cupertino, CA',
    techStack: ['Swift', 'Objective-C', 'C++', 'Python', 'Metal', 'Core ML', 'React Native', 'JavaScript', 'SwiftUI', 'Combine'],
    interviewProcess: [
      {
        step: 'Phone Screen (30-45 min)',
        description: 'Technical discussion + 1 coding problem. Varies heavily by team.',
        tip: 'Apple teams are highly specialized. Research the specific team\'s work before your call.',
      },
      {
        step: 'Onsite Loop (4-6 rounds)',
        description: 'Coding, System Design, Domain-specific (ML, graphics, OS), Behavioral.',
        tip: 'Apple values deep expertise in your domain. Show mastery, not just breadth.',
      },
      {
        step: 'Domain Deep Dive',
        description: 'Technical rounds specific to the role (iOS, macOS, ML, silicon, etc.).',
        tip: 'Bring a portfolio of past projects. Apple loves seeing what you\'ve BUILT.',
      },
      {
        step: 'Final with Hiring Manager',
        description: 'Culture fit conversation. Apple values privacy, craftsmanship, and attention to detail.',
        tip: 'Show passion for Apple products. "Why Apple?" must have a genuine, specific answer.',
      },
    ],
    difficultyDistribution: { easy: 20, medium: 40, hard: 40 },
    sampleQuestions: [
      { question: 'Design a privacy-preserving photo sharing system.', difficulty: 'hard', category: 'System Design' },
      { question: 'Implement a thread-safe producer-consumer queue.', difficulty: 'medium', category: 'Concurrency' },
      { question: 'Find all valid parentheses combinations for n pairs.', difficulty: 'medium', category: 'Backtracking' },
    ],
    tips: [
      'Apple is secretive — don\'t ask about unreleased products. Focus on your craft.',
      'Each team is a "startup within Apple" — your experience depends on the team.',
      'Privacy and security are non-negotiable. Mention them in system design.',
    ],
    salaryRange: '$130K - $350K+',
    glassdoor: 4.1,
  },
  {
    slug: 'netflix',
    name: 'Netflix',
    logo: '🎬',
    industry: 'Entertainment / Technology',
    founded: 1997,
    headquarters: 'Los Gatos, CA',
    techStack: ['Java', 'Spring Boot', 'React', 'Node.js', 'Python', 'AWS', 'Kafka', 'Cassandra', 'Chaos Monkey', 'Falcor'],
    interviewProcess: [
      {
        step: 'Recruiter Screen',
        description: 'Alignment on role, compensation expectations, and Netflix culture fit.',
        tip: 'Netflix has a unique "keeper test" culture — they hire senior people and pay top of market.',
      },
      {
        step: 'Phone Screen (60 min)',
        description: 'Technical deep dive with a senior engineer. 1-2 problems + architecture discussion.',
        tip: 'Netflix values independent, self-directed engineers. Show you can own a problem end-to-end.',
      },
      {
        step: 'Onsite Loop (4-5 rounds)',
        description: 'Coding (2 rounds), System Design (1-2 rounds), Culture (1 round).',
        tip: 'Netflix system design is about content delivery at global scale — CDN, streaming, encoding.',
      },
      {
        step: 'Culture Fit',
        description: 'Discussion about Netflix\'s "Freedom and Responsibility" culture.',
        tip: 'Netflix values context over control. Show you can make decisions with incomplete information.',
      },
    ],
    difficultyDistribution: { easy: 10, medium: 40, hard: 50 },
    sampleQuestions: [
      { question: 'Design Netflix\'s content recommendation engine.', difficulty: 'hard', category: 'System Design' },
      { question: 'Implement a rate limiter using sliding window algorithm.', difficulty: 'medium', category: 'Algorithms' },
      { question: 'Find the first missing positive integer in an unsorted array.', difficulty: 'medium', category: 'Array / Hash' },
    ],
    tips: [
      'Netflix pays top of market but expects top performance — emphasize your senior-level impact.',
      'The "keeper test": Netflix asks "would you fight to keep this person?" Show exceptional value.',
      'Read Netflix\'s Culture Deck — it\'s real, not PR. Understanding it is table stakes.',
    ],
    salaryRange: '$150K - $400K+',
    glassdoor: 4.0,
  },
  {
    slug: 'uber',
    name: 'Uber',
    logo: '🚗',
    industry: 'Transportation / Technology',
    founded: 2009,
    headquarters: 'San Francisco, CA',
    techStack: ['Go', 'Java', 'Python', 'React', 'Node.js', 'Kafka', 'Cassandra', 'Redis', 'Docker', 'Kubernetes'],
    interviewProcess: [
      {
        step: 'Online Assessment',
        description: '2 coding problems. Medium difficulty. Focus on arrays, strings, and graph traversal.',
        tip: 'Uber\'s OA is practical — problems often mirror real ride-matching scenarios.',
      },
      {
        step: 'Phone Screen (45 min)',
        description: '1 coding problem + technical discussion. Focus on distributed systems.',
        tip: 'Uber values practical system design — think about real-time matching, geospatial data.',
      },
      {
        step: 'Onsite Loop (4-5 rounds)',
        description: 'Coding (2 rounds), System Design (1-2 rounds), Behavioral (1 round).',
        tip: 'For system design: think about real-time geospatial data, surge pricing, ETA calculations.',
      },
      {
        step: 'Behavioral',
        description: 'Focus on "doing the right thing" and operating with ambiguity.',
        tip: 'Uber values builders — show how you shipped products under uncertainty.',
      },
    ],
    difficultyDistribution: { easy: 15, medium: 50, hard: 35 },
    sampleQuestions: [
      { question: 'Design Uber\'s real-time ride matching system.', difficulty: 'hard', category: 'System Design' },
      { question: 'Find the shortest path between two nodes in a weighted graph with real-time traffic.', difficulty: 'hard', category: 'Graph / Dijkstra' },
      { question: 'Implement a concurrent task scheduler with priority queues.', difficulty: 'medium', category: 'Concurrency' },
    ],
    tips: [
      'Uber interviews emphasize practical, real-world problems. Think about their actual business.',
      'Geospatial algorithms (geo hashing, quad trees) come up frequently.',
      'Show you can operate in a fast-paced, ambiguous environment — Uber\'s DNA.',
    ],
    salaryRange: '$130K - $340K+',
    glassdoor: 3.9,
  },
  {
    slug: 'airbnb',
    name: 'Airbnb',
    logo: '🏠',
    industry: 'Travel / Technology',
    founded: 2008,
    headquarters: 'San Francisco, CA',
    techStack: ['Ruby on Rails', 'React', 'TypeScript', 'Java', 'Kotlin', 'Swift', 'Kafka', 'MySQL', 'Elasticsearch', 'AWS'],
    interviewProcess: [
      {
        step: 'Phone Screen (45 min)',
        description: '1 coding problem + behavioral discussion. Focus on arrays, strings, and trees.',
        tip: 'Airbnb values "Belong Anywhere" — show empathy and user-centric thinking.',
      },
      {
        step: 'Onsite Loop (4-5 rounds)',
        description: 'Coding (2 rounds), System Design (1 round), Behavioral (1-2 rounds).',
        tip: 'Airbnb\'s coding problems often involve real booking/search scenarios — be practical.',
      },
      {
        step: 'System Design',
        description: 'Design a booking system, search ranking, or pricing engine.',
        tip: 'Airbnb system design focuses on search relevance, pricing algorithms, and trust/safety.',
      },
      {
        step: 'Host & Guest Experience',
        description: 'Behavioral round focused on community building and user experience.',
        tip: 'Airbnb values "champion the mission" — show genuine passion for travel and community.',
      },
    ],
    difficultyDistribution: { easy: 20, medium: 45, hard: 35 },
    sampleQuestions: [
      { question: 'Design Airbnb\'s search ranking system with filters and pricing.', difficulty: 'hard', category: 'System Design' },
      { question: 'Given a list of bookings, find overlapping date ranges for availability.', difficulty: 'medium', category: 'Sorting / Intervals' },
      { question: 'Implement a flexible pricing engine that adjusts based on demand.', difficulty: 'medium', category: 'Design / OOP' },
    ],
    tips: [
      'Airbnb\'s culture is deeply mission-driven — "Belong Anywhere" isn\'t just a tagline.',
      'Their problems often involve real-world booking scenarios — practice date/time logic.',
      'Show you care about user trust and safety — it\'s core to their platform.',
    ],
    salaryRange: '$130K - $350K+',
    glassdoor: 4.2,
  },
  {
    slug: 'stripe',
    name: 'Stripe',
    logo: '💳',
    industry: 'Fintech',
    founded: 2010,
    headquarters: 'San Francisco, CA',
    techStack: ['Ruby', 'Java', 'Go', 'React', 'TypeScript', 'PostgreSQL', 'Kafka', 'Redis', 'AWS', 'Terraform'],
    interviewProcess: [
      {
        step: 'Phone Screen (45 min)',
        description: '1 coding problem. Usually involves APIs, data processing, or financial calculations.',
        tip: 'Stripe values API design skills — their core product IS an API. Practice REST design.',
      },
      {
        step: 'Onsite Loop (4-5 rounds)',
        description: 'Coding (2-3 rounds), System Design (1 round), Product sense (1 round).',
        tip: 'Stripe problems often involve money, payments, or financial data — think in transactions.',
      },
      {
        step: 'System Design',
        description: 'Design a payment processing system, fraud detection, or billing platform.',
        tip: 'Stripe system design is about correctness, idempotency, and handling failures gracefully.',
      },
      {
        step: 'Product Sense',
        description: 'Discussion about how to improve Stripe\'s developer experience or product.',
        tip: 'Stripe obsesses over developer experience. Have opinions on their API design.',
      },
    ],
    difficultyDistribution: { easy: 15, medium: 40, hard: 45 },
    sampleQuestions: [
      { question: 'Design a payment processing system that handles 1M transactions/day.', difficulty: 'hard', category: 'System Design' },
      { question: 'Implement a fraud detection system that flags suspicious transactions in real-time.', difficulty: 'hard', category: 'Algorithms / ML' },
      { question: 'Design an idempotent API for creating invoices.', difficulty: 'medium', category: 'API Design' },
    ],
    tips: [
      'Stripe interviews are rigorous — they test both coding ability and product thinking.',
      'Understand distributed transactions, idempotency, and exactly-once processing.',
      'Show you care about developer experience — Stripe\'s north star metric.',
    ],
    salaryRange: '$140K - $380K+',
    glassdoor: 4.4,
  },
  {
    slug: 'spotify',
    name: 'Spotify',
    logo: '🎵',
    industry: 'Music / Technology',
    founded: 2006,
    headquarters: 'Stockholm, Sweden',
    techStack: ['Java', 'Python', 'React', 'TypeScript', 'GCP', 'BigQuery', 'Kafka', 'Cassandra', 'Kubernetes', 'gRPC'],
    interviewProcess: [
      {
        step: 'Phone Screen (45 min)',
        description: '1 coding problem + technical discussion. Focus on data structures and algorithms.',
        tip: 'Spotify values "agile at scale" — show you can work in squads with autonomy.',
      },
      {
        step: 'Onsite Loop (4-5 rounds)',
        description: 'Coding (2 rounds), System Design (1-2 rounds), Behavioral (1 round).',
        tip: 'Spotify\'s interview is less adversarial — they want to see if you\'d enjoy working together.',
      },
      {
        step: 'System Design',
        description: 'Design music streaming infrastructure, recommendation engine, or podcast platform.',
        tip: 'Spotify system design often involves ML pipelines, audio streaming, and personalization.',
      },
      {
        step: 'Squad Fit',
        description: 'Meeting with the team you\'d join. Casual technical discussion and culture fit.',
        tip: 'Research the squad\'s mission. Spotify squads are autonomous — show you can self-organize.',
      },
    ],
    difficultyDistribution: { easy: 25, medium: 45, hard: 30 },
    sampleQuestions: [
      { question: 'Design Spotify\'s "Discover Weekly" recommendation system.', difficulty: 'hard', category: 'System Design' },
      { question: 'Implement a music playlist shuffle that guarantees no repeats until all songs played.', difficulty: 'medium', category: 'Randomized / Fisher-Yates' },
      { question: 'Find the top-k most played songs in the last 24 hours.', difficulty: 'medium', category: 'Heap / Streaming' },
    ],
    tips: [
      'Spotify values autonomy and experimentation — show you can drive initiatives independently.',
      'Their "squad" model means small, cross-functional teams. Show you thrive in that structure.',
      'Music/audio domain knowledge is a plus — understand streaming, encoding, and recommendation.',
    ],
    salaryRange: '$110K - $300K+',
    glassdoor: 4.1,
  },
]

export function getCompanyBySlug(slug: string): CompanyEntry | undefined {
  return COMPANY_CATALOG.find(c => c.slug === slug)
}

export function getAllSlugs(): string[] {
  return COMPANY_CATALOG.map(c => c.slug)
}

export function searchCompanies(query: string, industry?: string): CompanyEntry[] {
  const q = query.toLowerCase()
  return COMPANY_CATALOG.filter(c => {
    const matchesQuery = !q || c.name.toLowerCase().includes(q) || c.techStack.some(t => t.toLowerCase().includes(q))
    const matchesIndustry = !industry || c.industry === industry
    return matchesQuery && matchesIndustry
  })
}

export function getIndustries(): string[] {
  return [...new Set(COMPANY_CATALOG.map(c => c.industry))]
}
