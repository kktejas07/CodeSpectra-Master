/**
 * POST /api/admin/seed-jobs
 * One-shot endpoint to seed demo ATS jobs + their job_postings mirror.
 * Superadmin only. Safe to call multiple times (idempotent by title).
 *
 * Usage: POST https://codespectra.ai/api/admin/seed-jobs
 * with your superadmin session cookie, or pass ?secret=CRON_SECRET
 */
import { NextRequest, NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/route-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function newId() { return randomUUID() }
function nowIso() { return new Date().toISOString() }

const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', internship: 'Internship',
}

function experienceLabel(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null
  if (min !== null && max !== null) return `${min}–${max} years`
  return min !== null ? `${min}+ years` : `Up to ${max} years`
}

function defaultPipeline() {
  return [
    { id: 's_applied',    type: 'applied',           name: 'Applied',            advance: 'auto',     on_fail: 'review', notify: { email: true } },
    { id: 's_screening',  type: 'screening',          name: 'Résumé Screening',   advance: 'auto',     on_fail: 'review', config: { kind: 'screening' } },
    {
      id: 's_botscreen', type: 'bot_screen', name: 'AI Phone Screen', advance: 'approval', on_fail: 'review', sla_days: 7,
      config: {
        kind: 'bot_screen',
        channels: ['whatsapp_chat', 'whatsapp_call', 'phone_call'],
        language: 'en-IN', pass_score: 60, max_attempts: 3,
        questions: [
          { id: 'q_notice',   text: 'What is your notice period in days?',               type: 'number'  },
          { id: 'q_relocate', text: 'Are you open to relocating for this role?',          type: 'yes_no'  },
          { id: 'q_expected', text: 'What is your expected annual salary (in LPA)?',      type: 'number'  },
          { id: 'q_exp',      text: 'How many years of relevant experience do you have?', type: 'number'  },
        ],
      },
    },
    {
      id: 's_assessment', type: 'assessment', name: 'Technical Assessment', advance: 'auto', on_fail: 'reject', sla_days: 10,
      notify: { email: true },
      config: { kind: 'assessment', exam_id: null, pass_score: 60, deadline_days: 7 },
    },
    {
      id: 's_vint', type: 'virtual_interview', name: 'Virtual Interview', advance: 'approval', on_fail: 'review', sla_days: 14, notify: { email: true },
      config: { kind: 'interview', mode: 'virtual', provider: 'livekit', duration_min: 45, panel_ids: [], self_schedule: true, pass_rule: 'majority_yes',
        scorecard: [{ id: 'sc1', label: 'Technical Skills', weight: 0.4 }, { id: 'sc2', label: 'Communication', weight: 0.3 }, { id: 'sc3', label: 'Culture Fit', weight: 0.3 }] },
    },
    { id: 's_hr',       type: 'hr_round', name: 'HR Round',   advance: 'approval', on_fail: 'review', sla_days: 14, config: { kind: 'hr_round', questions: [], pass_score: 60 } },
    { id: 's_offer',    type: 'offer',    name: 'Offer',      advance: 'approval', on_fail: 'review', notify: { email: true }, config: { kind: 'offer', template: null } },
    { id: 's_hired',    type: 'hired',    name: 'Hired',      advance: 'auto',     on_fail: 'review', notify: { email: true } },
    { id: 's_rejected', type: 'rejected', name: 'Rejected',   advance: 'auto',     on_fail: 'reject', notify: { email: true } },
  ]
}

const SEED_JOBS = [
  { title: 'Senior Frontend Engineer',       department: 'Engineering',    location: 'Remote',            work_mode: 'remote',  employment_type: 'full_time', experience_min: 4, experience_max: 8,  openings: 2,
    description: 'We are looking for a Senior Frontend Engineer to build world-class user experiences at CodeSpectra. You will work on our React/Next.js codebase, collaborate with product and design, and mentor junior engineers.',
    requirements: '- 4+ years of React / Next.js experience\n- Strong TypeScript skills\n- Experience with REST and GraphQL APIs\n- Eye for performance and accessibility',
    skills: ['React', 'TypeScript', 'Next.js', 'TailwindCSS', 'REST APIs'] },
  { title: 'Backend Engineer — Python',       department: 'Engineering',    location: 'Remote',            work_mode: 'remote',  employment_type: 'full_time', experience_min: 3, experience_max: 7,  openings: 2,
    description: "Join our backend team building the FastAPI services that power CodeSpectra's AI-driven assessment platform.",
    requirements: '- 3+ years of Python back-end development\n- Experience with FastAPI or Django\n- Strong knowledge of PostgreSQL / MongoDB\n- Familiarity with Docker and cloud deployments',
    skills: ['Python', 'FastAPI', 'MongoDB', 'PostgreSQL', 'Docker'] },
  { title: 'Full Stack Engineer',             department: 'Engineering',    location: 'Bangalore, India',  work_mode: 'hybrid',  employment_type: 'full_time', experience_min: 2, experience_max: 6,  openings: 3,
    description: 'We need a versatile Full Stack Engineer comfortable across our Next.js frontend and Python backend.',
    requirements: '- 2+ years of full-stack experience\n- Comfort with React and at least one backend language\n- Understanding of SQL and NoSQL databases',
    skills: ['React', 'Node.js', 'Python', 'TypeScript', 'MongoDB'] },
  { title: 'Machine Learning Engineer',       department: 'AI / ML',        location: 'Remote',            work_mode: 'remote',  employment_type: 'full_time', experience_min: 3, experience_max: 8,  openings: 1,
    description: "Help us build the AI engine behind CodeSpectra's automated candidate assessment, resume parsing, and AI interviewing.",
    requirements: '- Strong ML fundamentals (NLP, embeddings, transformers)\n- Python, PyTorch or TensorFlow\n- Experience with vector databases',
    skills: ['Python', 'PyTorch', 'NLP', 'Transformers', 'Vector Databases', 'MLOps'] },
  { title: 'DevOps / Platform Engineer',      department: 'Infrastructure', location: 'Remote',            work_mode: 'remote',  employment_type: 'full_time', experience_min: 3, experience_max: 7,  openings: 1,
    description: "Own our CI/CD pipelines, Kubernetes clusters, and observability stack.",
    requirements: '- Kubernetes and Helm experience\n- CI/CD (GitHub Actions, Argo)\n- AWS or GCP\n- Monitoring with Prometheus / Grafana',
    skills: ['Kubernetes', 'Docker', 'AWS', 'Terraform', 'GitHub Actions', 'Prometheus'] },
  { title: 'Product Manager — ATS & Hiring',  department: 'Product',        location: 'Remote',            work_mode: 'remote',  employment_type: 'full_time', experience_min: 3, experience_max: 7,  openings: 1,
    description: "Drive the roadmap for our Applicant Tracking System and AI-powered hiring features.",
    requirements: '- 3+ years of B2B SaaS product management\n- Experience with HR tech or ATS products\n- Data-driven decision making',
    skills: ['Product Strategy', 'Roadmapping', 'User Research', 'Agile', 'HR Tech'] },
  { title: 'QA Engineer — Automation',        department: 'Engineering',    location: 'Remote',            work_mode: 'remote',  employment_type: 'full_time', experience_min: 2, experience_max: 5,  openings: 2,
    description: 'Build and maintain our automated test suite covering API, UI, and integration layers.',
    requirements: '- Experience with Playwright, Cypress, or Selenium\n- API testing\n- CI integration',
    skills: ['Playwright', 'Cypress', 'API Testing', 'TypeScript', 'CI/CD'] },
  { title: 'Mobile Developer — React Native',  department: 'Engineering',   location: 'Remote',            work_mode: 'remote',  employment_type: 'full_time', experience_min: 2, experience_max: 6,  openings: 2,
    description: "Build CodeSpectra's candidate-facing mobile app using React Native.",
    requirements: '- 2+ years of React Native\n- Experience publishing to App Store and Google Play\n- State management (Redux, Zustand)',
    skills: ['React Native', 'TypeScript', 'iOS', 'Android', 'Redux'] },
  { title: 'Security Engineer',               department: 'Security',       location: 'Remote',            work_mode: 'remote',  employment_type: 'full_time', experience_min: 4, experience_max: 9,  openings: 1,
    description: "Protect CodeSpectra's platform and customer data. Conduct security reviews, pen-tests, and drive compliance initiatives.",
    requirements: '- Application security (OWASP Top 10)\n- Cloud security (AWS/GCP)\n- Pen testing and vulnerability management',
    skills: ['AppSec', 'Pen Testing', 'AWS Security', 'SAST', 'DAST', 'SOC 2'] },
  { title: 'Data Scientist',                  department: 'Data',           location: 'Remote',            work_mode: 'remote',  employment_type: 'full_time', experience_min: 2, experience_max: 6,  openings: 2,
    description: "Turn CodeSpectra's rich assessment and hiring data into actionable insights.",
    requirements: '- Python data stack (pandas, scikit-learn)\n- SQL fluency\n- Statistical analysis and A/B testing',
    skills: ['Python', 'SQL', 'Pandas', 'Scikit-learn', 'Statistics', 'Tableau'] },
]

export async function POST(request: NextRequest) {
  // Allow superadmin session OR cron secret for one-shot use
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  const cronSecret = process.env.CRON_SECRET
  if (!secret || !cronSecret || secret !== cronSecret) {
    const gate = await requireAdmin()
    if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const db = await getMongoDb()
  const atsCol = db.collection('ats_jobs')
  const postingsCol = db.collection('job_postings')
  const pipeline = defaultPipeline()
  const criteria = { min_score: 60, weights: { skills: 0.4, experience: 0.3, education: 0.2, culture: 0.1 } }
  const now = nowIso()

  let created = 0
  const skipped: string[] = []
  const results: Array<{ title: string; ats_id: string; legacy_id: string }> = []

  for (const job of SEED_JOBS) {
    const existing = await atsCol.findOne({ title: job.title, tenant_id: null }, { projection: { id: 1 } })
    if (existing) { skipped.push(job.title); continue }

    const atsId = newId()
    const legacyId = newId()
    const locationStr = [job.location, job.work_mode === 'remote' ? 'Remote' : job.work_mode === 'hybrid' ? 'Hybrid' : null]
      .filter((v, i, a) => v && a.indexOf(v) === i).join(' · ') || null

    await atsCol.insertOne({
      id: atsId, tenant_id: null, title: job.title, department: job.department, location: job.location,
      work_mode: job.work_mode, employment_type: job.employment_type,
      experience_min: job.experience_min, experience_max: job.experience_max,
      salary: null, openings: job.openings, description: job.description,
      requirements: job.requirements, skills: job.skills,
      status: 'open', is_public: true, pipeline, criteria,
      created_by: 'system-seed', created_at: now, updated_at: now,
    })

    await postingsCol.insertOne({
      id: legacyId, ats_job_id: atsId, tenant_id: null,
      title: job.title, company: 'CodeSpectra', location: locationStr,
      job_type: EMPLOYMENT_LABEL[job.employment_type] ?? null,
      experience_level: experienceLabel(job.experience_min, job.experience_max),
      description: job.description, requirements: job.requirements,
      skills: job.skills, salary: null, benefits: null, applicants: 0,
      is_active: true, created_by: 'system-seed', created_at: now, updated_at: now,
    })

    results.push({ title: job.title, ats_id: atsId, legacy_id: legacyId })
    created++
  }

  return NextResponse.json({ ok: true, created, skipped: skipped.length, skipped_titles: skipped, jobs: results })
}
