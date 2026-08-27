import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { backendComplete } from '@/lib/ai/backend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function parseJsonObject(res: { ok: boolean; json?: unknown; text?: string; raw?: string }): Record<string, unknown> | null {
  if (!res.ok) return null
  if (res.json && typeof res.json === 'object') return res.json as Record<string, unknown>
  try {
    const t = String(res.text || res.raw || '').trim()
    const start = t.indexOf('{')
    const end = t.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>
  } catch {}
  return null
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = await req.json().catch(() => ({}))
  const topic = String(body.topic || '').trim()
  if (!topic) return NextResponse.json({ error: 'topic required' }, { status: 400 })

  const pageCount = typeof body.pageCount === 'number' ? body.pageCount : 12

  try {
    const res = await backendComplete({
      systemMessage: `You are an ebook outline generator. Create a structured outline for an educational ebook.
Return strict JSON only:
{
  "outline": [
    {"id": "1", "title": "Chapter Title", "type": "section", "description": "Brief description of what this chapter covers"},
    {"id": "2", "title": "Another Chapter", "type": "infographic", "description": "Description"}
  ]
}
Available types: cover, toc, section, infographic, code, quiz, timeline, callout, journey, tips, compare, stats
Rules:
- Generate exactly ${pageCount} chapters.
- Use a MIX of types: sections, infographics, code examples, quizzes, timelines, callouts, tips, compares, stats, journeys.
- Make it engaging with visual variety.
- Each chapter should have a clear, descriptive title.
- Brief description of what each chapter covers.`,
      userMessage: `Topic: ${topic}\nSuggested title: ${body.title || topic}\nTarget chapters: ${pageCount}`,
      modelRole: 'fast',
      responseFormat: 'json',
      feature: 'ebook-outline',
    })

    const obj = parseJsonObject(res)
    if (!obj || !Array.isArray(obj.outline)) {
      throw new Error('Failed to generate outline')
    }

    const outline = obj.outline.map((item: any, idx: number) => ({
      id: String(idx + 1),
      title: String(item.title || `Chapter ${idx + 1}`),
      type: String(item.type || 'section'),
      description: String(item.description || ''),
    }))

    return NextResponse.json({ ok: true, outline })
  } catch (e) {
    return NextResponse.json(
      { error: `Outline generation failed: ${e instanceof Error ? e.message : 'Unknown error'}` },
      { status: 502 }
    )
  }
}
