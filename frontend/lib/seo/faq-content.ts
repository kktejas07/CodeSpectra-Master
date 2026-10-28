/**
 * Public FAQ copy shared by /faq, /pricing, the landing page, llms-full.txt and
 * FAQPage JSON-LD. Answers must match what the product actually does (see
 * /features, /about, /terms and /privacy). Don't add language counts,
 * integrations, discounts or certifications that aren't real.
 */
import type { QA } from './jsonld'

export interface FaqSection { category: string; items: QA[] }

export const SITE_FAQS: FaqSection[] = [
  {
    category: 'Getting started',
    items: [
      {
        q: 'What is CodeSpectra?',
        a: 'A skills-assessment and hackathon platform for hiring teams and colleges. It turns a long list of applicants into a ranked shortlist based on work each candidate actually did. Candidates also get free practice on the same platform.',
      },
      {
        q: 'How do I get started?',
        a: 'Candidates can create an account and start practising for free. Hiring teams and colleges can book a pilot from the contact page.',
      },
      {
        q: 'What kinds of questions can an assessment include?',
        a: 'Coding with hidden test cases, multiple choice, true or false, fill-in-the-blank, written answers and CAD design tasks, all in one test.',
      },
      {
        q: 'Is it only for software developers?',
        a: 'No. Besides coding roles such as Java, Python, JavaScript and SQL, you can assess QA automation, mechanical CAD, drawing review, aptitude and written answers.',
      },
    ],
  },
  {
    category: 'Scoring and proctoring',
    items: [
      {
        q: 'How are candidates scored?',
        a: 'Questions are weighted by difficulty: easy questions score 3 points, medium 4 and hard 5. Everyone in a screening is scored the same way and ranked on one list.',
      },
      {
        q: 'What does proctoring check?',
        a: 'Fullscreen lock, tab-switch detection, webcam face matching against the ID photo, copy-paste blocking and second-screen detection. Every event is timestamped on the report and a reviewer decides what it means.',
      },
      {
        q: 'Do you check for plagiarism?',
        a: 'Yes. Code answers are compared across everyone who took the same test.',
      },
      {
        q: 'Can we share results with candidates?',
        a: 'Yes. You can release scores to candidates or download the results as a CSV file.',
      },
    ],
  },
  {
    category: 'Hackathons',
    items: [
      {
        q: 'How do hackathons work?',
        a: 'Teams of up to five join with one link, claim problems and submit a repository. Judges score each entry out of 100 on a shared rubric, then release results.',
      },
    ],
  },
  {
    category: 'Accounts and integrations',
    items: [
      {
        q: 'Can I connect GitHub?',
        a: 'Yes. GitHub is connected through OAuth, so CodeSpectra never asks for your GitHub password.',
      },
      {
        q: 'Can our organization use single sign-on?',
        a: 'Yes. Organizations can sign in through their own SAML or OIDC identity provider, such as Okta, Azure AD or Google Workspace.',
      },
    ],
  },
  {
    category: 'Billing',
    items: [
      {
        q: 'Where can I see prices?',
        a: 'The pricing page always shows the current plans and prices.',
      },
      {
        q: 'Can I cancel my subscription?',
        a: 'Yes, from the Billing settings in your dashboard at any time.',
      },
      {
        q: 'What is your refund policy?',
        a: 'Fees are non-refundable except where required by law. The Terms of Service have the details.',
      },
    ],
  },
  {
    category: 'Security and privacy',
    items: [
      {
        q: 'How is my data protected?',
        a: 'Data is encrypted in transit and at rest, and dashboards use role-based access. The Security page explains more.',
      },
      {
        q: 'Can I export or delete my data?',
        a: 'Yes. Email privacy@codespectra.ai to access, export or delete your personal data. The Privacy Policy lists your rights and how long each kind of data is kept.',
      },
    ],
  },
]

export const ALL_SITE_FAQS: QA[] = SITE_FAQS.flatMap((s) => s.items)

/** Pricing questions. `annualSavingsPct` comes from the live plans. */
export function pricingFaqs(annualSavingsPct: number): QA[] {
  return [
    { q: 'Can I change plans anytime?', a: 'Yes, you can upgrade or downgrade at any time. Changes take effect on your next billing cycle unless otherwise noted.' },
    { q: 'Is there a free tier?', a: 'Yes. You can start on the free plan and move to paid plans when you need more capacity.' },
    { q: 'What payment methods do you accept?', a: 'We accept major credit cards via Stripe. Enterprise billing options may be available on request.' },
    { q: 'Do you offer discounts for annual billing?', a: `Yes. Annual plans are discounted versus paying monthly (typically around ${annualSavingsPct}% less than twelve monthly payments for Pro).` },
  ]
}

/** Short set for the landing page (answer-first, picked from the main FAQ). */
export const LANDING_FAQS: QA[] = [
  'What is CodeSpectra?',
  'Is it only for software developers?',
  'How are candidates scored?',
  'What does proctoring check?',
  'How do I get started?',
].map((q) => ALL_SITE_FAQS.find((f) => f.q === q)).filter((x): x is QA => !!x)
