import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import type { Filter } from 'mongodb'

/**
 * GET /api/scanner/metrics/files
 * File-level metrics read from the real `file_metrics` Mongo collection
 * (written by POST /api/scanner/metrics), enriched with per-file issue
 * counts aggregated from `code_issues`. Filenames and LOC numbers are
 * never synthesized — fields with no stored data are returned as null,
 * and an empty store returns an empty list with an explanatory message.
 */

interface FileMetricDoc {
  id: string
  scan_id?: string | null
  project_id?: string | null
  user_id: string
  file_path: string
  lines_of_code?: number | null
  language?: string | null
  complexity?: number | null
  created_at?: string
}

interface FileRow {
  id: string
  projectId: string | null
  scanId: string | null
  filePath: string
  fileLanguage: string | null
  linesOfCode: number | null
  linesOfComments: number | null
  linesOfTests: number | null
  complexity: number | null
  cognitivComplexity: number | null
  bugs: number
  vulnerabilities: number
  codeSmells: number
  securityHotspots: number
  coverage: number | null
  duplication: number | null
  createdAt?: string
}

async function fetchFileRows(
  userId: string,
  projectId: string | null,
  scanId: string | null,
): Promise<{ rows: FileRow[]; aggregatedFromIssues: boolean }> {
  const db = await getMongoDb()

  const metricFilter: Filter<FileMetricDoc> = { user_id: userId }
  if (projectId) metricFilter.project_id = projectId
  if (scanId) metricFilter.scan_id = scanId

  const metrics = await db
    .collection<FileMetricDoc>('file_metrics')
    .find(metricFilter)
    .sort({ lines_of_code: -1 })
    .limit(1000)
    .toArray()

  // Per-file issue counts aggregated from real findings in the same scope.
  const issueFilter: Record<string, unknown> = { user_id: userId }
  if (projectId) issueFilter.project_id = projectId
  if (scanId) issueFilter.scan_id = scanId
  const issueAgg = await db
    .collection('code_issues')
    .aggregate([
      { $match: issueFilter },
      {
        $group: {
          _id: '$file_path',
          bugs: { $sum: { $cond: [{ $eq: ['$type', 'bug'] }, 1, 0] } },
          vulnerabilities: { $sum: { $cond: [{ $eq: ['$type', 'vulnerability'] }, 1, 0] } },
          codeSmells: { $sum: { $cond: [{ $eq: ['$type', 'code_smell'] }, 1, 0] } },
          securityHotspots: { $sum: { $cond: [{ $eq: ['$type', 'security_hotspot'] }, 1, 0] } },
        },
      },
    ])
    .toArray()
  const issueCounts: Record<string, { bugs: number; vulnerabilities: number; codeSmells: number; securityHotspots: number }> = {}
  for (const g of issueAgg) {
    if (typeof g._id !== 'string' || !g._id) continue
    issueCounts[g._id] = {
      bugs: typeof g.bugs === 'number' ? g.bugs : 0,
      vulnerabilities: typeof g.vulnerabilities === 'number' ? g.vulnerabilities : 0,
      codeSmells: typeof g.codeSmells === 'number' ? g.codeSmells : 0,
      securityHotspots: typeof g.securityHotspots === 'number' ? g.securityHotspots : 0,
    }
  }

  if (metrics.length > 0) {
    return {
      aggregatedFromIssues: false,
      rows: metrics.map((m) => {
        const counts = issueCounts[m.file_path] || { bugs: 0, vulnerabilities: 0, codeSmells: 0, securityHotspots: 0 }
        return {
          id: m.id,
          projectId: m.project_id ?? projectId,
          scanId: m.scan_id ?? scanId,
          filePath: m.file_path,
          fileLanguage: m.language ?? null,
          linesOfCode: typeof m.lines_of_code === 'number' ? m.lines_of_code : null,
          linesOfComments: null,
          linesOfTests: null,
          complexity: typeof m.complexity === 'number' ? m.complexity : null,
          cognitivComplexity: null,
          bugs: counts.bugs,
          vulnerabilities: counts.vulnerabilities,
          codeSmells: counts.codeSmells,
          securityHotspots: counts.securityHotspots,
          coverage: null,
          duplication: null,
          createdAt: m.created_at,
        }
      }),
    }
  }

  // No stored per-file metrics: fall back to rows grouped from real issues
  // (LOC and other unmeasured fields stay null — never fabricated).
  const rows: FileRow[] = Object.entries(issueCounts).map(([filePath, counts], i) => ({
    id: `issues:${i}`,
    projectId,
    scanId,
    filePath,
    fileLanguage: null,
    linesOfCode: null,
    linesOfComments: null,
    linesOfTests: null,
    complexity: null,
    cognitivComplexity: null,
    bugs: counts.bugs,
    vulnerabilities: counts.vulnerabilities,
    codeSmells: counts.codeSmells,
    securityHotspots: counts.securityHotspots,
    coverage: null,
    duplication: null,
  }))
  return { rows, aggregatedFromIssues: true }
}

const SORT_GETTERS: Record<string, (r: FileRow) => number | string> = {
  lines_of_code: (r) => r.linesOfCode ?? -1,
  linesOfCode: (r) => r.linesOfCode ?? -1,
  complexity: (r) => r.complexity ?? -1,
  bugs: (r) => r.bugs,
  vulnerabilities: (r) => r.vulnerabilities,
  file_path: (r) => r.filePath || '',
  filePath: (r) => r.filePath || '',
  issues: (r) => r.bugs + r.vulnerabilities + r.codeSmells + r.securityHotspots,
}

function csvEscape(value: string | number | null): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const searchParams = req.nextUrl.searchParams
    const projectId = searchParams.get('projectId')
    const scanId = searchParams.get('scanId')
    const sortBy = searchParams.get('sortBy') || 'lines_of_code'
    const order = searchParams.get('order') || 'desc'
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      )
    }

    const { rows, aggregatedFromIssues } = await fetchFileRows(gate.user.id, projectId, scanId)

    if (rows.length === 0) {
      return NextResponse.json({
        data: [],
        count: 0,
        total: 0,
        offset,
        limit,
        message: 'No per-file metrics recorded for this project yet. Run a scan that stores file metrics, or review findings under /api/scanner/issues.',
      })
    }

    // Apply sorting
    const getter = SORT_GETTERS[sortBy] || SORT_GETTERS['lines_of_code']
    rows.sort((a, b) => {
      const aVal = getter(a)
      const bVal = getter(b)
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return order === 'asc' ? aVal - bVal : bVal - aVal
      }
      const cmp = String(aVal).localeCompare(String(bVal))
      return order === 'asc' ? cmp : -cmp
    })

    // Apply pagination
    const paginated = rows.slice(offset, offset + limit)

    return NextResponse.json({
      data: paginated,
      count: paginated.length,
      total: rows.length,
      offset,
      limit,
      ...(aggregatedFromIssues
        ? { message: 'No stored per-file metrics; rows aggregated from scanner issue findings. Unmeasured fields are null.' }
        : {}),
    })
  } catch (error) {
    console.error('[CodeSpectra] API Error in GET /api/scanner/metrics/files:', error)
    return NextResponse.json(
      { error: 'Failed to fetch file metrics' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/scanner/metrics/files/export
 * Export real file metrics as CSV (same source as GET).
 */
export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const body = await req.json()
    const { projectId, scanId = null, format = 'csv' } = body

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      )
    }

    if (format === 'csv') {
      const { rows } = await fetchFileRows(gate.user.id, projectId, scanId)
      if (rows.length === 0) {
        return NextResponse.json(
          { error: 'No file metrics found for this project' },
          { status: 404 }
        )
      }
      const lines = ['File Path,Language,LOC,Complexity,Bugs,Vulnerabilities,Code Smells,Security Hotspots']
      for (const r of rows) {
        lines.push(
          [
            csvEscape(r.filePath || ''),
            csvEscape(r.fileLanguage),
            csvEscape(r.linesOfCode),
            csvEscape(r.complexity),
            csvEscape(r.bugs),
            csvEscape(r.vulnerabilities),
            csvEscape(r.codeSmells),
            csvEscape(r.securityHotspots),
          ].join(',')
        )
      }

      return new NextResponse(lines.join('\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="metrics.csv"',
        },
      })
    }

    return NextResponse.json(
      { error: 'Unsupported format' },
      { status: 400 }
    )
  } catch (error) {
    console.error('[CodeSpectra] API Error in POST /api/scanner/metrics/files:', error)
    return NextResponse.json(
      { error: 'Failed to export metrics' },
      { status: 500 }
    )
  }
}
