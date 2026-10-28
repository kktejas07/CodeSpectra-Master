'use client'

import Link from 'next/link'
import { MessageSquare, Activity, ShieldCheck, Search, ChevronDown, Mail, Building } from 'lucide-react'
import { PageHero, btnPrimary, btnSecondary } from '@/components/landing/page-hero'
import { Scene } from '@/components/illustrations/scenes'
import { BentoBody, BentoCard, BentoIcon, BentoShell, BentoTitle } from '@/components/landing/bento-grid'
import { useState } from 'react'
import { PublicPageWrapper } from '@/app/public-layout'
import { useT } from '@/lib/i18n/client'
import type { MessageKey } from '@/lib/i18n/catalog'

// Copy: publicPages.supportFaq<N>Q / <N>A, grouped by category.
const FAQ_GROUPS = [
  { category: 'publicPages.supportCatBilling', ids: [1, 2, 3] },
  { category: 'publicPages.supportCatTechnical', ids: [4, 5, 6] },
  { category: 'publicPages.supportCatFeatures', ids: [7, 8] },
] as const

export default function SupportPortalPage() {
  const { t } = useT()
  const [searchQuery, setSearchQuery] = useState('')
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const faqs = FAQ_GROUPS.map((g) => ({
    category: t(g.category),
    questions: g.ids.map((n) => ({ q: t(`publicPages.supportFaq${n}Q` as MessageKey), a: t(`publicPages.supportFaq${n}A` as MessageKey) })),
  }))

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
        title={t('publicPages.supportTitle')}
        lead={t('publicPages.supportLead')}
        actions={
          <>
            <Link href="/dashboard/support" className={btnPrimary}>{t('publicPages.supportCreateTicket')}</Link>
            <Link href="/status" className={btnSecondary}>{t('public.systemStatus')}</Link>
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
                title: t('publicPages.supportCreateTicket'),
                desc: t('publicPages.supportTicketBody'),
                href: '/dashboard/support',
                cta: t('publicPages.supportTicketCta'),
              },
              {
                icon: Activity,
                title: t('public.systemStatus'),
                desc: t('publicPages.supportStatusBody'),
                href: '/status',
                cta: t('publicPages.supportStatusCta'),
              },
              {
                icon: ShieldCheck,
                title: t('public.footSecurity'),
                desc: t('publicPages.supportSecurityBody'),
                href: '/security',
                cta: t('publicPages.supportSecurityCta'),
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
          <h2 id="support-faq" className="cs-heading mb-8 text-4xl sm:text-5xl">{t('publicPages.faqTitle')}</h2>

          <div className="mb-6">
            <label className="relative block">
              <span className="sr-only">{t('publicPages.supportSearch')}</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-cs-ink-soft" aria-hidden />
              <input
                type="search"
                placeholder={t('publicPages.supportSearchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 w-full rounded-2xl border border-cs-grid bg-cs-sheet pl-12 pr-4 text-cs-ink transition-colors placeholder:text-cs-ink-soft/70 hover:border-cs-accent/40 focus:border-cs-accent focus:outline-none focus:ring-2 focus:ring-cs-accent/20"
              />
            </label>
          </div>

          {filteredQuestions.length === 0 ? (
            <div className="rounded-2xl border border-cs-grid bg-cs-sheet p-8 text-center text-cs-ink-soft">
              {t('publicPages.supportNoMatch')}
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
            <h2 className="cs-heading text-4xl sm:text-5xl">{t('publicPages.supportOtherWays')}</h2>
            <p className="max-w-[56ch] text-lg leading-relaxed text-cs-ink-soft">{t('publicPages.supportOtherWaysBody')}</p>
          </div>
          <BentoShell className="auto-rows-auto">
            <BentoCard className="sm:col-span-2">
              <BentoIcon><Mail className="h-5 w-5" aria-hidden /></BentoIcon>
              <BentoTitle>{t('publicPages.email')}</BentoTitle>
              <BentoBody>
                <a href="mailto:support@codespectra.ai" className="font-medium text-cs-accent-text hover:underline">support@codespectra.ai</a>
              </BentoBody>
            </BentoCard>
            <BentoCard className="sm:col-span-2">
              <BentoIcon><Building className="h-5 w-5" aria-hidden /></BentoIcon>
              <BentoTitle>{t('publicPages.officesTitle')}</BentoTitle>
              <BentoBody>{t('publicPages.offices')}</BentoBody>
            </BentoCard>
          </BentoShell>

          <div className="mt-10 flex flex-col items-start gap-4 rounded-3xl bg-cs-accent p-8 text-cs-accent-ink sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-2xl font-bold">{t('publicPages.supportStillNeed')}</h3>
              <p className="mt-1 text-cs-accent-ink/90">{t('publicPages.supportStillNeedBody')}</p>
            </div>
            <Link
              href="/dashboard/support"
              className="inline-flex h-12 items-center justify-center rounded-full bg-white px-7 text-[15px] font-semibold text-[#1e40af] transition-[filter] hover:brightness-95"
            >
              {t('publicPages.supportContact')}
            </Link>
          </div>
        </div>
      </section>
    </PublicPageWrapper>
  )
}
