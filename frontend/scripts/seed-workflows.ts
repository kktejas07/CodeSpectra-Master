import { getMongoDb } from '../lib/mongodb'

function id(): string { return crypto.randomUUID() }
function now(): string { return new Date().toISOString() }

const WORKFLOWS = [
  {
    id: id(),
    name: 'Welcome New User',
    description: 'Sends a welcome email, creates a notification, and logs activity when a new user signs up.',
    trigger: 'webhook' as const,
    is_active: true,
    nodes: [
      { id: 't1', type: 'trigger.webhook', label: 'User Signup', config: { event: 'user.created' } },
      { id: 'n1', type: 'http.request', label: 'Send Welcome Email', config: { url: '/api/email/welcome', method: 'POST', body: { template: 'welcome' } } },
      { id: 'n2', type: 'mongo.find', label: 'Create Notification', config: { collection: 'notifications', filter: { type: 'welcome' } } },
      { id: 'n3', type: 'log', label: 'Log Activity', config: { message: 'New user welcome workflow completed' } },
    ],
    edges: [
      { from: 't1', to: 'n1' },
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
    ],
  },
  {
    id: id(),
    name: 'Daily Digest',
    description: 'Queries recent activity, generates a digest, and emails all users every morning at 9 AM.',
    trigger: 'schedule' as const,
    cron_expression: '0 9 * * *',
    is_active: true,
    nodes: [
      { id: 't1', type: 'trigger.schedule', label: 'Daily 9 AM', config: { cron: '0 9 * * *' } },
      { id: 'n1', type: 'mongo.find', label: 'Query Recent Activity', config: { collection: 'submissions', filter: { created_at: { $gte: '{{ yesterday }}' } }, limit: 50 } },
      { id: 'n2', type: 'ai.complete', label: 'Generate Digest', config: { system: 'You are a helpful assistant that summarizes daily coding activity.', prompt: 'Summarize the following activity into a concise daily digest.' } },
      { id: 'n3', type: 'http.request', label: 'Send Digest Email', config: { url: '/api/email/digest', method: 'POST', body: { subject: 'Your Daily CodeSpectra Digest' } } },
    ],
    edges: [
      { from: 't1', to: 'n1' },
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
    ],
  },
  {
    id: id(),
    name: 'Exam Completion Handler',
    description: 'Checks exam score, issues certificate on pass, awards XP, and sends congratulations email.',
    trigger: 'webhook' as const,
    is_active: true,
    nodes: [
      { id: 't1', type: 'trigger.webhook', label: 'Exam Submitted', config: { event: 'exam.submitted' } },
      { id: 'n1', type: 'ai.complete', label: 'Check Score', config: { system: 'You are an exam grading assistant.', prompt: 'Evaluate the submission and determine if the score meets the passing threshold.' } },
      { id: 'n2', type: 'mongo.find', label: 'Issue Certificate', config: { collection: 'certifications', filter: { exam_id: '{{ exam_id }}' } } },
      { id: 'n3', type: 'log', label: 'Award XP', config: { message: 'Awarding XP for exam completion' } },
      { id: 'n4', type: 'http.request', label: 'Send Congratulations', config: { url: '/api/email/congratulations', method: 'POST', body: { template: 'exam-passed' } } },
    ],
    edges: [
      { from: 't1', to: 'n1' },
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
      { from: 'n3', to: 'n4' },
    ],
  },
  {
    id: id(),
    name: 'Hackathon Auto-Results',
    description: 'Collects submissions, grades them, updates the leaderboard, releases results, and sends notifications.',
    trigger: 'manual' as const,
    is_active: true,
    nodes: [
      { id: 't1', type: 'trigger.manual', label: 'Start' },
      { id: 'n1', type: 'mongo.find', label: 'Collect Submissions', config: { collection: 'hackathon_submissions', filter: { status: 'submitted' } } },
      { id: 'n2', type: 'ai.complete', label: 'Grade Submissions', config: { system: 'You are a hackathon judge.', prompt: 'Grade the following submissions based on code quality, innovation, and completeness.' } },
      { id: 'n3', type: 'http.request', label: 'Update Leaderboard', config: { url: '/api/hackathons/leaderboard/update', method: 'POST' } },
      { id: 'n4', type: 'log', label: 'Release Results', config: { message: 'Hackathon results released' } },
      { id: 'n5', type: 'http.request', label: 'Send Notifications', config: { url: '/api/notifications/broadcast', method: 'POST', body: { template: 'hackathon-results' } } },
    ],
    edges: [
      { from: 't1', to: 'n1' },
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
      { from: 'n3', to: 'n4' },
      { from: 'n4', to: 'n5' },
    ],
  },
  {
    id: id(),
    name: 'Stale Account Cleanup',
    description: 'Finds inactive users over 30 days, sends re-engagement emails, and flags them for review.',
    trigger: 'schedule' as const,
    cron_expression: '0 0 * * 0',
    is_active: true,
    nodes: [
      { id: 't1', type: 'trigger.schedule', label: 'Weekly Sunday Midnight', config: { cron: '0 0 * * 0' } },
      { id: 'n1', type: 'mongo.find', label: 'Query Inactive Users', config: { collection: 'users', filter: { last_login: { $lt: '{{ thirtyDaysAgo }}' } } } },
      { id: 'n2', type: 'http.request', label: 'Send Re-engagement Email', config: { url: '/api/email/reengagement', method: 'POST', body: { template: 'we-miss-you' } } },
      { id: 'n3', type: 'mongo.find', label: 'Flag for Review', config: { collection: 'users', filter: { status: 'inactive' } } },
    ],
    edges: [
      { from: 't1', to: 'n1' },
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
    ],
  },
]

async function seed() {
  const db = await getMongoDb()
  const col = db.collection('workflows')
  const count = await col.countDocuments()
  if (count > 0) {
    console.log(`Workflows collection already has ${count} document(s), skipping seed.`)
    await db.client.close()
    return
  }
  const ts = now()
  const docs = WORKFLOWS.map((w) => ({
    ...w,
    created_by: 'system',
    created_at: ts,
    updated_at: ts,
  }))
  await col.insertMany(docs)
  console.log(`Seeded ${docs.length} default workflows.`)
  await db.client.close()
}

seed().catch((e) => { console.error('Workflow seed failed:', e); process.exit(1) })
