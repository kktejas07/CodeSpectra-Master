/**
 * GET /api/admin/social/card/<id>?size=landscape|square|story[&download=1]
 * Branded share card for a queued item (superadmin): 1200×627 (LinkedIn, X,
 * Facebook), 1080×1080 (Instagram post), 1080×1920 (Instagram / WhatsApp
 * status). Same approach and brand tokens as the public OG card (app/og):
 * next/og ImageResponse with the title, key facts from the item's own record
 * and the logo mark. Publisher images are never drawn into the card (they are
 * only linked and credited in the studio).
 */
import { ImageResponse } from 'next/og'
import { NextResponse, type NextRequest } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { factLines } from '@/lib/social/queue'
import { getQueueItem } from '@/lib/social/store'
import { CARD_SIZES, isCardSize, type SocialItemType } from '@/lib/social/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

// Brand tokens (globals.css / app/og): royal blue on deep navy.
const BRAND = '#2f5be7'
const NAVY = '#0f1729'
const SOFT = '#cbd5e1'
const ACCENT = '#8aa8ff'

const KIND: Record<SocialItemType, string> = {
  event: 'Coding event', news: 'Tech news', learn: 'CodeSpectra Learn', contest: 'Contest', hackathon: 'Hackathon', codeathon: 'Codeathon',
  certification: 'Certification', company_test: 'Company practice test', roundup: 'Weekly roundup',
}
const FACT_LABEL: Record<string, string> = { starts: 'Starts', ends: 'Ends', deadline: 'Register by', prize: 'Prizes', mode: 'Mode', city: 'City', organiser: 'By', company: 'Company', level: 'Level', duration: 'Duration' }

export async function GET(req: NextRequest, { params }: Ctx) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await params
  const sp = new URL(req.url).searchParams
  const sizeKey = isCardSize(sp.get('size')) ? (sp.get('size') as keyof typeof CARD_SIZES) : 'landscape'
  const item = await getQueueItem(id).catch(() => null)
  if (!item) return NextResponse.json(apiErrorFor('not_found'), { status: 404 })

  const { width, height } = CARD_SIZES[sizeKey]
  const tall = sizeKey === 'story'
  const wide = sizeKey === 'landscape'
  const pad = wide ? 64 : 80
  const title = item.title.replace(/\s+/g, ' ').trim().slice(0, 140)
  const base = wide ? 64 : tall ? 92 : 80
  const titleSize = title.length > 90 ? base * 0.68 : title.length > 55 ? base * 0.82 : base
  const facts = factLines(item.facts).filter((f) => ['starts', 'deadline', 'prize', 'mode', 'city', 'company', 'level', 'duration'].includes(f.key)).slice(0, wide ? 3 : 4)
  const list = (item.facts.items || []).slice(0, tall ? 6 : wide ? 3 : 5)
  const host = (() => { try { return new URL(item.url).host } catch { return 'codespectra.ai' } })()
  const factFont = wide ? 26 : 34

  const img = new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: pad, background: NAVY, color: '#f8fafc', fontFamily: 'sans-serif', position: 'relative' }}>
        <div style={{ position: 'absolute', right: -160, top: -200, width: wide ? 560 : 760, height: wide ? 560 : 760, borderRadius: 9999, background: BRAND, opacity: 0.35, display: 'flex' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: wide ? 60 : 76, height: wide ? 60 : 76, borderRadius: 16, background: BRAND, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: wide ? 32 : 40, fontWeight: 800, color: '#fff' }}>{'</>'}</div>
          <div style={{ display: 'flex', fontSize: wide ? 30 : 38, fontWeight: 700 }}>CodeSpectra</div>
          <div style={{ display: 'flex', marginLeft: 12, padding: '6px 18px', borderRadius: 9999, border: `2px solid ${ACCENT}`, color: ACCENT, fontSize: wide ? 22 : 28, fontWeight: 600 }}>{KIND[item.type]}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: tall ? 48 : 28 }}>
          <div style={{ display: 'flex', fontSize: titleSize, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1, maxWidth: width - pad * 2 }}>{title}</div>
          {list.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {list.map((i, n) => (
                <div key={i.id} style={{ display: 'flex', fontSize: factFont, color: SOFT }}>{`${n + 1}. ${i.title.slice(0, wide ? 70 : 60)}`}</div>
              ))}
            </div>
          ) : null}
          {facts.length ? (
            <div style={{ display: 'flex', flexDirection: wide ? 'row' : 'column', flexWrap: 'wrap', gap: wide ? 16 : 20 }}>
              {facts.map((f) => (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: wide ? '10px 20px' : '14px 26px', borderRadius: 18, background: 'rgba(47,91,231,0.28)', border: '2px solid rgba(138,168,255,0.45)', fontSize: factFont }}>
                  <div style={{ display: 'flex', color: ACCENT, fontWeight: 600 }}>{FACT_LABEL[f.key]}</div>
                  <div style={{ display: 'flex', fontWeight: 700 }}>{f.value.slice(0, 40)}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: wide ? 24 : 30, color: SOFT }}>
          <div style={{ display: 'flex' }}>{host}</div>
          <div style={{ display: 'flex', width: wide ? 220 : 260, height: 8, borderRadius: 4, background: BRAND }} />
        </div>
      </div>
    ),
    { width, height },
  )
  const headers = new Headers(img.headers)
  headers.set('Cache-Control', 'private, no-store')
  if (sp.get('download') === '1') headers.set('Content-Disposition', `attachment; filename="codespectra-${item.type}-${sizeKey}-${item.id.slice(3, 11)}.png"`)
  return new Response(img.body, { status: 200, headers })
}
