/**
 * scripts/seed-ats-jobs.ts
 * -------------------------
 * Inserts 10 diverse demo ATS jobs into the ats_jobs collection.
 *
 * Usage:
 *   # from /frontend
 *   npx tsx scripts/seed-ats-jobs.ts
 *
 * The script reads MONGODB_URI (and MONGODB_DB_NAME) from .env / environment.
 * Jobs are created at tenant_id: null (platform-level / superadmin scope).
 * To scope them to a specific org, set TENANT_ID in the env or change the
 * constant below.
 *
 * Re-running is safe: existing jobs with the same title+tenant are skipped.
 */
import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'
import * as dotenv from 'dotenv'

dotenv.config({ path: '../.env' })

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const DB_NAME = process.env.MONGODB_DB_NAME || 'codespectra'
const TENANT_ID: string | null = process.env.TENANT_ID || null  // null = platform-level

function newId() { return randomUUID() }
function nowIso() { return new Date().toISOString() }

/**
 * Pipeline: applied → résumé screening → AI bot screen → assessment (dynamic) →
 *           virtual interview → HR round → offer → hired / rejected
 *
 * Note: assessment exam_id is null — the stage will be skipped/pending until
 * a recruiter links a real exam, OR if the AI auto-generates one from the
 * candidate's résumé + job title (future: ai_exam_gen flag).
 * For demo purposes the stage is included so the UI shows the full pipeline.
 */
function defaultPipeline() {
  return [
    { id: 's_applied',    type: 'applied',          name: 'Applied',              advance: 'auto',   on_fail: 'review', notify: { email: true } },
    { id: 's_screening',  type: 'screening',         name: 'Résumé Screening',     advance: 'auto',   on_fail: 'review', config: { kind: 'screening' } },
    {
      id: 's_botscreen', type: 'bot_screen', name: 'AI Phone Screen', advance: 'approval', on_fail: 'review', sla_days: 7,
      config: {
        kind: 'bot_screen',
        channels: ['whatsapp_chat', 'whatsapp_call', 'phone_call'],
        language: 'en-IN',
        pass_score: 60,
        max_attempts: 3,
        questions: [
          { id: 'q_notice',   text: 'What is your notice period in days?',           type: 'number' },
          { id: 'q_relocate', text: 'Are you open to relocating for this role?',      type: 'yes_no' },
          { id: 'q_expected', text: 'What is your expected annual salary (in LPA)?',  type: 'number' },
          { id: 'q_exp',      text: 'How many years of relevant experience do you have?', type: 'number' },
        ],
      },
    },
    {
      id: 's_assessment', type: 'assessment', name: 'Technical Assessment', advance: 'auto', on_fail: 'reject', sla_days: 10,
      notify: { email: true },
      config: { kind: 'assessment', exam_id: null, pass_score: 60, deadline_days: 7 },
    },
    { id: 's_vint',      type: 'virtual_interview', name: 'Virtual Interview', advance: 'approval', on_fail: 'review', sla_days: 14, notify: { email: true },
      config: { kind: 'interview', mode: 'virtual', provider: 'livekit', duration_min: 45, panel_ids: [], self_schedule: true, pass_rule: 'majority_yes',
        scorecard: [{ id: 'sc1', label: 'Technical Skills', weight: 0.4 }, { id: 'sc2', label: 'Communication', weight: 0.3 }, { id: 'sc3', label: 'Culture Fit', weight: 0.3 }] } },
    { id: 's_hr',        type: 'hr_round',          name: 'HR Round',          advance: 'approval', on_fail: 'review', sla_days: 14,
      config: { kind: 'hr_round', questions: [], pass_score: 60 } },
    { id: 's_offer',     type: 'offer',             name: 'Offer',             advance: 'approval', on_fail: 'review', notify: { email: true }, config: { kind: 'offer', template: null } },
    { id: 's_hired',     type: 'hired',             name: 'Hired',             advance: 'auto',   on_fail: 'review', notify: { email: true } },
    { id: 's_rejected',  type: 'rejected',          name: 'Rejected',          advance: 'auto',   on_fail: 'reject', notify: { email: true } },
  ]
}

function defaultCriteria() {
  return {
    min_score: 60,
    weights: { skills: 0.4, experience: 0.3, education: 0.2, culture: 0.1 },
  }
}

const SEED_JOBS = [
  {
    title: 'Senior Frontend Engineer',
    department: 'Engineering',
    location: 'Remote',
    work_mode: 'remote',
    employment_type: 'full_time',
    experience_min: 4, experience_max: 8,
    openings: 2,
    description: 'We are looking for a Senior Frontend Engineer to build world-class user experiences at CodeSpectra. You will work on our React/Next.js codebase, collaborate with product and design, and mentor junior engineers.',
    requirements: '- 4+ years of React / Next.js experience\n- Strong TypeScript skills\n- Experience with REST and GraphQL APIs\n- Eye for performance and accessibility',
    skills: ['React', 'TypeScript', 'Next.js', 'TailwindCSS', 'REST APIs'],
  },
  {
    title: 'Backend Engineer — Python',
    department: 'Engineering',
    location: 'Remote',
    work_mode: 'remote',
    employment_type: 'full_time',
    experience_min: 3, experience_max: 7,
    openings: 2,
    description: 'Join our backend team building the FastAPI services that power CodeSpectra\'s AI-driven assessment platform. You\'ll own API design, database modelling, and reliability.',
    requirements: '- 3+ years of Python back-end development\n- Experience with FastAPI or Django\n- Strong knowledge of PostgreSQL / MongoDB\n- Familiarity with Docker and cloud deployments',
    skills: ['Python', 'FastAPI', 'MongoDB', 'PostgreSQL', 'Docker'],
  },
  {
    title: 'Full Stack Engineer',
    department: 'Engineering',
    location: 'Bangalore, India',
    work_mode: 'hybrid',
    employment_type: 'full_time',
    experience_min: 2, experience_max: 6,
    openings: 3,
    description: 'We need a versatile Full Stack Engineer comfortable across our Next.js frontend and Python backend. You will build features end-to-end, from database schema to polished UI.',
    requirements: '- 2+ years of full-stack experience\n- Comfort with React and at least one backend language\n- Understanding of SQL and NoSQL databases',
    skills: ['React', 'Node.js', 'Python', 'TypeScript', 'MongoDB'],
  },
  {
    title: 'Machine Learning Engineer',
    department: 'AI / ML',
    location: 'Remote',
    work_mode: 'remote',
    employment_type: 'full_time',
    experience_min: 3, experience_max: 8,
    openings: 1,
    description: 'Help us build the AI engine behind CodeSpectra\'s automated candidate assessment, resume parsing, and AI interviewing. You will research, train, and deploy ML models at scale.',
    requirements: '- Strong ML fundamentals (NLP, embeddings, transformers)\n- Python, PyTorch or TensorFlow\n- Experience with vector databases (Pinecone, Weaviate, etc.)\n- MLOps and model deployment experience',
    skills: ['Python', 'PyTorch', 'NLP', 'Transformers', 'Vector Databases', 'MLOps'],
  },
  {
    title: 'DevOps / Platform Engineer',
    department: 'Infrastructure',
    location: 'Remote',
    work_mode: 'remote',
    employment_type: 'full_time',
    experience_min: 3, experience_max: 7,
    openings: 1,
    description: "Own our CI/CD pipelines, Kubernetes clusters, and observability stack. You will ensure CodeSpectra's platform is reliable, secure, and cost-efficient.",
    requirements: '- Kubernetes and Helm experience\n- CI/CD (GitHub Actions, Argo)\n- AWS or GCP\n- Monitoring with Prometheus / Grafana',
    skills: ['Kubernetes', 'Docker', 'AWS', 'Terraform', 'GitHub Actions', 'Prometheus'],
  },
  {
    title: 'Product Manager — ATS & Hiring',
    department: 'Product',
    location: 'Remote',
    work_mode: 'remote',
    employment_type: 'full_time',
    experience_min: 3, experience_max: 7,
    openings: 1,
    description: "Drive the roadmap for our Applicant Tracking System and AI-powered hiring features. You will work closely with engineering, design, and customers to ship products recruiters love.",
    requirements: '- 3+ years of B2B SaaS product management\n- Experience with HR tech or ATS products\n- Data-driven decision making\n- Excellent communication and stakeholder management',
    skills: ['Product Strategy', 'Roadmapping', 'User Research', 'Agile', 'HR Tech'],
  },
  {
    title: 'QA Engineer — Automation',
    department: 'Engineering',
    location: 'Remote',
    work_mode: 'remote',
    employment_type: 'full_time',
    experience_min: 2, experience_max: 5,
    openings: 2,
    description: 'Build and maintain our automated test suite covering API, UI, and integration layers. You will champion quality across the engineering org.',
    requirements: '- Experience with Playwright, Cypress, or Selenium\n- API testing (Postman, REST Assured)\n- CI integration\n- Python or JavaScript for test scripting',
    skills: ['Playwright', 'Cypress', 'API Testing', 'TypeScript', 'CI/CD'],
  },
  {
    title: 'Mobile Developer — React Native',
    department: 'Engineering',
    location: 'Remote',
    work_mode: 'remote',
    employment_type: 'full_time',
    experience_min: 2, experience_max: 6,
    openings: 2,
    description: "Build CodeSpectra's candidate-facing mobile app using React Native. You will own features from design handoff to App Store release.",
    requirements: '- 2+ years of React Native\n- Experience publishing to App Store and Google Play\n- State management (Redux, Zustand)\n- REST API integration',
    skills: ['React Native', 'TypeScript', 'iOS', 'Android', 'Redux'],
  },
  {
    title: 'Security Engineer',
    department: 'Security',
    location: 'Remote',
    work_mode: 'remote',
    employment_type: 'full_time',
    experience_min: 4, experience_max: 9,
    openings: 1,
    description: "Protect CodeSpectra's platform and customer data. You will conduct security reviews, pen-tests, build automated security tooling, and drive compliance initiatives.",
    requirements: '- Application security (OWASP Top 10)\n- Cloud security (AWS/GCP)\n- Pen testing and vulnerability management\n- Security automation and SAST/DAST',
    skills: ['AppSec', 'Pen Testing', 'AWS Security', 'SAST', 'DAST', 'SOC 2'],
  },
  {
    title: 'Data Scientist',
    department: 'Data',
    location: 'Remote',
    work_mode: 'remote',
    employment_type: 'full_time',
    experience_min: 2, experience_max: 6,
    openings: 2,
    description: "Turn CodeSpectra's rich assessment and hiring data into actionable insights. You will build dashboards, predictive models, and analytics that drive product decisions.",
    requirements: '- Python data stack (pandas, scikit-learn, matplotlib)\n- SQL fluency\n- Statistical analysis and A/B testing\n- Experience with BI tools (Looker, Metabase)',
    skills: ['Python', 'SQL', 'Pandas', 'Scikit-learn', 'Statistics', 'Tableau'],
  },
]

const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', internship: 'Internship',
}

function experienceLabel(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null
  if (min !== null && max !== null) return `${min}–${max} years`
  return min !== null ? `${min}+ years` : `Up to ${max} years`
}

/** Mirror an ats_jobs doc into job_postings so the public /jobs board shows it. */
async function mirrorToJobPostings(db: ReturnType<import('mongodb').MongoClient['db']>, atsDoc: Record<string, unknown>) {
  const legacyId = newId()
  const locationStr = [atsDoc.location, atsDoc.work_mode === 'remote' ? 'Remote' : atsDoc.work_mode === 'hybrid' ? 'Hybrid' : null].filter(Boolean).join(' · ') || null
  await db.collection('job_postings').insertOne({
    id: legacyId,
    ats_job_id: atsDoc.id,
    tenant_id: atsDoc.tenant_id,
    title: atsDoc.title,
    company: 'CodeSpectra',
    location: locationStr,
    job_type: atsDoc.employment_type ? (EMPLOYMENT_LABEL[atsDoc.employment_type as string] ?? null) : null,
    experience_level: experienceLabel(atsDoc.experience_min as number | null, atsDoc.experience_max as number | null),
    description: atsDoc.description || null,
    requirements: atsDoc.requirements || null,
    skills: atsDoc.skills || [],
    salary: null,
    benefits: null,
    applicants: 0,
    is_active: true,
    created_by: atsDoc.created_by,
    created_at: atsDoc.created_at,
    updated_at: atsDoc.updated_at,
  })
  return legacyId
}

async function main() {
  const client = new MongoClient(MONGODB_URI)
  await client.connect()
  console.log('Connected to MongoDB:', MONGODB_URI.replace(/:\/\/.*@/, '://***@'))

  const db = client.db(DB_NAME)
  const col = db.collection('ats_jobs')
  const pipeline = defaultPipeline()
  const criteria = defaultCriteria()
  const now = nowIso()
  let created = 0, skipped = 0

  for (const job of SEED_JOBS) {
    // Idempotency: skip if a job with the same title already exists in this tenant scope
    const existing = await col.findOne({ title: job.title, tenant_id: TENANT_ID }, { projection: { id: 1 } })
    if (existing) {
      console.log(`⏭️  Skipped (exists): ${job.title}`)
      skipped++
      continue
    }

    const doc = {
      id: newId(),
      tenant_id: TENANT_ID,
      title: job.title,
      department: job.department ?? null,
      location: job.location ?? null,
      work_mode: job.work_mode ?? null,
      employment_type: job.employment_type ?? null,
      experience_min: job.experience_min ?? null,
      experience_max: job.experience_max ?? null,
      salary: null,
      openings: job.openings ?? 1,
      description: job.description,
      requirements: job.requirements ?? null,
      skills: job.skills || [],
      status: 'open',
      is_public: true,
      pipeline,
      criteria,
      created_by: 'system-seed',
      created_at: now,
      updated_at: now,
    }

    await col.insertOne(doc)
    // Mirror into job_postings so the public /jobs board shows this job
    const legacyId = await mirrorToJobPostings(db, doc)
    console.log(`✅  Created: ${job.title}  id=${doc.id}  legacy_id=${legacyId}`)
    created++
  }

  await client.close()
  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
