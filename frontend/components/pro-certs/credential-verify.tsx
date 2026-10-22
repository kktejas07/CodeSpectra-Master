/**
 * Public verification of a proctored certification credential (CSC-…), shown
 * by /verify/[credentialId]. Server component; live read (never cached), so a
 * revoked or renewed credential shows that at once.
 */
import Link from 'next/link'
import { BadgeCheck, ShieldAlert, ShieldCheck } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import type { PublicCredentialView } from '@/lib/pro-certs/service'
import { publicT } from '@/lib/i18n/public-server'
import type { Locale } from '@/lib/i18n/config'
import { formatDate } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/public-paths'

export function ProCredentialVerify({ c, locale }: { c: PublicCredentialView | null; locale: Locale }) {
  const t = publicT(locale)
  const day = (iso: string) => formatDate(locale, iso, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  if (!c) {
    return (
      <Frame>
        <Head icon={<ShieldAlert />} title={t('hubs.certVerifyInvalidTitle')} />
        <p className="mt-2 text-muted-foreground">{t('hubs.certVerifyInvalidBody')}</p>
      </Frame>
    )
  }
  const good = c.state === 'valid'
  const badge = {
    valid: t('hubs.certVerifyValid'),
    expired: t('hubs.certVerifyExpired', { date: day(c.expires_at) }),
    revoked: t('hubs.certVerifyRevoked'),
    renewed: t('hubs.certVerifyRenewed'),
  }[c.state]
  return (
    <Frame>
      <p className={good
        ? 'inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-sm font-medium text-green-700 dark:text-green-400'
        : 'inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-sm font-medium text-amber-800 dark:text-amber-300'}>
        {good ? <ShieldCheck className="h-4 w-4" aria-hidden /> : <ShieldAlert className="h-4 w-4" aria-hidden />} {badge}
      </p>
      <Head icon={<BadgeCheck />} title={c.title} />
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <Row label={t('hubs.certVerifyHolder')} value={c.holder_name} />
        <Row label={t('hubs.certVerifyCredentialId')} value={<span className="font-mono">{c.id}</span>} />
        <Row label={t('hubs.certVerifyIssued')} value={day(c.issued_at)} />
        <Row label={t('hubs.certVerifyExpires')} value={day(c.expires_at)} />
        <Row label={t('hubs.certLevel')} value={t.dyn(`hubs.certLevel:${c.level}`, c.level)} />
        <Row label={t('hubs.certSkills')} value={c.skills.join(', ')} />
      </dl>
      <p className="mt-4 text-sm text-muted-foreground">{t('hubs.certVerifyHow')}</p>
      {c.renewed_by && (
        <Link href={`/verify/${c.renewed_by}`} className="mt-3 inline-block text-sm font-medium text-primary underline-offset-2 hover:underline">{t('hubs.certVerifyOpenCurrent')}</Link>
      )}
      <Link href={localizedPath(`/certifications/${c.program_slug}`, locale)} className="mt-3 block text-sm font-medium text-primary underline-offset-2 hover:underline">{t('hubs.certVerifyAbout')}</Link>
    </Frame>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <PublicPageWrapper>
      <div className="mx-auto max-w-[900px] px-4 py-10 sm:px-6">
        <div className="rounded-3xl border border-border/70 bg-card p-6">{children}</div>
      </div>
    </PublicPageWrapper>
  )
}

function Head({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mt-3 flex items-start gap-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/60 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  )
}
