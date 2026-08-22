/**
 * Inline SVG cover art for Newsroom cards when no photo is uploaded.
 * Data URLs — no CDN dependency.
 */
export function blogCoverDataUrl(opts: {
  title: string
  category: string
  accent?: string
}): string {
  const title = escapeXml((opts.title || 'CodeSpectra').slice(0, 72))
  const cat = escapeXml((opts.category || 'Newsroom').toUpperCase().slice(0, 24))
  const accent = opts.accent || '#14b8a6'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="55%" stop-color="#0f2a24"/>
      <stop offset="100%" stop-color="#0c1a2e"/>
    </linearGradient>
    <radialGradient id="r" cx="80%" cy="20%" r="50%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#g)"/>
  <rect width="1280" height="720" fill="url(#r)"/>
  <circle cx="180" cy="560" r="220" fill="${accent}" fill-opacity="0.08"/>
  <text x="72" y="96" fill="${accent}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="22" font-weight="700" letter-spacing="3">${cat}</text>
  <foreignObject x="72" y="280" width="1100" height="280">
    <div xmlns="http://www.w3.org/1999/xhtml" style="color:#f8fafc;font-family:ui-sans-serif,system-ui,sans-serif;font-size:48px;font-weight:800;line-height:1.15;letter-spacing:-0.02em">${title}</div>
  </foreignObject>
  <text x="72" y="660" fill="#94a3b8" font-family="ui-sans-serif,system-ui,sans-serif" font-size="20">CodeSpectra Newsroom</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const CATEGORY_ACCENT: Record<string, string> = {
  product: '#14b8a6',
  signals: '#38bdf8',
  campus: '#a78bfa',
  engineering: '#34d399',
  careers: '#fbbf24',
  playbook: '#fb7185',
}

export function coverForPost(post: {
  title: string
  category?: string
  cover_image?: string | null
}) {
  if (post.cover_image) return post.cover_image
  const cat = post.category || 'product'
  return blogCoverDataUrl({
    title: post.title,
    category: cat,
    accent: CATEGORY_ACCENT[cat] || '#14b8a6',
  })
}
