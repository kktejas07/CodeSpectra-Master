'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { HeroIllustration, PageHero, btnPrimary, btnSecondary } from '@/components/landing/page-hero'

/*
 * Answers here must match what the product actually does (see /features,
 * /about, /terms and /privacy). Don't add language counts, integrations,
 * discounts or certifications that aren't real.
 */
export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<string | null>(null)

  const faqs = [
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

  return (
    <PublicPageWrapper>
      <PageHero
        title="Frequently asked questions"
        lead="Quick answers about assessments, proctoring, hackathons, billing and your data."
        actions={
          <>
            <Link href="/contact" className={btnPrimary}>Ask us something else</Link>
            <Link href="/docs" className={btnSecondary}>Read the docs</Link>
          </>
        }
        art={<HeroIllustration spot="search" />}
      />

      <section className="border-b border-cs-grid">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[220px_1fr] lg:gap-16 lg:px-8 lg:py-20">
          <nav aria-label="FAQ topics" className="hidden lg:block">
            <ul className="sticky top-24 space-y-1">
              {faqs.map((section, sectionIdx) => (
                <li key={section.category}>
                  <a
                    href={`#faq-${sectionIdx}`}
                    className="block rounded-lg px-3 py-2 text-sm font-medium text-cs-ink-soft transition-colors hover:bg-cs-accent/10 hover:text-cs-accent-text"
                  >
                    {section.category}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="max-w-3xl space-y-12">
            {faqs.map((section, sectionIdx) => (
              <div key={sectionIdx} id={`faq-${sectionIdx}`} className="scroll-mt-24">
                <h2 className="cs-heading mb-5 text-3xl">{section.category}</h2>
                <div className="space-y-3">
                  {section.items.map((item, itemIdx) => {
                    const key = `${sectionIdx}-${itemIdx}`
                    const open = openIndex === key
                    return (
                      <div key={itemIdx} className="overflow-hidden rounded-2xl border border-cs-grid bg-cs-sheet">
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-controls={`faq-answer-${key}`}
                          onClick={() => setOpenIndex(open ? null : key)}
                          className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors duration-200 hover:bg-cs-accent/5"
                        >
                          <h3 className="text-base font-semibold text-cs-ink">{item.q}</h3>
                          <ChevronDown
                            aria-hidden
                            className={`h-5 w-5 shrink-0 text-cs-ink-soft transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
                          />
                        </button>
                        {open && (
                          <p id={`faq-answer-${key}`} className="max-w-[65ch] px-5 pb-5 text-[15px] leading-relaxed text-cs-ink-soft">
                            {item.a}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start gap-4 rounded-3xl border border-cs-grid bg-cs-sheet p-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-cs-ink">Still have questions?</h2>
              <p className="mt-1 text-cs-ink-soft">Can&apos;t find the answer you&apos;re looking for? Email our support team.</p>
            </div>
            <a href="mailto:support@codespectra.ai" className={btnSecondary}>
              support@codespectra.ai
            </a>
          </div>
        </div>
      </section>
    </PublicPageWrapper>
  )
}
