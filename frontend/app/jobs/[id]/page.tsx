/**
 * /jobs/[id] — server-rendered job posting for Google for Jobs: unique
 * metadata, JobPosting + Breadcrumb JSON-LD, an answer-first "at a glance"
 * block and FAQ, and a real 404 for unknown or closed posts (SEO-009/023).
 * Applying stays in the client island (JobDetailClient).
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { PublicPageWrapper } from '@/app/public-layout'
import { JsonLd } from '@/components/seo/json-ld'
import { FaqList } from '@/components/seo/faq-list'
import { jobs } from '@/lib/db/content'
import { buildMetadata } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, employmentType, jobPostingJsonLd, jobValidThrough, parseJobLocation, validateJsonLd, type QA } from '@/lib/seo/jsonld'
import { getSiteOrigin } from '@/lib/seo/settings'
import { formatDate } from '@/lib/format-datetime'
import { JobDetailClient, type JobPosting } from './job-detail-client'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

/** Public view of an active posting (same projection rules as GET /api/jobs/[id]). */
const loadJob = cache(async (id: string): Promise<(JobPosting & { updated_at?: string | null; valid_through?: string | null }) | null> => {
  try {
    const doc = await (await jobs()).findOne({ id, is_active: true }, { projection: { _id: 0, created_by: 0, tenant_id: 0 } })
    if (!doc) return null
    const d = doc as unknown as Record<string, unknown>
    return {
      id: String(d.id),
      title: String(d.title || ''),
      company: (d.company as string) ?? null,
      location: (d.location as string) ?? null,
      job_type: (d.job_type as string) ?? null,
      experience_level: (d.experience_level as string) ?? null,
      description: (d.description as string) ?? null,
      requirements: (d.requirements as string) ?? null,
      benefits: (d.benefits as string) ?? null,
      skills: Array.isArray(d.skills) ? (d.skills as unknown[]).map(String) : [],
      salary: (d.salary as JobPosting['salary']) ?? null,
      applicants: Number(d.applicants) || 0,
      created_at: String(d.created_at || new Date(0).toISOString()),
      updated_at: (d.updated_at as string) ?? null,
      valid_through: (d.valid_through as string) ?? null,
      is_active: true,
      ats_job_id: (d.ats_job_id as string) ?? null,
    }
  } catch (e) {
    console.error('[jobs] load failed:', (e as Error)?.message)
    throw e
  }
})

function salaryText(s: JobPosting['salary']): string | null {
  if (!s || !(Number(s.min) > 0)) return null
  const f = (n: number) => new Intl.NumberFormat('en', { style: 'currency', currency: s.currency || 'USD', maximumFractionDigits: 0 }).format(n)
  return Number(s.max) > Number(s.min) ? `${f(s.min)} – ${f(s.max)} a year` : `${f(s.min)} a year`
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params
  const job = await loadJob(id).catch(() => null)
  if (!job) return { title: 'Job not found', robots: { index: false, follow: true } }
  const where = job.location ? ` in ${job.location}` : ''
  const lead = (job.description || '').replace(/\s+/g, ' ').trim()
  return buildMetadata({
    title: `${job.title}${job.company ? ` at ${job.company}` : ''}`,
    description: `${job.company ? `${job.company} is hiring` : 'Hiring'}: ${job.title}${where}${job.job_type ? ` (${job.job_type})` : ''}. ${lead}`,
    path: `/jobs/${job.id}`,
    kind: 'job',
    ogSubtitle: [job.company, job.location, job.job_type].filter(Boolean).join(' · '),
  })
}

export default async function JobPage({ params }: { params: Params }) {
  const { id } = await params
  const job = await loadJob(id)
  if (!job) notFound()
  const site = await getSiteOrigin()
  const loc = parseJobLocation(job.location, job.job_type)
  const salary = salaryText(job.salary)
  const validThrough = jobValidThrough(job)
  const types = employmentType(job.job_type).map((t) => t.replace('_', '-').toLowerCase())

  const facts: { term: string; value: string }[] = [
    { term: 'Company', value: job.company || 'Not stated' },
    { term: 'Location', value: loc.remote ? `Remote${job.location && !/^remote$/i.test(job.location.trim()) ? ` (${job.location})` : ''}` : job.location || 'Not stated' },
    { term: 'Job type', value: job.job_type || types.join(', ') },
    ...(job.experience_level ? [{ term: 'Experience', value: job.experience_level }] : []),
    ...(salary ? [{ term: 'Salary', value: salary }] : []),
    { term: 'Posted', value: formatDate(job.created_at) },
  ]
  const faqs: QA[] = [
    { q: `How do I apply for the ${job.title} role?`, a: job.ats_job_id ? 'Use the application form on this page; you can attach your résumé without creating an account.' : 'Sign in to CodeSpectra (free) and submit your application from this page, with an optional cover letter.' },
    { q: 'Is this job remote?', a: loc.remote ? `Yes, it is listed as remote${loc.countries.length ? ` for candidates in ${loc.countries.join(', ')}` : ''}.` : `No, it is listed${job.location ? ` in ${job.location}` : ' as on-site'}.` },
    ...(salary ? [{ q: 'What does it pay?', a: `The posted range is ${salary}.` }] : []),
    ...(job.skills.length ? [{ q: 'Which skills are required?', a: job.skills.join(', ') + '.' }] : []),
  ]

  // SEO-035: an invalid JobPosting (no country for a remote / city-only post) is a
  // Search Console error, so it is left out; the admin SEO health panel lists it.
  const posting = jobPostingJsonLd(job, site)
  const postingOk = validateJsonLd(posting).length === 0

  return (
    <PublicPageWrapper>
      <JsonLd
        data={[
          ...(postingOk ? [posting] : []),
          breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Jobs', path: '/jobs' }, { name: job.title, path: `/jobs/${job.id}` }], site),
        ]}
      />
      <JobDetailClient initialJob={job} />
      <section aria-labelledby="job-glance" className="mx-auto max-w-5xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-8">
            <div className="speakable-summary rounded-3xl border border-cs-grid bg-cs-sheet p-6">
              <h2 id="job-glance" className="mb-4 text-lg font-bold text-cs-ink">Job at a glance</h2>
              <dl className="grid gap-4 sm:grid-cols-2">
                {facts.map((f) => (
                  <div key={f.term}>
                    <dt className="text-sm text-cs-ink-soft">{f.term}</dt>
                    <dd className="mt-0.5 font-medium text-cs-ink">{f.value}</dd>
                  </div>
                ))}
                <div>
                  <dt className="text-sm text-cs-ink-soft">Apply by</dt>
                  <dd className="mt-0.5 font-medium text-cs-ink"><time dateTime={validThrough}>{formatDate(validThrough)}</time> (while the post stays open)</dd>
                </div>
              </dl>
            </div>
            <div>
              <h2 className="mb-4 text-lg font-bold text-cs-ink">Questions about this job</h2>
              <FaqList items={faqs} idPrefix="job-faq" schema={false} />
            </div>
          </div>
        </div>
      </section>
    </PublicPageWrapper>
  )
}
