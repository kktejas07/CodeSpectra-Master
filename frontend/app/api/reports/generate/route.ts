import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format') || 'json'
  const scanId = searchParams.get('scanId')

  try {
    const db = await getMongoDb()
    const userId = gate.user.id

    let reportData

    if (scanId) {
      const scan = await db.collection('code_scans').findOne({ id: scanId, user_id: userId })
      if (scan) {
        reportData = scan
      }
    }

    if (!reportData) {
      const recentScans = await db
        .collection('scan_comments')
        .find({ user_id: userId })
        .sort({ created_at: -1 })
        .limit(1)
        .toArray()

      const [issues, appliedFixes, suggestedFixes] = await Promise.all([
        db
          .collection('code_issues')
          .find({ user_id: userId })
          .sort({ severity: 1 })
          .limit(50)
          .toArray(),
        db
          .collection('suggested_fixes')
          .countDocuments({ user_id: userId, status: 'applied' }),
        db.collection('suggested_fixes').countDocuments({ user_id: userId }),
      ])

      const bugs = issues.filter((i: any) => i.type === 'bug').length
      const vulnerabilities = issues.filter(
        (i: any) => i.type === 'vulnerability',
      ).length
      const codeSmells = issues.filter(
        (i: any) => i.type === 'code_smell',
      ).length

      const totalScans = await db.collection('scan_comments').countDocuments({ user_id: userId })
      // Nothing scanned yet: say so instead of inventing a report.
      if (totalScans === 0 && issues.length === 0 && suggestedFixes === 0) {
        if (format === 'csv') {
          return NextResponse.json({ error: 'No scans yet' }, { status: 404 })
        }
        return NextResponse.json({ success: true, data: null, generatedAt: new Date().toISOString() })
      }

      reportData = {
        generatedAt: new Date().toISOString(),
        userId,
        quality: typeof recentScans[0]?.quality_score === 'number' ? recentScans[0].quality_score : null,
        bugs,
        vulnerabilities,
        codeSmells,
        // Coverage and complexity aren't measured by the scanner yet.
        testCoverage: null,
        complexity: null,
        repository: recentScans[0]?.repository || null,
        branch: recentScans[0]?.branch || null,
        author: (await db.collection('user').findOne({ id: userId }))?.name || 'Unknown',
        totalScans,
        appliedFixes,
        pendingFixes: suggestedFixes - appliedFixes,
        issues: issues.slice(0, 20),
      }
    }

    if (format === 'csv') {
      const lines = [
        'Metric,Value',
        `Quality Score,${reportData.quality ?? 'Not measured'}`,
        `Bugs,${reportData.bugs || 0}`,
        `Vulnerabilities,${reportData.vulnerabilities || 0}`,
        `Code Smells,${reportData.codeSmells || 0}`,
        `Test Coverage,${reportData.testCoverage != null ? `${reportData.testCoverage}%` : 'Not measured'}`,
        `Complexity,${reportData.complexity ?? 'Not measured'}`,
        `Applied Fixes,${reportData.appliedFixes || 0}`,
      ]
      const csv = lines.join('\n')
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="codespectra-report-${Date.now()}.csv"`,
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: reportData,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[CodeSpectra] Error generating report:', error)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}