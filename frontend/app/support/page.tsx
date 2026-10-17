'use client'

import Link from 'next/link'
import { MessageSquare, Activity, ShieldCheck, Search, ChevronDown, Mail, Building } from 'lucide-react'
import { PageHero, btnPrimary, btnSecondary } from '@/components/landing/page-hero'
import { Scene } from '@/components/illustrations/scenes'
import { BentoBody, BentoCard, BentoIcon, BentoShell, BentoTitle } from '@/components/landing/bento-grid'
import { useState } from 'react'
import { PublicPageWrapper } from '@/app/public-layout'

export default function SupportPortalPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const faqs = [
    {
      category: 'Billing',
      questions: [
        {
          q: 'How do I upgrade my plan?',
          a: 'You can upgrade your plan at any time from the Billing settings in your dashboard.',
        },
        {
          q: 'Can I cancel my subscription anytime?',
          a: 'Yes, you can cancel from the Billing settings at any time. The Terms of Service explain what happens to fees.',
        },
        {
          q: 'Do you offer refunds?',
          a: 'Fees are non-refundable except where required by law. See the Terms of Service for details.',
        },
      ],
    },
    {
      category: 'Technical',
      questions: [
        {
          q: 'What are the system requirements?',
          a: 'CodeSpectra runs in current versions of Chrome, Firefox, Safari and Edge. Proctored assessments also need a webcam.',
        },
        {
          q: 'Is my data secure?',
          a: 'Data is encrypted in transit and at rest. The Security page explains how accounts and assessment data are protected.',
        },
        {
          q: 'How long is my data kept?',
          a: 'Retention periods for each kind of data are listed in the Privacy Policy. For anything specific to your organization, contact us.',
        },
      ],
    },
    {
      category: 'Features',
      questions: [
        {
          q: 'Can I use CodeSpectra for personal projects?',
          a: 'Yes. Candidates can practise for free, and the Pricing page lists the paid plans.',
        },
        {
          q: 'How many team members can I invite?',
          a: 'It depends on your plan. The Pricing page shows the current limits for each one.',
        },
      ],
    },
  ]

  const allQuestions = faqs.flatMap((section) =>
    section.questions.map((q, i) => ({
      ...q,
      category: section.category,
      id: `${section.category}-${i}`,
    }))
  )

  const filteredQuestions = searchQuery
    ? allQuestions.filter(
        (q) =>
          (q.q || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (q.a || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allQuestions

  return (
    <PublicPageWrapper>
      <PageHero
        title="How can we help?"
        lead="Find answers to common questions, check whether everything is running, or open a ticket with our team."
        actions={
          <>
            <Link href="/dashboard/support" className={btnPrimary}>Create a ticket</Link>
            <Link href="/status" className={btnSecondary}>System status</Link>
          </>
        }
        art={<Scene name="interview-call" className="w-full max-w-[420px]" />}
      />

      {/* Support cards */}
      <section className="border-b border-cs-grid">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8">
          <BentoShell className="auto-rows-auto lg:grid-cols-3">
            {[
              {
                icon: MessageSquare,
                title: 'Create a ticket',
                desc: 'Sign in and send our support team the details. You can follow the reply in your dashboard.',
                href: '/dashboard/support',
                cta: 'Submit ticket',
              },
              {
                icon: Activity,
                title: 'System status',
                desc: 'See whether every part of CodeSpectra is up right now.',
                href: '/status',
                cta: 'View status',
              },
              {
                icon: ShieldCheck,
                title: 'Security',
                desc: 'How accounts and assessment data are protected, and how to report a vulnerability.',
                href: '/security',
                cta: 'Read security',
              },
            ].map((item) => {
              const Icon = item.icon
              return (
                <BentoCard key={item.title} href={item.href} label={`${item.title} — ${item.cta}`}>
                  <BentoIcon><Icon className="h-5 w-5" aria-hidden /></BentoIcon>
                  <BentoTitle>{item.title}</BentoTitle>
                  <BentoBody className="text-sm">{item.desc}</BentoBody>
                  <span className="mt-auto pt-4 text-sm font-semibold text-cs-accent-text group-hover:underline">{item.cta}</span>
                </BentoCard>
              )
            })}
          </BentoShell>
        </div>
      </section>

      {/* FAQs */}
      <section className="border-b border-cs-grid" aria-labelledby="support-faq">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-20">
          <h2 id="support-faq" className="cs-heading mb-8 text-4xl sm:text-5xl">Frequently asked questions</h2>

          <div className="mb-6">
            <label className="relative block">
              <span className="sr-only">Search FAQs</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-cs-ink-soft" aria-hidden />
              <input
                type="search"
                placeholder="Search FAQs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 w-full rounded-2xl border border-cs-grid bg-cs-sheet pl-12 pr-4 text-cs-ink transition-colors placeholder:text-cs-ink-soft/70 hover:border-cs-accent/40 focus:border-cs-accent focus:outline-none focus:ring-2 focus:ring-cs-accent/20"
              />
            </label>
          </div>

          {filteredQuestions.length === 0 ? (
            <div className="rounded-2xl border border-cs-grid bg-cs-sheet p-8 text-center text-cs-ink-soft">
              No questions match that search. Try a shorter word, or create a ticket.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredQuestions.map((faq, i) => (
                <div
                  key={faq.id}
                  className="overflow-hidden rounded-2xl border border-cs-grid bg-cs-sheet"
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    aria-expanded={openFaq === i}
                    aria-controls={`faq-panel-${faq.id}`}
                    className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors duration-200 hover:bg-cs-accent/5"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-md bg-cs-accent/10 px-2 py-1 text-xs font-semibold text-cs-accent-text">
                        {faq.category}
                      </span>
                      <span className="font-medium text-cs-ink">{faq.q}</span>
                    </div>
                    <ChevronDown
                      aria-hidden
                      className={`h-5 w-5 shrink-0 text-cs-ink-soft transition-transform duration-200 motion-reduce:transition-none ${
                        openFaq === i ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {openFaq === i && (
                    <div id={`faq-panel-${faq.id}`} className="px-4 pb-4">
                      <p className="max-w-[65ch] text-[15px] leading-relaxed text-cs-ink-soft">
                        {faq.a}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Contact */}
      <section className="border-b border-cs-grid">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mb-10 grid gap-4 lg:grid-cols-[1fr_1.2fr] lg:items-end lg:gap-16">
            <h2 className="cs-heading text-4xl sm:text-5xl">Other ways to reach us</h2>
            <p className="max-w-[56ch] text-lg leading-relaxed text-cs-ink-soft">
              Email works for anything that doesn&apos;t fit a ticket.
            </p>
          </div>
          <BentoShell className="auto-rows-auto">
            <BentoCard className="sm:col-span-2">
              <BentoIcon><Mail className="h-5 w-5" aria-hidden /></BentoIcon>
              <BentoTitle>Email</BentoTitle>
              <BentoBody>
                <a href="mailto:support@codespectra.ai" className="font-medium text-cs-accent-text hover:underline">support@codespectra.ai</a>
              </BentoBody>
            </BentoCard>
            <BentoCard className="sm:col-span-2">
              <BentoIcon><Building className="h-5 w-5" aria-hidden /></BentoIcon>
              <BentoTitle>Offices</BentoTitle>
              <BentoBody>Hyderabad, India · Princeton, New Jersey</BentoBody>
            </BentoCard>
          </BentoShell>

          <div className="mt-10 flex flex-col items-start gap-4 rounded-3xl bg-cs-accent p-8 text-cs-accent-ink sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-2xl font-bold">Still need help?</h3>
              <p className="mt-1 text-cs-accent-ink/90">Open a ticket and our support team will get back to you.</p>
            </div>
            <Link
              href="/dashboard/support"
              className="inline-flex h-12 items-center justify-center rounded-full bg-white px-7 text-[15px] font-semibold text-[#1e40af] transition-[filter] hover:brightness-95"
            >
              Contact support
            </Link>
          </div>
        </div>
      </section>
    </PublicPageWrapper>
  )
}
