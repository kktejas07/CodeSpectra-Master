/**
 * GET /og?title=…&kind=job|event|hackathon|product|article|docs|company|compare|page&sub=…&s=<sig>
 * Branded 1200×630 Open Graph card used by every public page that has no
 * photo of its own (lib/seo/metadata ogImagePath).
 *
 * W4-12: parameters must carry our HMAC signature (`s`, lib/seo/og-sign.ts);
 * an unsigned or tampered request gets the generic brand card (no kind label,
 * no caller text) with a short cache. Rate limited per client.
 */
import { ImageResponse } from 'next/og'
import { verifyOg } from '@/lib/seo/og-sign'
import { limitRequest } from '@/lib/rate-limit'
import { ogCardText } from '@/lib/seo/og-text'

export const runtime = 'nodejs'

const KIND_LABEL: Record<string, string> = {
  page: 'CodeSpectra',
  default: 'CodeSpectra',
  article: 'CodeSpectra Learn',
  job: 'Job opening',
  event: 'Event',
  hackathon: 'Hackathon',
  product: 'Marketplace',
  docs: 'Documentation',
  company: 'Interview prep',
  compare: 'Comparison',
  certificate: 'Verified certificate',
}

const clip = (s: string | null, n: number) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n)

const DEFAULT_TITLE = 'Skills assessments that shortlist for you'

export async function GET(req: Request) {
  const limited = await limitRequest(req, 'og-image', null, 60, 60_000)
  if (limited) return limited
  const p = new URL(req.url).searchParams
  const signed = verifyOg({ title: p.get('title') || '', kind: p.get('kind') || '', sub: p.get('sub') || '' }, p.get('s'))
  const rawKind = signed ? p.get('kind') || 'page' : 'page'
  const kind = KIND_LABEL[rawKind] ? rawKind : 'page'
  // SEO-030: no Indic font / shaping in satori — older signed links with a Hindi or Telugu title get the Latin card.
  const card = ogCardText({ title: (signed ? clip(p.get('title'), 110) : '') || DEFAULT_TITLE, subtitle: signed ? clip(p.get('sub'), 120) : '', fallbackTitle: DEFAULT_TITLE })
  const title = card.title
  const sub = card.subtitle || ''
  const size = title.length > 70 ? 56 : title.length > 40 ? 66 : 76
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: '#0f1729', color: '#f8fafc', fontFamily: 'sans-serif', position: 'relative' }}>
        <div style={{ position: 'absolute', right: -120, top: -160, width: 560, height: 560, borderRadius: 9999, background: '#2f5be7', opacity: 0.35, display: 'flex' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: '#2f5be7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontWeight: 800, color: '#fff' }}>{'</>'}</div>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700 }}>CodeSpectra</div>
          {kind !== 'page' && kind !== 'default' ? (
            <div style={{ display: 'flex', marginLeft: 12, padding: '6px 18px', borderRadius: 9999, border: '2px solid #8aa8ff', color: '#8aa8ff', fontSize: 24, fontWeight: 600 }}>{KIND_LABEL[kind]}</div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', fontSize: size, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1, maxWidth: 1000 }}>{title}</div>
          {sub ? <div style={{ display: 'flex', fontSize: 30, color: '#cbd5e1', maxWidth: 1000 }}>{sub}</div> : null}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24, color: '#cbd5e1' }}>
          <div style={{ display: 'flex' }}>codespectra.ai</div>
          <div style={{ display: 'flex', width: 220, height: 8, borderRadius: 4, background: '#2f5be7' }} />
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { 'Cache-Control': signed ? 'public, max-age=86400, s-maxage=604800, immutable' : 'public, max-age=300' } },
  )
}
