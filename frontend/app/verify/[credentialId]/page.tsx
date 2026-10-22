import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { BadgeCheck, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { SkillList } from '@/components/passport/skill-list'
import { verifyPassportCredential, type VerifyResult } from '@/lib/passport/db'
import { PRIVATE_PAGE_METADATA } from '@/lib/seo/metadata'
import { getSiteOrigin } from '@/lib/seo/settings'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { resolveClientIp } from '@/lib/client-ip'
import { isProCredentialId } from '@/lib/pro-certs/pure'
import { ProCredentialVerify } from '@/components/pro-certs/credential-verify'
import { getRequestLocale } from '@/lib/i18n/server'

// Never cached: authenticity is checked live (signature + current nonce).
export const dynamic = 'force-dynamic'

// Shared on LinkedIn (its preview bot obeys robots), so: noindex + no-referrer, not robots-disallowed.
export const metadata: Metadata = {
  title: { absolute: 'Verify a credential | CodeSpectra' },
  description: 'Check that a CodeSpectra skill passport or certification credential is authentic and current.',
  ...PRIVATE_PAGE_METADATA,
}

type Props = { params: Promise<{ credentialId: string }> }

function Shell({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <PublicPageWrapper>
      <div className="mx-auto max-w-[900px] space-y-6 px-4 py-10 sm:px-6">
        <div className="rounded-3xl border border-border/70 bg-card p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
              <div className="mt-2 space-y-2 text-muted-foreground">{children}</div>
            </div>
          </div>
        </div>
      </div>
    </PublicPageWrapper>
  )
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export default async function VerifyPassportPage({ params }: Props) {
  const { credentialId } = await params
  let id = credentialId
  try { id = decodeURIComponent(credentialId) } catch { /* malformed escape: verify fails below */ }
  const ip = resolveClientIp(await headers())
  const rl = await rateLimitRedis(`passport-verify:${ip}`, 60, 60_000)
  if (!rl.ok) {
    return <Shell icon={<ShieldQuestion />} title="Too many checks">Wait a minute and open this link again.</Shell>
  }
  // Proctored certification credentials (CSC-…, lib/pro-certs) are verified from their own record.
  if (isProCredentialId(id)) {
    const locale = await getRequestLocale().catch(() => 'en' as const)
    try {
      const { verifyProCredential } = await import('@/lib/pro-certs/service')
      return <ProCredentialVerify c={await verifyProCredential(id)} locale={locale} />
    } catch (e) {
      console.error('[pro-certs] verify failed:', (e as Error)?.message)
      return <Shell icon={<ShieldQuestion />} title="We couldn’t check this right now">Please try again in a few minutes.</Shell>
    }
  }
  let r: VerifyResult
  try {
    r = await verifyPassportCredential(id, await getSiteOrigin())
  } catch (e) {
    console.error('[passport] verify failed:', (e as Error)?.message)
    return <Shell icon={<ShieldQuestion />} title="We couldn’t check this right now">Please try again in a few minutes.</Shell>
  }
  if (r.status === 'invalid') {
    return (
      <Shell icon={<ShieldAlert />} title="Not a valid credential">
        <p>This credential id was not issued by CodeSpectra, or it was changed. Ask the person for their current passport link.</p>
      </Shell>
    )
  }
  if (r.status === 'revoked') {
    return (
      <Shell icon={<ShieldAlert />} title="This credential is no longer current">
        <p>It was issued on {day(r.issuedAt)}, but the owner has since reset their passport links. Ask them for the current link.</p>
      </Shell>
    )
  }
  if (r.status === 'private') {
    return (
      <Shell icon={<BadgeCheck />} title="Authentic credential">
        <p>Issued by CodeSpectra to <span className="font-medium text-foreground">{r.name}</span> on {day(r.issuedAt)}.</p>
        <p>The owner has made their passport private, so the skill details are hidden.</p>
      </Shell>
    )
  }
  const viewHref = r.visibility === 'public' ? `/p/${r.handle}` : `/p/${r.handle}?k=${encodeURIComponent(r.linkKey)}`
  return (
    <PublicPageWrapper>
      <div className="mx-auto max-w-[1000px] space-y-6 px-4 py-10 sm:px-6">
        <div className="rounded-3xl border border-border/70 bg-card p-6">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-sm font-medium text-green-700 dark:text-green-400">
            <ShieldCheck className="h-4 w-4" aria-hidden /> Authentic and current
          </p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">{r.name}</h1>
          <p className="mt-2 text-muted-foreground">
            Skill passport issued by CodeSpectra on {day(r.issuedAt)}. The levels below are worked out live from results recorded on the platform.
          </p>
          <Link href={viewHref} className="mt-3 inline-block text-sm font-medium text-primary underline-offset-2 hover:underline">Open the full passport</Link>
        </div>
        {r.skills.length ? <SkillList skills={r.skills} /> : <p className="text-muted-foreground">No verified skills are shared on this passport yet.</p>}
      </div>
    </PublicPageWrapper>
  )
}
