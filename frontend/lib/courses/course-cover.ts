/**
 * Per-course cover artwork, rendered on demand.
 *
 * Why: the catalog only ships 12 subject images, so every course that matched
 * no subject rule fell back to `web.jpg` — all Mechanical and Electrical
 * courses rendered the same web-dev mascot, and 15 SQL-family courses shared one
 * picture. This module draws a 16:9 poster from the course's own title, level
 * and subject palette, so those cards are distinct.
 *
 * It is deliberately image-generation-free: every configured provider key
 * (fal, Stability, Replicate, OpenAI) currently returns 401, so a text-rendered
 * poster is the only thing that works for all 236 courses today. Courses whose
 * subject DOES have real art keep it and never hit this route — see
 * `effectiveCourseCover()`.
 *
 * Upgrade path when an image key is restored: generate the background in
 * `composeCourseCover()` and keep `posterSvg()` as the text layer.
 */
import sharp from 'sharp'

export const COVER_W = 1200
export const COVER_H = 675

/** Deep, saturated gradients that sit beside the existing neon-on-dark artwork. */
const PALETTE: Record<string, [string, string, string]> = {
  sql: ['#022c22', '#065f46', '#34d399'],
  python: ['#172554', '#1e3a8a', '#facc15'],
  java: ['#431407', '#9a3412', '#fb923c'],
  cpp: ['#1e1b4b', '#4338ca', '#a5b4fc'],
  c: ['#0c1a3a', '#1d4ed8', '#93c5fd'],
  react: ['#082f49', '#0e7490', '#67e8f9'],
  javascript: ['#3b2f05', '#a16207', '#fde047'],
  devops: ['#082f49', '#0369a1', '#7dd3fc'],
  git: ['#431407', '#c2410c', '#fdba74'],
  web: ['#1e1b4b', '#6d28d9', '#c4b5fd'],
  system: ['#2e1065', '#6d28d9', '#d8b4fe'],
  os: ['#0f172a', '#334155', '#cbd5e1'],
}

function paletteFor(seed: string): [string, string, string] {
  if (PALETTE[seed]) return PALETTE[seed]
  // Stable hue from the subject text so two unrelated subjects never collide
  // by accident (they can still land close; the title carries the difference).
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360
  return [`hsl(${h} 55% 12%)`, `hsl(${h} 60% 28%)`, `hsl(${h} 85% 72%)`]
}

/** The palette is chosen per *subject* (category + first tag), not per title, so
 *  all Mechanical courses share a hue and differ from Electrical ones. */
function paletteSeed(course: CoverCourse): string {
  const firstTag = Array.isArray(course.tags) ? String(course.tags[0] || '') : ''
  return `${course.category || ''} ${firstTag} ${course.techStack || ''}`.trim().toLowerCase()
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Greedy wrap with a font size that shrinks as the title grows. */
export function wrapTitle(title: string): { lines: string[]; fontSize: number } {
  const clean = String(title || '')
    .replace(/\s+/g, ' ')
    .trim()
  const fontSize = clean.length <= 22 ? 72 : clean.length <= 38 ? 62 : 52
  const perLine = Math.max(12, Math.floor((COVER_W - 170) / (fontSize * 0.56)))
  const lines: string[] = []
  let cur = ''
  for (const w of clean.split(' ')) {
    if (!cur.length) cur = w
    else if (`${cur} ${w}`.length <= perLine) cur += ` ${w}`
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  if (lines.length > 3) {
    const kept = lines.slice(0, 3)
    kept[2] = lines.slice(2).join(' ')
    return { lines: kept, fontSize: Math.min(fontSize, 46) }
  }
  return { lines, fontSize }
}

export interface CoverCourse {
  id?: string
  title?: string
  level?: string
  category?: string
  techStack?: string
  tags?: string[]
  image?: string | null
  updated_at?: string
}

function eyebrowFor(course: CoverCourse): string {
  return [String(course.level || '').toUpperCase(), String(course.category || '').toUpperCase()]
    .filter(Boolean)
    .join('  ·  ')
    .slice(0, 42)
}

function posterSvg(course: CoverCourse): Buffer {
  const { lines, fontSize } = wrapTitle(course.title || 'Course')
  const [from, to, accent] = paletteFor(paletteSeed(course))
  const lineHeight = fontSize * 1.16
  const blockH = lines.length * lineHeight
  const titleTop = COVER_H - 92 - blockH + lineHeight * 0.78
  const eyebrow = eyebrowFor(course)
  const monogram = escapeXml(
    (course.title || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase(),
  )

  return Buffer.from(`<svg width="${COVER_W}" height="${COVER_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.78" cy="0.2" r="0.8">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.40"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.25" stop-color="#04060d" stop-opacity="0"/>
      <stop offset="1" stop-color="#04060d" stop-opacity="0.55"/>
    </linearGradient>
    <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="1.2" fill="#ffffff" fill-opacity="0.055"/>
    </pattern>
  </defs>
  <rect width="${COVER_W}" height="${COVER_H}" fill="url(#bg)"/>
  <rect width="${COVER_W}" height="${COVER_H}" fill="url(#glow)"/>
  <rect width="${COVER_W}" height="${COVER_H}" fill="url(#dots)"/>
  <text x="${COVER_W - 70}" y="250" text-anchor="end" font-family="DejaVu Sans, Noto Sans, Liberation Sans, Arial, sans-serif" font-size="230" font-weight="800" fill="#ffffff" fill-opacity="0.06">${monogram}</text>
  <rect width="${COVER_W}" height="${COVER_H}" fill="url(#scrim)"/>
  <rect x="64" y="${titleTop - fontSize}" width="7" height="${blockH}" rx="3.5" fill="${accent}"/>
  ${lines
    .map(
      (line, i) =>
        `<text x="94" y="${titleTop + i * lineHeight}" font-family="DejaVu Sans, Noto Sans, Liberation Sans, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`,
    )
    .join('\n  ')}
  ${eyebrow ? `<text x="94" y="${COVER_H - 40}" font-family="DejaVu Sans, Noto Sans, Liberation Sans, Arial, sans-serif" font-size="22" font-weight="600" fill="${accent}" letter-spacing="3.4">${escapeXml(eyebrow)}</text>` : ''}
</svg>`)
}

/** Render the 1200×675 JPEG for a course. */
export async function composeCourseCover(course: CoverCourse): Promise<Buffer> {
  return sharp(posterSvg(course)).jpeg({ quality: 86, mozjpeg: true }).toBuffer()
}
