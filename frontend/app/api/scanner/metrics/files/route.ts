import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/scanner/metrics/files
 * Fetch file-level metrics with optional filtering
 */
export async function GET(req: NextRequest) {
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

    // This would query Supabase
    // For now, returning mock data structure
    const fileMetrics = [
      {
        id: '1',
        projectId,
        scanId,
        filePath: 'src/app/page.tsx',
        fileLanguage: 'typescript',
        linesOfCode: 245,
        linesOfComments: 12,
        linesOfTests: 0,
        complexity: 8,
        cognitivComplexity: 3,
        bugs: 0,
        vulnerabilities: 0,
        codeSmells: 2,
        securityHotspots: 1,
        coverage: 85.5,
        duplication: 2.1,
        createdAt: new Date(),
      },
      {
        id: '2',
        projectId,
        scanId,
        filePath: 'src/components/scanner/quality-gate-dashboard.tsx',
        fileLanguage: 'typescript',
        linesOfCode: 412,
        linesOfComments: 25,
        linesOfTests: 150,
        complexity: 12,
        cognitivComplexity: 5,
        bugs: 1,
        vulnerabilities: 0,
        codeSmells: 5,
        securityHotspots: 0,
        coverage: 72.3,
        duplication: 4.5,
        createdAt: new Date(),
      },
    ]

    // Apply sorting
    fileMetrics.sort((a, b) => {
      const aVal = a[sortBy as keyof typeof a] || 0
      const bVal = b[sortBy as keyof typeof b] || 0

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return order === 'asc' ? aVal - bVal : bVal - aVal
      }
      return 0
    })

    // Apply pagination
    const paginated = fileMetrics.slice(offset, offset + limit)

    return NextResponse.json({
      data: paginated,
      count: paginated.length,
      total: fileMetrics.length,
      offset,
      limit,
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
 * GET /api/scanner/metrics/files/[id]
 * Fetch detailed metrics for a specific file
 */
export async function getFileMetricsDetail(fileId: string) {
  try {
    // This would query Supabase with the fileId
    const fileMetrics = {
      id: fileId,
      projectId: 'project-1',
      filePath: 'src/app/page.tsx',
      fileLanguage: 'typescript',
      linesOfCode: 245,
      linesOfComments: 12,
      linesOfTests: 0,
      complexity: 8,
      cognitivComplexity: 3,
      bugs: 0,
      vulnerabilities: 0,
      codeSmells: 2,
      securityHotspots: 1,
      coverage: 85.5,
      duplication: 2.1,
      lastModified: new Date(),
      history: [
        { date: new Date(Date.now() - 86400000), linesOfCode: 240, issues: 3 },
        { date: new Date(Date.now() - 172800000), linesOfCode: 230, issues: 5 },
      ],
    }

    return fileMetrics
  } catch (error) {
    console.error('[CodeSpectra] Error fetching file metrics detail:', error)
    throw error
  }
}

/**
 * POST /api/scanner/metrics/files/export
 * Export file metrics as CSV
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { projectId, format = 'csv' } = body

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      )
    }

    if (format === 'csv') {
      const csvContent = `File Path,Language,LOC,Complexity,Issues,Coverage,Duplication
src/app/page.tsx,typescript,245,8,2,85.5,2.1
src/components/scanner/quality-gate-dashboard.tsx,typescript,412,12,6,72.3,4.5`

      return new NextResponse(csvContent, {
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
