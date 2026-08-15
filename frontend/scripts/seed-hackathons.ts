/**
 * Seed hackathon events with problems, teams, and submissions.
 *
 * Usage: npx tsx scripts/seed-hackathons.ts
 *
 * Creates 4 events in different lifecycle stages (live, open, closed, draft),
 * each with 3–4 problems (stored as problems + linked via tasks), 4–8 teams,
 * and sample submissions.
 */
import { getMongoDb } from '../lib/mongodb'
import type { ProblemDoc } from '../lib/db/problems'
import type { HackathonDoc, HackathonTeamDoc, HackathonSubmissionDoc, HackathonFeatures } from '../lib/db/qr-events'

const DEFAULT_FEATURES: HackathonFeatures = {
  team_formation: true, claims_system: false, demo_video: 'optional', live_url: 'optional',
  code_upload: true, judging_rubrics: false, rubric_criteria: [
    { name: 'Innovation', weight: 25 }, { name: 'Technical Complexity', weight: 25 },
    { name: 'Design/UX', weight: 20 }, { name: 'Impact', weight: 20 }, { name: 'Completeness', weight: 10 },
  ],
  leaderboard_visibility: 'public', project_showcase: true, forum: false,
  proctoring: false, certificates: true, sponsor_tracks: [],
}

const NOW = new Date()
const H = (n: number) => new Date(NOW.getTime() + n * 3_600_000)

function id(): string { return crypto.randomUUID() }

const problemPool: Array<{
  slug: string; title: string; difficulty: 'easy' | 'medium' | 'hard'; topics: string[]
  statement_md: string; input_format: string; output_format: string; constraints: string
  test_cases: Array<{ stdin: string; expected_stdout: string; is_sample: boolean; weight: number }>
}> = [
  {
    slug: 'two-sum', title: 'Two Sum', difficulty: 'easy', topics: ['arrays', 'hash-map'],
    statement_md: `## Two Sum\n\nGiven an array of integers \`nums\` and an integer \`target\`, return indices of the two numbers that add up to \`target\`.\n\n**Example:**\n\`\`\`\nInput: nums = [2,7,11,15], target = 9\nOutput: [0,1]\n\`\`\``,
    input_format: 'First line: n (length). Second line: n integers. Third line: target.',
    output_format: 'Two space-separated integers: the indices.',
    constraints: '2 ≤ n ≤ 10⁴, -10⁹ ≤ nums[i] ≤ 10⁹',
    test_cases: [
      { stdin: '4\n2 7 11 15\n9', expected_stdout: '0 1', is_sample: true, weight: 1 },
      { stdin: '3\n3 2 4\n6', expected_stdout: '1 2', is_sample: false, weight: 1 },
      { stdin: '2\n3 3\n6', expected_stdout: '0 1', is_sample: false, weight: 1 },
    ],
  },
  {
    slug: 'palindrome-check', title: 'Palindrome Check', difficulty: 'easy', topics: ['strings'],
    statement_md: `## Palindrome Check\n\nGiven a string, return \`true\` if it reads the same forward and backward, ignoring case and non-alphanumeric characters.`,
    input_format: 'A single line containing the string.',
    output_format: 'true or false',
    constraints: '1 ≤ len ≤ 10⁵',
    test_cases: [
      { stdin: 'A man, a plan, a canal: Panama', expected_stdout: 'true', is_sample: true, weight: 1 },
      { stdin: 'race a car', expected_stdout: 'false', is_sample: true, weight: 1 },
    ],
  },
  {
    slug: 'reverse-linked-list', title: 'Reverse Linked List', difficulty: 'medium', topics: ['linked-list'],
    statement_md: `## Reverse Linked List\n\nReverse a singly linked list and return the new head.\n\nFollow up: solve iteratively and recursively.`,
    input_format: 'First line: n (number of nodes). Second line: n space-separated values.',
    output_format: 'Space-separated values of the reversed list.',
    constraints: '0 ≤ n ≤ 5000',
    test_cases: [
      { stdin: '5\n1 2 3 4 5', expected_stdout: '5 4 3 2 1', is_sample: true, weight: 1 },
      { stdin: '1\n42', expected_stdout: '42', is_sample: false, weight: 1 },
    ],
  },
  {
    slug: 'merge-intervals', title: 'Merge Intervals', difficulty: 'medium', topics: ['arrays', 'sorting'],
    statement_md: `## Merge Intervals\n\nGiven an array of intervals, merge overlapping intervals and return the result.`,
    input_format: 'First line: n. Next n lines: start end.',
    output_format: 'n lines: merged intervals (start end).',
    constraints: '1 ≤ n ≤ 10⁴',
    test_cases: [
      { stdin: '4\n1 3\n2 6\n8 10\n15 18', expected_stdout: '1 6\n8 10\n15 18', is_sample: true, weight: 1 },
      { stdin: '2\n1 4\n4 5', expected_stdout: '1 5', is_sample: false, weight: 1 },
    ],
  },
  {
    slug: 'lru-cache', title: 'LRU Cache Design', difficulty: 'hard', topics: ['design', 'hash-map'],
    statement_md: `## LRU Cache\n\nDesign a data structure that follows the LRU eviction policy.\n\nImplement \`get(key)\` and \`put(key, value)\` in O(1) average time.`,
    input_format: 'Not applicable — design problem.',
    output_format: 'Execution trace of get/put operations.',
    constraints: '1 ≤ capacity ≤ 3000',
    test_cases: [],
  },
  {
    slug: 'max-subarray', title: 'Maximum Subarray', difficulty: 'medium', topics: ['arrays', 'dp'],
    statement_md: `## Maximum Subarray\n\nFind the contiguous subarray with the largest sum.`,
    input_format: 'First line: n. Second line: n integers.',
    output_format: 'Single integer: maximum subarray sum.',
    constraints: '1 ≤ n ≤ 10⁵',
    test_cases: [
      { stdin: '9\n-2 1 -3 4 -1 2 1 -5 4', expected_stdout: '6', is_sample: true, weight: 1 },
      { stdin: '1\n1', expected_stdout: '1', is_sample: false, weight: 1 },
    ],
  },
]

function pickProblems(n: number) {
  const shuffled = [...problemPool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n).map((p, i) => ({
    problem_slug: p.slug, problem_title: p.title, points: [100, 200, 300, 400][i] || 100,
    difficulty: p.difficulty, required: i < 2, order: i + 1,
  }))
}

const teamNames = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Gamma', 'Harbor']

async function seed() {
  const db = await getMongoDb()
  const problemsCol = db.collection<ProblemDoc>('problems')
  const hackathonsCol = db.collection<HackathonDoc>('hackathons')
  const teamsCol = db.collection<HackathonTeamDoc>('hackathon_teams')
  const subsCol = db.collection<HackathonSubmissionDoc>('hackathon_submissions')

  // 1. Insert all problems
  const problemDocs = problemPool.map((p) => ({
    id: id(), slug: p.slug, title: p.title, difficulty: p.difficulty, topics: p.topics,
    statement_md: p.statement_md, input_format: p.input_format, output_format: p.output_format,
    constraints: p.constraints, test_cases: p.test_cases, created_at: NOW.toISOString(),
    is_published: true,
  } as ProblemDoc))
  await problemsCol.deleteMany({ slug: { $in: problemPool.map(p => p.slug) } })
  await problemsCol.insertMany(problemDocs)
  console.log(`✓ Created ${problemDocs.length} problems`)

  // 2. Create 4 events
  const events: HackathonDoc[] = [
    {
      id: id(), name: 'CodeSprint Summer 2026', slug: 'codesprint-summer-2026',
      description: 'Our flagship summer hackathon. Solve algorithmic challenges across 6 categories and compete for the grand prize.',
      num_teams: 20, max_per_team: 4, timeout_minutes: 180,
      starts_at: H(-0.5).toISOString(), ends_at: H(2.5).toISOString(),
      status: 'live', tasks: pickProblems(4),
      rules: [
        { type: 'general', title: 'Team Formation', description: 'Teams of up to 4 members.' },
        { type: 'scoring', title: 'Scoring', description: 'Each solved problem awards 100–400 points. Penalty: 10 points per wrong attempt.' },
        { type: 'submission', title: 'Submissions', description: 'Unlimited submissions; only the best score counts per problem.' },
      ],
      scoring: { auto_grade: true, points_per_problem: 100, bonus_time: 0, penalty_per_attempt: 10 },
      results_released: false, banner_url: '', color_theme: '#2563eb',
      features: DEFAULT_FEATURES,
      created_by: 'seed', created_at: H(-48).toISOString(), updated_at: H(-1).toISOString(),
    },
    {
      id: id(), name: 'AI & ML Challenge', slug: 'ai-ml-challenge',
      description: 'A hackathon focused on building AI-powered solutions for real-world problems. Bring your ML models!',
      num_teams: 16, max_per_team: 3, timeout_minutes: 240,
      starts_at: H(48).toISOString(), ends_at: H(52).toISOString(),
      status: 'open', tasks: pickProblems(3),
      rules: [
        { type: 'general', title: 'Eligibility', description: 'Open to all registered users.' },
        { type: 'scoring', title: 'Evaluation', description: 'Judged on innovation (40%), implementation (40%), and presentation (20%).' },
      ],
      scoring: { auto_grade: true, points_per_problem: 200, bonus_time: 50, penalty_per_attempt: 5 },
      results_released: false, banner_url: '', color_theme: '#7c3aed',
      features: DEFAULT_FEATURES,
      created_by: 'seed', created_at: H(-24).toISOString(), updated_at: NOW.toISOString(),
    },
    {
      id: id(), name: 'Web3 Hackathon 2026', slug: 'web3-hackathon-2026',
      description: 'Build decentralized applications on Ethereum, Solana, and Polkadot. Smart contract challenges included.',
      num_teams: 12, max_per_team: 3, timeout_minutes: 120,
      starts_at: H(-72).toISOString(), ends_at: H(-68).toISOString(),
      status: 'closed', tasks: pickProblems(4),
      rules: [
        { type: 'general', title: 'Teams', description: 'Up to 3 members per team.' },
        { type: 'conduct', title: 'Code of Conduct', description: 'All submissions must be original work.' },
      ],
      scoring: { auto_grade: true, points_per_problem: 150, bonus_time: 30, penalty_per_attempt: 15 },
      results_released: true, released_at: H(-60).toISOString(), banner_url: '', color_theme: '#f59e0b',
      features: DEFAULT_FEATURES,
      created_by: 'seed', created_at: H(-96).toISOString(), updated_at: H(-70).toISOString(),
    },
    {
      id: id(), name: 'Hack the Ocean', slug: 'hack-the-ocean',
      description: 'A sustainability-focused hackathon. Build tools for ocean conservation, climate monitoring, and eco-education.',
      num_teams: 8, max_per_team: 2, timeout_minutes: 90,
      starts_at: H(120).toISOString(), ends_at: H(122).toISOString(),
      status: 'draft', tasks: pickProblems(2),
      rules: [
        { type: 'general', title: 'Theme', description: 'Must relate to ocean or climate sustainability.' },
        { type: 'submission', title: 'Deliverable', description: 'Working demo + 3-min pitch deck.' },
      ],
      scoring: { auto_grade: true, points_per_problem: 100, bonus_time: 0, penalty_per_attempt: 10 },
      results_released: false, banner_url: '', color_theme: '#0ea5e9',
      features: DEFAULT_FEATURES,
      created_by: 'seed', created_at: NOW.toISOString(), updated_at: NOW.toISOString(),
    },
  ]

  await hackathonsCol.deleteMany({ slug: { $in: events.map(e => e.slug) } })
  await hackathonsCol.insertMany(events)
  console.log(`✓ Created ${events.length} hackathon events`)

  // 3. Create teams for each event
  const allTeams: HackathonTeamDoc[] = []
  for (const event of events) {
    const count = 3 + Math.floor(Math.random() * 5) // 3–7 teams per event
    for (let i = 0; i < count; i++) {
      allTeams.push({
        id: id(), hackathon_id: event.id, name: `${teamNames[i % teamNames.length]} Team`,
        slug: `${event.slug}-${teamNames[i % teamNames.length].toLowerCase()}`,
        qr_token: id().slice(0, 8), members: [
          { user_id: 'seed-user', name: 'Dev User', role: 'captain' },
          { user_id: id().slice(0, 8), name: `Member ${i + 1}`, role: 'member' },
        ],
        xp: Math.floor(Math.random() * 500), level: 1 + Math.floor(Math.random() * 5),
        achievements: [], submissions: Math.floor(Math.random() * 20),
        created_at: H(-Math.random() * 48).toISOString(), updated_at: NOW.toISOString(),
      })
    }
  }
  await teamsCol.deleteMany({ hackathon_id: { $in: events.map(e => e.id) } })
  await teamsCol.insertMany(allTeams)
  console.log(`✓ Created ${allTeams.length} teams across events`)

  // 4. Create submissions for live/open events
  let subCount = 0
  for (const team of allTeams) {
    const event = events.find(e => e.id === team.hackathon_id)
    if (!event || event.status === 'draft') continue
    for (const task of event.tasks) {
      const numSubs = 1 + Math.floor(Math.random() * 3)
      for (let s = 0; s < numSubs; s++) {
      const sub: HackathonSubmissionDoc = {
        id: id(), hackathon_id: event.id, team_id: team.id,
        problem_slug: task.problem_slug,
        code: '// solution submitted by ' + team.name,
        score: Math.random() > 0.3 ? Math.floor(Math.random() * task.points) : null,
        max_score: task.points, status: 'under_review', feedback: s > 0 ? 'Good attempt!' : undefined,
        created_at: NOW.toISOString(),
        submitted_at: NOW.toISOString(),
      }
      subsCol.insertOne(sub).catch(() => null)
        subCount++
      }
    }
  }
  console.log(`✓ Created ~${subCount} submissions`)

  console.log('\n✅ Seeding complete! Events ready:')
  events.forEach(e => console.log(`   [${e.status.toUpperCase()}] ${e.name} — ${e.tasks.length} problems, ${allTeams.filter(t => t.hackathon_id === e.id).length} teams`))
  await db.client.close()
}

seed().catch((e) => { console.error('Seed failed:', e); process.exit(1) })
