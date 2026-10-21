import type { Metadata } from 'next'
import { cache } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BadgeCheck, ShieldCheck } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { JsonLd } from '@/components/seo/json-ld'
import { SkillList } from '@/components/passport/skill-list'
import { EmptyState } from '@/components/ui/empty-state'
import { publicPassportCached } from '@/lib/cache/passport'
import { canViewPassport, passportAccess, type PublicPassportView } from '@/lib/passport/db'
import { passportJsonLd } from '@/lib/passport/jsonld'
import { LEVEL_LABELS } from '@/lib/passport/core'
import { buildMetadata, PRIVATE_PAGE_METADATA } from '@/lib/seo/metadata'
import { getSiteOrigin } from '@/lib/seo/settings'
import { generateQrSvg } from '@/lib/qr'

// Per request (no DB at build). The heavy part (evidence → levels) comes from
// the data cache (15 min, purged on every settings change); who may see it is
// checked live on each request, so going private works at once.
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ handle: string }>; searchParams: Promise<{ k?: string | string[] }> }

const load = cache(async (handle: string): Promise<{ view: PublicPassportView; site: string } | null> => {
  const access = await passportAccess(handle)
  if (!access || access.visibility === 'private') return null
  const site = await getSiteOrigin()
  const view = await publicPassportCached(handle, site)
  if (!view) return null
  // Live state wins over a cached copy.
  return { view: { ...view, visibility: access.visibility, linkKey: access.linkKey }, site }
})

function keyOf(k: string | string[] | undefined): string | undefined {
  return Array.isArray(k) ? k[0] : k
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { handle } = await params
  const r = await load(handle.toLowerCase())
  if (!r || !canViewPassport(r.view, keyOf((await searchParams).k))) {
    return { title: { absolute: 'Skill passport | CodeSpectra' }, ...PRIVATE_PAGE_METADATA }
  }
  const { view } = r
  const top = view.skills.slice(0, 3).map((s) => `${s.skill} (${LEVEL_LABELS[s.level].toLowerCase()})`).join(', ')
  const description = top
    ? `${view.name}'s verified skills on CodeSpectra: ${top}. Levels come from proctored tests, contests and courses.`
    : `${view.name}'s verified skill passport on CodeSpectra.`
  const meta = buildMetadata({
    title: `${view.name}: verified skill passport`,
    description,
    path: `/p/${view.handle}`,
    kind: 'certificate',
    ogSubtitle: 'Verified by CodeSpectra',
    type: 'profile',
    // Only public passports are indexed; link-only ones never.
    noIndex: view.visibility === 'public' ? undefined : true,
  })
  return view.visibility === 'public' ? meta : { ...meta, ...PRIVATE_PAGE_METADATA }
}

export default async function PublicPassportPage({ params, searchParams }: Props) {
  const { handle } = await params
  const r = await load(handle.toLowerCase())
  if (!r) notFound()
  const { view, site } = r
  if (!canViewPassport(view, keyOf((await searchParams).k))) notFound()
  const verifyPath = `/verify/${encodeURIComponent(view.credentialId)}`
  const verifyUrl = `${site}${verifyPath}`
  const qr = await generateQrSvg(verifyUrl, { size: 144, margin: 1 })
  const issued = new Date(view.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  return (
    <PublicPageWrapper>
      {view.visibility === 'public' && (
        <JsonLd data={passportJsonLd({ site, handle: view.handle, name: view.name, verifyUrl, issuedAt: view.issuedAt, skills: view.skills })} />
      )}
      <div className="mx-auto max-w-[1000px] space-y-8 px-4 py-10 sm:px-6">
        <header className="flex flex-col gap-6 rounded-3xl border border-border/70 bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              <BadgeCheck className="h-4 w-4" aria-hidden /> Verified skill passport
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-balance text-foreground">{view.name}</h1>
            <p className="mt-2 max-w-[60ch] text-muted-foreground">
              Levels are worked out from results recorded on CodeSpectra — proctored tests count most, and older results count less over time. Skills the person typed in themselves are listed separately.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Credential issued {issued} ·{' '}
              <Link href={verifyPath} className="font-medium text-primary underline-offset-2 hover:underline">Check it’s authentic</Link>
            </p>
          </div>
          <figure className="shrink-0 self-start rounded-2xl border border-border/70 bg-white p-2 sm:self-center">
            {/* QR is generated server-side by the qrcode package (SVG markup only). */}
            <div className="h-36 w-36 [&_svg]:h-full [&_svg]:w-full" role="img" aria-label="QR code to verify this passport" dangerouslySetInnerHTML={{ __html: qr }} />
          </figure>
        </header>

        <section aria-labelledby="verified-skills" className="space-y-4">
          <h2 id="verified-skills" className="flex items-center gap-2 text-xl font-semibold text-foreground"><ShieldCheck className="h-5 w-5 text-primary" aria-hidden /> Verified skills</h2>
          {view.skills.length ? (
            <SkillList skills={view.skills} />
          ) : (
            <EmptyState compact illustration="certificate" title="No verified skills shared yet" description="This passport has no shared results yet." />
          )}
        </section>

        {view.selfReported && view.selfReported.length > 0 && (
          <section aria-labelledby="self-reported" className="space-y-3">
            <h2 id="self-reported" className="text-xl font-semibold text-foreground">Self-reported</h2>
            <p className="text-sm text-muted-foreground">Listed by the person on their profile. Not verified by CodeSpectra.</p>
            <ul className="flex flex-wrap gap-2">
              {view.selfReported.map((s) => <li key={s} className="rounded-full border border-dashed border-border px-3 py-1 text-sm capitalize text-muted-foreground">{s}</li>)}
            </ul>
          </section>
        )}
      </div>
    </PublicPageWrapper>
  )
}
