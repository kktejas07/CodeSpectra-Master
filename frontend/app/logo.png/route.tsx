/** GET /logo.png — 512×512 raster logo for Organization/Article schema (Google wants a crawlable bitmap). */
import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'

export async function GET() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#2f5be7', borderRadius: 112 }}>
        <svg width="360" height="360" viewBox="0 0 32 32" fill="none">
          <path d="M11 10L5.5 16L11 22" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 10L26.5 16L21 22" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M18 7.5L14 24.5" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { width: 512, height: 512, headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=604800' } },
  )
}
