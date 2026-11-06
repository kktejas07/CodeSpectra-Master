/**
 * scripts/seed-test-job.ts
 * -------------------------
 * Creates ONE test job designed to exercise the full candidate flow:
 *
 *   Applied → Résumé Screening (AI) → AI Bot Screen (WhatsApp/phone)
 *   → Technical Assessment (exam_id=null, pending until linked)
 *   → Virtual Interview → HR Round → Offer → Hired
 *
 * Usage (from /frontend):
 *   npx tsx scripts/seed-test-job.ts
 *
 * Re-running is safe: skips if the test job already exists.
 * To force a fresh create: npx tsx scripts/seed-test-job.ts --force
 */
import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'
import * as dotenv from 'dotenv'

dotenv.config({ path: '../.env' })

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const DB_NAME = process.env.MONGODB_DB_NAME || 'codespectra'
const TENANT_ID: string | null = process.env.TENANT_ID || null
const FORCE = process.argv.includes('--force')

const TEST_JOB_TITLE = '[TEST] Senior Full Stack Engineer — CodeSpectra Demo'

const pipeline = [
  // Stage 1: Auto-advance, email notification
  {
    id: 's_applied', type: 'applied', name: 'Applied',
    advance: 'auto', on_fail: 'review', notify: { email: true },
  },
  // Stage 2: AI résumé screening — scores against skills/experience/education
  {
    id: 's_screening', type: 'screening', name: 'Résumé Screening',
    advance: 'auto', on_fail: 'review',
    config: { kind: 'screening' },
  },
  // Stage 3: AI bot phone/chat screen — 4 qualifying questions
  {
    id: 's_botscreen', type: 'bot_screen', name: 'AI Phone Screen',
    advance: 'approval', on_fail: 'review', sla_days: 7,
    config: {
      kind: 'bot_screen',
      channels: ['whatsapp_chat', 'whatsapp_call', 'phone_call'],
      language: 'en-IN',
      pass_score: 60,
      max_attempts: 3,
      questions: [
        { id: 'q_notice',   text: 'What is your notice period in days?',               type: 'number'  },
        { id: 'q_relocate', text: 'Are you open to relocating for this role?',          type: 'yes_no'  },
        { id: 'q_salary',   text: 'What is your expected annual CTC (in LPA)?',         type: 'number'  },
        { id: 'q_yoe',      text: 'How many years of full-stack experience do you have?', type: 'number' },
      ],
    },
  },
  // Stage 4: Technical assessment — exam_id=null means "pending exam assignment"
  // Link a real exam from /dashboard/jobs/[id]/pipeline to activate this stage.
  {
    id: 's_assessment', type: 'assessment', name: 'Technical Assessment',
    advance: 'auto', on_fail: 'reject', sla_days: 10,
    notify: { email: true },
    config: { kind: 'assessment', exam_id: null, pass_score: 60, deadline_days: 7 },
  },
  // Stage 5: AI virtual interview (LiveKit)
  {
    id: 's_vint', type: 'virtual_interview', name: 'Virtual Interview',
    advance: 'approval', on_fail: 'review', sla_days: 14,
    notify: { email: true },
    config: {
      kind: 'interview', mode: 'virtual', provider: 'livekit',
      duration_min: 45, panel_ids: [], self_schedule: true, pass_rule: 'majority_yes',
      scorecard: [
        { id: 'sc_tech',   label: 'Technical Depth',  weight: 0.4 },
        { id: 'sc_comm',   label: 'Communication',    weight: 0.3 },
        { id: 'sc_culture', label: 'Culture Fit',     weight: 0.3 },
      ],
    },
  },
  // Stage 6: HR round
  {
    id: 's_hr', type: 'hr_round', name: 'HR Round',
    advance: 'approval', on_fail: 'review', sla_days: 14,
    config: { kind: 'hr_round', questions: [], pass_score: 60 },
  },
  // Stage 7: Offer
  {
    id: 's_offer', type: 'offer', name: 'Offer',
    advance: 'approval', on_fail: 'review',
    notify: { email: true },
    config: { kind: 'offer', template: null },
  },
  // Terminal stages
  { id: 's_hired',    type: 'hired',    name: 'Hired',    advance: 'auto', on_fail: 'review', notify: { email: true } },
  { id: 's_rejected', type: 'rejected', name: 'Rejected', advance: 'auto', on_fail: 'reject', notify: { email: true } },
]

const criteria = {
  min_score: 60,
  weights: { skills: 0.4, experience: 0.3, education: 0.2, culture: 0.1 },
}

async function main() {
  const client = new MongoClient(MONGODB_URI)
  await client.connect()
  console.log('Connected:', MONGODB_URI.replace(/:\/\/.*@/, '://***@'))

  const db = client.db(DB_NAME)
  const col = db.collection('ats_jobs')
  const now = new Date().toISOString()

  // Idempotency
  const existing = await col.findOne({ title: TEST_JOB_TITLE, tenant_id: TENANT_ID }, { projection: { id: 1 } })
  if (existing && !FORCE) {
    console.log(`\n⏭️  Test job already exists (id=${existing.id}). Use --force to recreate it.\n`)
    await client.close()
    return
  }
  if (existing && FORCE) {
    await col.deleteOne({ _id: existing._id })
    console.log('🗑️  Removed old test job.')
  }

  const id = randomUUID()
  const atsDoc = {
    id,
    tenant_id: TENANT_ID,
    title: TEST_JOB_TITLE,
    department: 'Engineering',
    location: 'Remote',
    work_mode: 'remote',
    employment_type: 'full_time',
    experience_min: 3,
    experience_max: 7,
    salary: null,
    openings: 1,
    description: `This is a **test job** for validating the end-to-end CodeSpectra candidate flow.

The pipeline:
1. Apply (public form) → résumé upload optional
2. AI résumé screening — scores your résumé against the role
3. AI bot screen — answers 4 qualifying questions via WhatsApp chat / call
4. Technical assessment — sent by email (activate by linking an exam in the pipeline editor)
5. Virtual interview — self-scheduled video call
6. HR round → Offer → Hired

Feel free to apply with any résumé to test the pipeline.`,
    requirements: '- 3+ years of full-stack experience (React / Node.js / Python)\n- Comfortable with TypeScript\n- Familiar with REST APIs and cloud deployments',
    skills: ['React', 'TypeScript', 'Node.js', 'Python', 'MongoDB', 'REST APIs'],
    status: 'open',
    is_public: true,
    pipeline,
    criteria,
    created_by: 'system-seed',
    created_at: now,
    updated_at: now,
  }
  await col.insertOne(atsDoc)

  // Mirror into job_postings so the public /jobs board shows this job
  const legacyId = randomUUID()
  await db.collection('job_postings').insertOne({
    id: legacyId,
    ats_job_id: id,
    tenant_id: TENANT_ID,
    title: TEST_JOB_TITLE,
    company: 'CodeSpectra',
    location: 'Remote',
    job_type: 'Full-time',
    experience_level: '3–7 years',
    description: atsDoc.description,
    requirements: atsDoc.requirements,
    skills: atsDoc.skills,
    salary: null,
    benefits: null,
    applicants: 0,
    is_active: true,
    created_by: 'system-seed',
    created_at: now,
    updated_at: now,
  })

  console.log(`\n✅  Test job created!`)
  console.log(`    Title : ${TEST_JOB_TITLE}`)
  console.log(`    ID    : ${id}`)
  console.log(`    Tenant: ${TENANT_ID ?? '(platform-level / superadmin)'}`)
  console.log(`\n    Public URL : /jobs/${id}`)
  console.log(`    Legacy ID  : ${legacyId}`)
  console.log(`    Admin URL  : /dashboard/jobs/${id}`)
  console.log(`\n    Pipeline stages:`)
  for (const s of pipeline) {
    console.log(`      ${s.type.padEnd(20)} ${s.name}`)
  }
  console.log()
  await client.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
