/**
 * In-app Guide drawer content (components/tour/guide-content.ts) as help docs:
 * one source per guide id, `guide:<id>`, linked to the page it explains
 * (lib/tour-paths.ts). It is the same text any viewer of the page already
 * sees, so it is public (support + public assistants answer "how do I…" from
 * it) — except guides for /dashboard/admin/* pages, which are superadmin only.
 */
import { GUIDE_CONTENT, type GuideContent } from '@/components/tour/guide-content'
import { TOUR_ID_FOR_PATHS } from '@/lib/tour-paths'
import type { ExtractedSource } from '../types'

/** Guide id → the dashboard paths that open it, most specific first. */
export function guidePaths(id: string, map: Record<string, string> = TOUR_ID_FOR_PATHS): string[] {
  return Object.entries(map)
    .filter(([, g]) => g === id)
    .map(([p]) => p)
    .sort((a, b) => Number(a.includes('[')) - Number(b.includes('[')) || a.length - b.length)
}

export function guideToMarkdown(g: GuideContent, paths: readonly string[]): string {
  const out = [g.about]
  if (paths.length) out.push(`Where: ${paths.join(', ')}`)
  for (const f of g.features) out.push(`## ${f.title}\n\n${f.text}`)
  if (g.tips.length) out.push(`## Tips\n\n${g.tips.map((t) => `- ${t}`).join('\n')}`)
  return out.join('\n\n')
}

export function listGuideIds(content: Record<string, GuideContent> = GUIDE_CONTENT): string[] {
  return Object.keys(content).map((id) => `guide:${id}`)
}

export function guideSource(
  sourceId: string,
  content: Record<string, GuideContent> = GUIDE_CONTENT,
  map: Record<string, string> = TOUR_ID_FOR_PATHS,
): ExtractedSource | null {
  const id = sourceId.startsWith('guide:') ? sourceId.slice(6) : ''
  const g = Object.hasOwn(content, id) ? content[id] : undefined
  if (!g) return null
  const paths = guidePaths(id, map)
  const adminOnly = paths.length > 0 && paths.every((p) => p.startsWith('/dashboard/admin'))
  return {
    type: 'doc',
    source_id: sourceId,
    tenant_id: null,
    visibility: adminOnly ? 'platform_admin' : 'public',
    title: `${g.title} (in-app guide)`,
    // Dynamic paths ([id]) can't be linked; the list page is the entry point.
    url: paths.find((p) => !p.includes('[')) ?? null,
    text: guideToMarkdown(g, paths),
    metadata: { kind: 'guide', guide_id: id, paths },
    // No splitOnSection: a guide is a few hundred tokens, and one chunk per feature
    // (1–2 sentences each) quadrupled the chunk count and diluted every hit.
  }
}
