/**
 * One-shot seed: populates the three comparison pages
 * (vs Mercor, vs HackerRank, vs iMocha) in the `platform_settings`
 * MongoDB collection so /compare/* goes live.
 *
 * Usage (from /frontend):
 *   MONGODB_URI=<uri> npx tsx scripts/seed-comparisons.ts
 *
 * Re-running is safe — it merges into existing settings without
 * destroying other SEO settings already in the DB.
 */

import { MongoClient } from 'mongodb'
import { mergeSeoSettings, type ComparisonPage } from '../lib/seo/settings-shared'

const MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) {
  console.error('MONGODB_URI env variable is required.')
  process.exit(1)
}

const NOW = new Date().toISOString()

const COMPARISONS: ComparisonPage[] = [
  /* ───────────────────────────── vs Mercor ───────────────────────────── */
  {
    slug: 'codespectra-vs-mercor',
    competitor: 'Mercor',
    summary:
      'Mercor is a talent marketplace where companies access a pre-vetted pool of engineers; CodeSpectra is a technical assessment platform you deploy against your own candidate pipeline. If you need to run structured coding tests, campus drives, or proctored skill gates — CodeSpectra. If you need a staffing agency to source pre-screened talent — Mercor.',
    rows: [
      {
        feature: 'Primary use case',
        codespectra: 'Assessment platform for your own candidates and campus pools',
        competitor: 'Talent marketplace; Mercor supplies the candidates',
      },
      {
        feature: 'Proctored coding tests',
        codespectra: 'Full-stack proctoring — webcam, tab-lock, AI flag review',
        competitor: 'Internal screen before listing talent; not configurable by buyer',
      },
      {
        feature: 'Multi-language support (code)',
        codespectra: '20 + languages with live execution and test-case diff',
        competitor: 'Proprietary evaluation; language coverage not published',
      },
      {
        feature: 'Campus hiring module',
        codespectra: 'Dedicated campus portal with bulk drives, roll-number login, results export',
        competitor: 'No campus-drive product; enterprise focus only',
      },
      {
        feature: 'Skill Passport (portable credential)',
        codespectra: 'Candidate earns a verified, shareable credential after each assessment',
        competitor: 'No portable credential; score stays inside Mercor marketplace',
      },
      {
        feature: 'AI-powered debrief',
        codespectra: 'Per-question AI debrief with concept explanation and improvement tips',
        competitor: 'No candidate-facing debrief',
      },
      {
        feature: 'WhatsApp practice',
        codespectra: 'Practice mode via WhatsApp — no app install needed',
        competitor: 'No mobile-first practice path',
      },
      {
        feature: 'Indian-language support',
        codespectra: 'Full Hindi and Telugu UI and question library',
        competitor: 'English only',
      },
      {
        feature: 'Self-host / white-label',
        codespectra: 'Full white-label with your own domain and branding',
        competitor: 'SaaS marketplace; no white-label option',
      },
      {
        feature: 'SonarQube / CI integration',
        codespectra: 'Connect SonarCloud or self-hosted SonarQube as a code-quality gate',
        competitor: 'No CI/code-quality integration',
      },
      {
        feature: 'Pricing model',
        codespectra: 'Transparent per-seat SaaS plans; free tier for small teams',
        competitor: 'Placement fee or annual enterprise contract; pricing not public',
      },
    ],
    best_for_codespectra:
      'Hiring teams, universities, and staffing firms that run their own screening pipeline and need a customisable, proctored, multi-language assessment platform with campus and WhatsApp reach.',
    best_for_competitor:
      'Companies that want Mercor to source and pre-screen candidates on their behalf, without running any assessment infrastructure themselves.',
    sources: [
      'https://mercor.com',
      'https://mercor.com/for-companies',
    ],
    published: true,
    updated_at: NOW,
  },

  /* ─────────────────────────── vs HackerRank ─────────────────────────── */
  {
    slug: 'codespectra-vs-hackerrank',
    competitor: 'HackerRank',
    summary:
      'HackerRank is a mature, global technical assessment platform strong in enterprise and competitive programming; CodeSpectra is built for the Indian hiring market with deeper campus reach, WhatsApp-first practice, multilingual support, and an AI debrief that teaches candidates after every test. Both offer proctored coding screens — the main difference is depth of localisation, candidate experience, and cost accessibility.',
    rows: [
      {
        feature: 'Primary market focus',
        codespectra: 'India-first with global capability; strong campus and tier-2/3 city reach',
        competitor: 'Global enterprise, US-dominant; Indian market served but not localised',
      },
      {
        feature: 'Indian-language UI',
        codespectra: 'Hindi and Telugu UI plus translated question library',
        competitor: 'English only',
      },
      {
        feature: 'WhatsApp practice',
        codespectra: 'Full practice mode via WhatsApp — no smartphone app required',
        competitor: 'No WhatsApp or offline-friendly practice path',
      },
      {
        feature: 'AI debrief after assessment',
        codespectra: 'Per-question AI explanation with concept links and improvement tips',
        competitor: 'Score report only; no per-question debrief for candidates',
      },
      {
        feature: 'Skill Passport',
        codespectra: 'Shareable, verifiable credential on the candidate\'s public profile',
        competitor: 'HackerRank certificates exist but are siloed on HackerRank.com',
      },
      {
        feature: 'Campus hiring module',
        codespectra: 'Bulk drives, roll-number / college-email login, export to placement cell',
        competitor: 'Campus features available on higher-tier plans; not a core module',
      },
      {
        feature: 'Proctoring depth',
        codespectra: 'Webcam snapshots, tab-leave detection, AI flag review, copy-paste block',
        competitor: 'Similar proctoring; available on Team / Enterprise plans',
      },
      {
        feature: 'CAD / engineering assessments',
        codespectra: 'Extends to mechanical / civil engineering roles with CAD question types',
        competitor: 'Software engineering only; no CAD assessment support',
      },
      {
        feature: 'SonarQube / code-quality gate',
        codespectra: 'Native SonarCloud and self-hosted SonarQube integration',
        competitor: 'No code-quality gate integration',
      },
      {
        feature: 'Guardian / parent portal',
        codespectra: 'Guardian view for student results with consent flow',
        competitor: 'No guardian portal',
      },
      {
        feature: 'Pricing accessibility',
        codespectra: 'Transparent plans with a free tier; INR pricing available',
        competitor: 'USD-only pricing; starter plans can be cost-prohibitive for Indian SMEs',
      },
    ],
    best_for_codespectra:
      'Indian companies, universities, and placement cells that need multilingual, campus-ready, mobile-accessible assessments with post-test AI learning and competitive pricing.',
    best_for_competitor:
      'Global enterprises, US-based tech companies, and teams already embedded in the HackerRank ecosystem who need a large library of competitive-programming challenges and global benchmarks.',
    sources: [
      'https://www.hackerrank.com/products/developer-skills-platform/',
      'https://www.hackerrank.com/pricing',
    ],
    published: true,
    updated_at: NOW,
  },

  /* ──────────────────────────── vs iMocha ────────────────────────────── */
  {
    slug: 'codespectra-vs-imocha',
    competitor: 'iMocha',
    summary:
      'iMocha is a broad skills-intelligence platform covering 2 000 + skills across coding, cognitive, and behavioural domains; CodeSpectra focuses deeper on technical and coding assessments with native campus reach, WhatsApp practice, AI debrief, and India-first localisation. iMocha suits HR teams wanting a single platform for all skill types; CodeSpectra suits engineering-heavy hiring with campus volume and mobile accessibility.',
    rows: [
      {
        feature: 'Assessment breadth',
        codespectra: 'Deep technical: coding, DS/Algo, CAD, MCQ, project-based',
        competitor: '2 000 + skills: coding, cognitive, behavioural, language, domain',
      },
      {
        feature: 'Indian-language support',
        codespectra: 'Full Hindi and Telugu UI and question localisation',
        competitor: 'English-centric; limited regional-language support',
      },
      {
        feature: 'Campus hiring module',
        codespectra: 'Bulk drives, roll-number login, results to placement cell, college branding',
        competitor: 'Enterprise HR focus; no dedicated campus-drive module',
      },
      {
        feature: 'AI debrief for candidates',
        codespectra: 'Per-question AI debrief explaining concepts and improvement areas',
        competitor: 'Score reports and dashboards for HR; no per-question candidate debrief',
      },
      {
        feature: 'WhatsApp practice',
        codespectra: 'Practice mode via WhatsApp without installing any app',
        competitor: 'No WhatsApp or messaging-channel practice path',
      },
      {
        feature: 'Skill Passport (portable credential)',
        codespectra: 'Candidate earns a shareable, verifiable credential per assessment',
        competitor: 'Skill data is organisational record; not candidate-portable',
      },
      {
        feature: 'Proctoring',
        codespectra: 'Webcam, tab-lock, AI flag review — built-in at all plan levels',
        competitor: 'Proctoring available; may require higher-tier plan',
      },
      {
        feature: 'SonarQube / CI integration',
        codespectra: 'Connect SonarCloud or self-hosted SonarQube as a code-quality gate',
        competitor: 'No code-quality or CI pipeline integration',
      },
      {
        feature: 'Guardian / parent portal',
        codespectra: 'Guardian view with student results and consent flow',
        competitor: 'No guardian portal',
      },
      {
        feature: 'Pricing model',
        codespectra: 'Transparent per-seat plans; INR pricing; free tier for small teams',
        competitor: 'Enterprise contracts; pricing on request; USD-dominant',
      },
    ],
    best_for_codespectra:
      'Engineering-heavy hiring teams, universities, and staffing firms that need deep coding assessments, campus volume, mobile accessibility, and a learning-first candidate experience.',
    best_for_competitor:
      'HR and L&D teams that need one platform to assess skills across coding, cognitive, behavioural, and domain knowledge — not just developers.',
    sources: [
      'https://www.imocha.io/platform',
      'https://www.imocha.io/pricing',
    ],
    published: true,
    updated_at: NOW,
  },
]

async function main() {
  const client = new MongoClient(MONGODB_URI as string)
  try {
    await client.connect()
    const db = client.db()
    const col = db.collection('platform_settings')

    // Read existing SEO settings (don't clobber them)
    const existing = await col.findOne({ key: 'seo' })
    const current = existing?.value ?? {}

    // Merge: keep existing comparisons by slug, upsert the new three
    const existingSlugs = new Set(
      Array.isArray(current.comparisons) ? current.comparisons.map((c: ComparisonPage) => c.slug) : [],
    )
    const toAdd = COMPARISONS.filter((c) => !existingSlugs.has(c.slug))
    const existing_comparisons = Array.isArray(current.comparisons) ? current.comparisons : []
    const merged = mergeSeoSettings({
      ...current,
      comparisons: [...existing_comparisons, ...toAdd],
    })

    await col.updateOne(
      { key: 'seo' },
      { $set: { key: 'seo', value: merged, updated_at: NOW, updated_by: 'seed-comparisons' } },
      { upsert: true },
    )

    console.log(`✓ Seeded ${toAdd.length} comparison(s):`, toAdd.map((c) => c.slug).join(', ') || '(all already present)')
  } finally {
    await client.close()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
