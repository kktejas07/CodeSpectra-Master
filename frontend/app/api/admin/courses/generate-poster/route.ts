import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Tech stack colors for consistent branding
const TECH_COLORS: Record<string, { primary: string; secondary: string; accent: string }> = {
  'cpp': { primary: '#659AD2', secondary: '#00599C', accent: '#f8fafc' },
  'c++': { primary: '#659AD2', secondary: '#00599C', accent: '#f8fafc' },
  'java': { primary: '#F89820', secondary: '#E76F00', accent: '#1a1a2e' },
  'python': { primary: '#3776AB', secondary: '#FFD43B', accent: '#f8fafc' },
  'javascript': { primary: '#F7DF1E', secondary: '#323330', accent: '#1a1a2e' },
  'typescript': { primary: '#3178C6', secondary: '#235A97', accent: '#f8fafc' },
  'react': { primary: '#61DAFB', secondary: '#20232A', accent: '#f8fafc' },
  'nextjs': { primary: '#000000', secondary: '#333333', accent: '#f8fafc' },
  'nodejs': { primary: '#339933', secondary: '#1a1a2e', accent: '#f8fafc' },
  'go': { primary: '#00ADD8', secondary: '#007D9C', accent: '#f8fafc' },
  'rust': { primary: '#CE422B', secondary: '#1a1a2e', accent: '#f8fafc' },
  'sql': { primary: '#4479A1', secondary: '#1a1a2e', accent: '#f8fafc' },
  'docker': { primary: '#2496ED', secondary: '#1a1a2e', accent: '#f8fafc' },
  'kubernetes': { primary: '#326CE5', secondary: '#1a1a2e', accent: '#f8fafc' },
  'aws': { primary: '#FF9900', secondary: '#1a1a2e', accent: '#f8fafc' },
  'default': { primary: '#6366F1', secondary: '#4F46E5', accent: '#f8fafc' },
}

function getTechColors(techStack: string) {
  const lower = techStack.toLowerCase()
  for (const [key, colors] of Object.entries(TECH_COLORS)) {
    if (lower.includes(key)) return colors
  }
  return TECH_COLORS.default
}

// Simple SVG poster generation (no external deps needed)
function generatePosterSVG(
  title: string,
  techStack: string,
  level: string,
  moduleCount: number,
  totalLessons: number
): string {
  const colors = getTechColors(techStack)
  const shortTitle = title.length > 40 ? title.slice(0, 37) + '...' : title

  return `<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${colors.secondary};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${colors.primary};stop-opacity:1" />
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  
  <!-- Background -->
  <rect width="1280" height="720" fill="url(#bg)"/>
  
  <!-- Decorative circles -->
  <circle cx="1100" cy="100" r="200" fill="white" opacity="0.05"/>
  <circle cx="200" cy="600" r="150" fill="white" opacity="0.05"/>
  <circle cx="900" cy="500" r="100" fill="white" opacity="0.08"/>
  
  <!-- Grid pattern -->
  <g opacity="0.1">
    ${Array.from({ length: 20 }, (_, i) => `<line x1="${i * 64}" y1="0" x2="${i * 64}" y2="720" stroke="white" stroke-width="1"/>`).join('\n    ')}
    ${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="${i * 60}" x2="1280" y2="${i * 60}" stroke="white" stroke-width="1"/>`).join('\n    ')}
  </g>
  
  <!-- CodeSpectra logo area -->
  <rect x="60" y="50" width="200" height="40" rx="8" fill="white" opacity="0.15"/>
  <text x="160" y="77" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" fill="white" text-anchor="middle" opacity="0.9">CodeSpectra</text>
  
  <!-- Level badge -->
  <rect x="60" y="120" width="${level.length * 14 + 30}" height="36" rx="18" fill="white" opacity="0.2"/>
  <text x="${60 + (level.length * 14 + 30) / 2}" y="144" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="white" text-anchor="middle">${level.toUpperCase()}</text>
  
  <!-- Main title -->
  <text x="640" y="320" font-family="system-ui, sans-serif" font-size="56" font-weight="bold" fill="white" text-anchor="middle" filter="url(#glow)">
    ${shortTitle.split('').map((c, i) => `<tspan x="640" dy="${i === 0 ? 0 : 68}">${c}</tspan>`).join('')}
  </text>
  
  <!-- Stats -->
  <g transform="translate(640, 520)">
    <rect x="-200" y="-30" width="120" height="60" rx="8" fill="white" opacity="0.15"/>
    <text x="-140" y="-5" font-family="system-ui, sans-serif" font-size="28" font-weight="bold" fill="white" text-anchor="middle">${moduleCount}</text>
    <text x="-140" y="18" font-family="system-ui, sans-serif" font-size="12" fill="white" text-anchor="middle" opacity="0.7">MODULES</text>
    
    <rect x="-40" y="-30" width="120" height="60" rx="8" fill="white" opacity="0.15"/>
    <text x="20" y="-5" font-family="system-ui, sans-serif" font-size="28" font-weight="bold" fill="white" text-anchor="middle">${totalLessons}</text>
    <text x="20" y="18" font-family="system-ui, sans-serif" font-size="12" fill="white" text-anchor="middle" opacity="0.7">LESSONS</text>
    
    <rect x="80" y="-30" width="120" height="60" rx="8" fill="white" opacity="0.15"/>
    <text x="140" y="-5" font-family="system-ui, sans-serif" font-size="28" font-weight="bold" fill="white" text-anchor="middle">AI</text>
    <text x="140" y="18" font-family="system-ui, sans-serif" font-size="12" fill="white" text-anchor="middle" opacity="0.7">GENERATED</text>
  </g>
  
  <!-- Tech stack icon area -->
  <rect x="540" y="600" width="200" height="50" rx="25" fill="white" opacity="0.2"/>
  <text x="640" y="632" font-family="system-ui, sans-serif" font-size="18" font-weight="600" fill="white" text-anchor="middle">${techStack}</text>
</svg>`
}

export async function POST(request: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { courseId } = await request.json()

    if (!courseId) {
      return NextResponse.json({ error: 'courseId required' }, { status: 400 })
    }

    const db = await getMongoDb()
    const course = await db.collection('courses').findOne({ id: courseId })
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

    const sections = course.sections || []
    const totalLessons = sections.reduce((sum: number, s: any) => sum + (s.lessons?.length || 0), 0)

    const svg = generatePosterSVG(
      course.title || courseId,
      course.tags?.[0] || courseId,
      course.level || 'beginner',
      sections.length,
      totalLessons
    )

    // Store the SVG as the course image
    const svgBase64 = Buffer.from(svg).toString('base64')
    const imageUrl = `data:image/svg+xml;base64,${svgBase64}`

    // Update course with generated poster
    await db.collection('courses').updateOne(
      { id: courseId },
      { $set: { image: imageUrl, updated_at: new Date().toISOString() } }
    )

    return NextResponse.json({
      success: true,
      imageUrl,
      message: `Generated poster for "${course.title}"`,
    })

  } catch (e) {
    console.error('[generate-poster] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
