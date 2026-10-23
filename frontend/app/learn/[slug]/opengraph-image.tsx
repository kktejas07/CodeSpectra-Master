/** Dynamic Open Graph image for a Learn post (title, category, level on the brand blue). */
import { ImageResponse } from 'next/og'
import { getPublishedPost } from '@/lib/learn/queries'
import { categoryLabel } from '@/lib/learn/types'
import { resolveLearnSlug } from '@/lib/learn/team-queries'
import { TEAM_LABEL, teamCategoryLabel } from '@/lib/learn/team-posts'
import { indicScript } from '@/lib/seo/og-text'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const alt = 'CodeSpectra Learn'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPublishedPost(slug).catch(() => null)
  // A "From the team" post (blog_posts) when no Learn post has this slug.
  const team = post ? null : (await resolveLearnSlug(slug, false).catch(() => null))?.post ?? null
  const raw = post?.title ?? team?.title ?? 'CodeSpectra Learn'
  // SEO-030: satori can't shape Hindi / Telugu; the localized title stays in og:title as text.
  const script = indicScript(raw)
  const title = script ? `A Learn post in ${script}` : raw
  const meta = post
    ? `${categoryLabel(post.category)} · ${post.level} · ${post.reading_minutes} min read`
    : team ? `${TEAM_LABEL} · ${teamCategoryLabel(team.category)} · ${team.read_minutes} min read` : 'Algorithms, system design and engineering practices'
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: '#2F5BE7', color: '#ffffff', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, opacity: 0.9 }}>CodeSpectra Learn</div>
        <div style={{ display: 'flex', fontSize: title.length > 60 ? 60 : 72, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1 }}>{title}</div>
        <div style={{ display: 'flex', fontSize: 28, opacity: 0.85 }}>{meta}</div>
      </div>
    ),
    { ...size },
  )
}
