/**
 * One-shot seed: writes DRAFT comparison pages (vs HackerRank, vs iMocha)
 * into `platform_settings` (key `seo`). Drafts are unpublished, so /compare
 * keeps returning 404 for them until an admin reviews and publishes each one
 * in Admin → Settings → SEO & AI search → Comparison pages.
 *
 * Rules these drafts follow (lib/seo/settings-shared.ts: "never generated
 * with invented claims"):
 *   - Every CodeSpectra cell is something the code in this repo does today.
 *   - A competitor cell is filled only when the competitor's own page says
 *     it (listed in `sources`). Everything else is left EMPTY for the admin
 *     to fill from a first-party source before publishing.
 *
 * It also repairs a database seeded by the first version of this script,
 * which published unverified claims: the two slugs below are overwritten as
 * unpublished drafts and `codespectra-vs-mercor` is removed (Mercor no longer
 * describes itself as a hiring-assessment product, so the page had no basis).
 *
 * Usage (from /frontend):
 *   MONGODB_URI=<uri> [MONGODB_DB_NAME=codespectra] npx tsx scripts/seed-comparisons.ts
 */

import { MongoClient } from 'mongodb'
import { mergeSeoSettings, type ComparisonPage } from '../lib/seo/settings-shared'

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL
if (!MONGODB_URI) {
  console.error('MONGODB_URI (or MONGO_URL) is required.')
  process.exit(1)
}
// Same default as lib/mongodb.ts — the URI's own default database is NOT used.
const DB_NAME = process.env.MONGODB_DB_NAME || 'codespectra'

const NOW = new Date().toISOString()
const RETIRED_SLUGS = ['codespectra-vs-mercor']

/** CodeSpectra facts, each checked against the code path named beside it. */
const CS = {
  languages: '12 languages: Python, Java, C++, C, C#, JavaScript, TypeScript, Go, Ruby, Rust, Kotlin, Swift', // lib/code-languages.ts
  proctoring: 'Webcam face monitoring, code-similarity checks and a per-attempt trust score', // lib/proctoring, lib/integrity
  campus: 'Campus module: CSV student import with roll numbers, drives, offers and placement readiness', // lib/campus
  passport: 'Skill Passport: a verifiable credential with a public verification page and PDF', // lib/passport, app/verify
  whatsapp: 'Practice over WhatsApp: a daily question and a weekly mock', // lib/wa-practice
  ui: 'Interface in English, Hindi and Telugu', // lib/i18n/messages/{en,hi,te}
  guardian: 'Results can be shared with a guardian', // lib/guardian
  debrief: 'Optional post-assessment debrief: three AI-written follow-up questions the candidate answers', // app/api/exams/[id]/debrief
  cad: 'CAD question type for engineering roles', // lib/cad
  plans: 'Free, Pro and Enterprise plans, priced in INR and USD', // lib/billing-catalog.ts, lib/billing-plans.ts
}

const COMPARISONS: ComparisonPage[] = [
  {
    slug: 'codespectra-vs-hackerrank',
    competitor: 'HackerRank',
    summary:
      'DRAFT — not reviewed. CodeSpectra is a technical assessment platform with a campus module, WhatsApp practice and an English, Hindi and Telugu interface. The HackerRank column is empty until each cell is filled from HackerRank’s own pages.',
    rows: [
      { feature: 'Coding languages', codespectra: CS.languages, competitor: '' },
      { feature: 'Proctoring', codespectra: CS.proctoring, competitor: '' },
      { feature: 'Campus hiring', codespectra: CS.campus, competitor: '' },
      { feature: 'Candidate credential', codespectra: CS.passport, competitor: '' },
      { feature: 'Practice channel', codespectra: CS.whatsapp, competitor: '' },
      { feature: 'Interface languages', codespectra: CS.ui, competitor: '' },
      { feature: 'Guardian sharing', codespectra: CS.guardian, competitor: '' },
      { feature: 'Post-assessment debrief', codespectra: CS.debrief, competitor: '' },
      { feature: 'Engineering (CAD) questions', codespectra: CS.cad, competitor: '' },
      { feature: 'Plans and pricing', codespectra: CS.plans, competitor: '' },
    ],
    best_for_codespectra: '',
    best_for_competitor: '',
    sources: [],
    published: false,
    updated_at: NOW,
  },
  {
    slug: 'codespectra-vs-imocha',
    competitor: 'iMocha',
    summary:
      'DRAFT — not reviewed. CodeSpectra is a technical assessment platform with a campus module, WhatsApp practice and an English, Hindi and Telugu interface. Only the iMocha cells taken from iMocha’s pricing page are filled; the rest are empty until sourced.',
    rows: [
      { feature: 'Coding languages', codespectra: CS.languages, competitor: '' },
      {
        feature: 'Proctoring',
        codespectra: CS.proctoring,
        competitor: 'Candidate ID verification, smart video proctoring and a safe assessment browser (pricing page)',
      },
      { feature: 'Campus hiring', codespectra: CS.campus, competitor: '' },
      { feature: 'Candidate credential', codespectra: CS.passport, competitor: '' },
      { feature: 'Practice channel', codespectra: CS.whatsapp, competitor: '' },
      { feature: 'Interface languages', codespectra: CS.ui, competitor: '' },
      { feature: 'Guardian sharing', codespectra: CS.guardian, competitor: '' },
      { feature: 'Post-assessment debrief', codespectra: CS.debrief, competitor: '' },
      { feature: 'Engineering (CAD) questions', codespectra: CS.cad, competitor: '' },
      {
        feature: 'Plans and pricing',
        codespectra: CS.plans,
        competitor: 'Basic plan listed at $400 per month billed annually, for 5 recruiters and 600 candidate assessments or interviews a year (pricing page, read November 2026)',
      },
    ],
    best_for_codespectra: '',
    best_for_competitor: '',
    sources: ['https://imocha.io/Pricing'],
    published: false,
    updated_at: NOW,
  },
]

async function main() {
  const client = new MongoClient(MONGODB_URI as string)
  try {
    await client.connect()
    const col = client.db(DB_NAME).collection('platform_settings')

    const existing = await col.findOne({ key: 'seo' })
    const current = (existing?.value ?? {}) as { comparisons?: ComparisonPage[] }
    const ours = new Set([...COMPARISONS.map((c) => c.slug), ...RETIRED_SLUGS])
    const kept = (Array.isArray(current.comparisons) ? current.comparisons : []).filter((c) => !ours.has(c.slug))
    const removed = (Array.isArray(current.comparisons) ? current.comparisons : []).filter((c) => RETIRED_SLUGS.includes(c.slug))

    // Every other SEO setting is carried over unchanged.
    const merged = mergeSeoSettings({ ...current, comparisons: [...kept, ...COMPARISONS] })

    await col.updateOne(
      { key: 'seo' },
      { $set: { key: 'seo', value: merged, updated_at: NOW, updated_by: 'seed-comparisons' } },
      { upsert: true },
    )

    console.log(`Database "${DB_NAME}": wrote ${COMPARISONS.length} unpublished draft(s): ${COMPARISONS.map((c) => c.slug).join(', ')}`)
    if (removed.length) console.log(`Removed: ${removed.map((c) => c.slug).join(', ')}`)
    console.log('Nothing is live. Fill the empty competitor cells from first-party sources, then publish in Admin → Settings → SEO.')
  } finally {
    await client.close()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
