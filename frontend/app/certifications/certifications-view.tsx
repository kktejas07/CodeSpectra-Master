import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Award, Clock, ListChecks, RefreshCw, ShieldCheck, Target } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { HeroIllustration, PageHero } from '@/components/landing/page-hero'
import { EmptyState } from '@/components/ui/empty-state'
import { buildMetadata } from '@/lib/seo/metadata'
import { publicPageMetadata } from '@/lib/i18n/public-page'
import { formatMinor } from '@/lib/marketplace/pricing'
import { programBySlugCached, publishedProgramsCached } from '@/lib/pro-certs/public-cache'
import type { PublicProgram } from '@/lib/pro-certs/types'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/public-paths'
import { publicT, type PublicTranslator } from '@/lib/i18n/public-server'

// Proctored certification catalog for every language (English: app/certifications,
// hi / te: app/[lang]/certifications). Cached list (lib/pro-certs/public-cache.ts),
// purged when an admin saves or publishes a certification.

export function certificationsMetadata(locale: Locale): Metadata {
  return publicPageMetadata('/certifications', locale, { kind: 'product' })
}

function price(p: PublicProgram, t: PublicTranslator): string {
  const parts = (['INR', 'USD'] as const).filter((c) => p.price[c] !== null).map((c) => formatMinor(p.price[c] as number, c))
  return parts.length ? t('hubs.certPricePerAttempt', { price: parts.join(' / ') }) : ''
}

export async function CertificationsView({ locale }: { locale: Locale }) {
  const t = publicT(locale)
  let list: PublicProgram[] = []
  let failed = false
  try { list = await publishedProgramsCached() } catch (e) { failed = true; console.error('[certifications] catalog failed', (e as Error)?.message) }
  return (
    <PublicPageWrapper>
      <PageHero title={t('hubs.certTitle')} lead={t('hubs.certLead')} art={<HeroIllustration spot="certificate" />} />
      <div className="mx-auto w-full min-w-0 max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
        <ul className="mb-10 grid gap-4 sm:grid-cols-3">
          {([[ShieldCheck, 'hubs.certWhyProctored', 'hubs.certWhyProctoredBody'], [Award, 'hubs.certWhyVerify', 'hubs.certWhyVerifyBody'], [RefreshCw, 'hubs.certWhyRenew', 'hubs.certWhyRenewBody']] as const).map(([Icon, title, body]) => (
            <li key={title} className="rounded-2xl border border-border/70 bg-card p-5">
              <Icon className="h-5 w-5 text-primary" aria-hidden />
              <h2 className="mt-2 font-semibold text-foreground">{t(title)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t(body)}</p>
            </li>
          ))}
        </ul>
        {failed ? (
          <EmptyState illustration="error" title={t('hubs.certLoadFailed')} description={t('hubs.certLoadFailedBody')} />
        ) : list.length === 0 ? (
          <EmptyState illustration="certificate" title={t('hubs.certEmpty')} description={t('hubs.certEmptyBody')} />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => (
              <li key={p.id}>
                <Link href={localizedPath(`/certifications/${p.slug}`, locale)} className="flex h-full flex-col rounded-3xl border border-border/70 bg-card p-6 transition-shadow duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none">
                  <span className="w-max rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{t.dyn(`hubs.certLevel:${p.level}`, p.level)}</span>
                  <h2 className="mt-3 text-lg font-semibold text-foreground">{p.title}</h2>
                  <p className="mt-1 flex-1 text-sm text-muted-foreground">{p.summary}</p>
                  <p className="mt-4 text-sm tabular-nums text-muted-foreground">{t('hubs.certFacts', { questions: p.questions, minutes: p.duration_min, pass: p.pass_percent })}</p>
                  {price(p, t) && <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{price(p, t)}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicPageWrapper>
  )
}

export async function certificationMetadata(slug: string, locale: Locale): Promise<Metadata> {
  const t = publicT(locale)
  const p = await programBySlugCached(slug).catch(() => null)
  if (!p) return buildMetadata({ title: t('hubs.certTitle'), description: t('hubs.certLead'), path: '/certifications', locale, noIndex: true })
  return buildMetadata({ title: t('hubs.certDetailMetaTitle', { title: p.title }), description: p.summary, path: `/certifications/${p.slug}`, locale, kind: 'product' })
}

export async function CertificationDetailView({ slug, locale }: { slug: string; locale: Locale }) {
  const t = publicT(locale)
  const p = await programBySlugCached(slug)
  if (!p) notFound()
  const facts = [
    [ListChecks, t('hubs.certQuestions'), String(p.questions)],
    [Clock, t('hubs.certDuration'), t('hubs.certMinutes', { count: p.duration_min })],
    [Target, t('hubs.certPassMark'), `${p.pass_percent}%`],
    [Award, t('hubs.certValidity'), t('hubs.certMonths', { count: p.validity_months })],
  ] as const
  return (
    <PublicPageWrapper>
      <PageHero
        title={p.title}
        lead={p.summary}
        actions={
          <Link href={`/dashboard/certifications/proctored/${p.slug}`} className="inline-flex h-12 items-center rounded-full bg-cs-accent px-6 text-sm font-semibold text-cs-accent-ink hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t('hubs.certCta')}
          </Link>
        }
        art={<HeroIllustration spot="certificate" />}
      />
      <div className="mx-auto w-full min-w-0 max-w-[1000px] space-y-8 px-4 py-10 sm:px-6">
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {facts.map(([Icon, label, value]) => (
            <div key={label} className="rounded-2xl border border-border/70 bg-card p-4">
              <dt className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="h-4 w-4 text-primary" aria-hidden />{label}</dt>
              <dd className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
        {p.description && <p className="whitespace-pre-line text-muted-foreground">{p.description}</p>}
        <section className="rounded-3xl border border-border/70 bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">{t('hubs.certWhatsInside')}</h2>
          <ul className="mt-3 divide-y divide-border">
            {p.sections.map((s) => (
              <li key={s.name} className="flex justify-between py-2 text-sm"><span className="text-foreground">{s.name}</span><span className="tabular-nums text-muted-foreground">{t('hubs.certQuestionsCount', { count: s.questions })}</span></li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">{t('hubs.certSkillsLine', { skills: p.skills.join(', ') })}</p>
        </section>
        <section className="rounded-3xl border border-border/70 bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">{t('hubs.certRules')}</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>{t('hubs.certRuleProctored')}</li>
            <li>{t('hubs.certRuleReview')}</li>
            <li>{t('hubs.certRuleAttempts', { days: p.attempts.cooldown_days, max: p.attempts.max_per_year })}</li>
            <li>{t('hubs.certRuleRenew', { count: p.validity_months })}</li>
          </ul>
          {price(p, t) && <p className="mt-4 font-semibold tabular-nums text-foreground">{price(p, t)}</p>}
        </section>
      </div>
    </PublicPageWrapper>
  )
}
