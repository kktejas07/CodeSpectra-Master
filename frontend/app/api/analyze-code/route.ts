import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { toClientAnalysisPayload } from '@/lib/scanner-analysis-mapper'
import { analyzeCodeLocally } from '@/lib/local-code-analyzer'
import { insertScan, insertMetrics } from '@/lib/db/scans'

interface AnalysisRequest {
  code: string
  language: string
  github_repo_full_name?: string
  github_repo_owner?: string
  github_repo_name?: string
  github_file_path?: string
  github_branch?: string
  github_commit_hash?: string
  github_repo_url?: string
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: AnalysisRequest
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { code, language, ...githubMeta } = body
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Code is required and must be a string' },
        { status: 400 },
      )
    }

    const raw = analyzeCodeLocally(code, language || 'typescript')
    const payload = toClientAnalysisPayload(raw)

    const fp = githubMeta.github_file_path?.trim() || ''
    const fullName = githubMeta.github_repo_full_name?.trim() || ''
    let ghOwner = githubMeta.github_repo_owner?.trim() || ''
    let ghName = githubMeta.github_repo_name?.trim() || ''
    if (!ghOwner && !ghName && fullName.includes('/')) {
      const parts = fullName.split('/')
      ghOwner = parts[0] || ''
      ghName = parts.slice(1).join('/') || ''
    }
    const isGithubFile = Boolean(fp && ghOwner && ghName)
    const github_repo_url =
      githubMeta.github_repo_url?.trim() ||
      (isGithubFile ? `https://github.com/${ghOwner}/${ghName}` : null)

    let scanId: string | null = null
    const user = await getAPIUser()
    if (user) {
      try {
        const snippet = code.length > 50_000 ? code.slice(0, 50_000) : code
        const scan = await insertScan({
          user_id: user.id,
          scan_type: isGithubFile ? 'github_file' : 'manual',
          code_snippet: snippet,
          language: language || 'typescript',
          scan_status: 'completed',
          scan_duration_ms: Math.round(payload.timeMs),
          completed_at: new Date().toISOString(),
          ...(isGithubFile && {
            github_repo_url,
            github_repo_owner: ghOwner,
            github_repo_name: ghName,
            branch: githubMeta.github_branch?.trim() || 'HEAD',
            commit_hash: githubMeta.github_commit_hash?.trim() || null,
            file_path: fp,
          }),
        })
        scanId = scan.id
        await insertMetrics({
          scan_id: scan.id,
          overall_quality_score: payload.quality,
          bugs: payload.bugs,
          vulnerabilities: payload.vulnerabilities,
          security_hotspots: payload.securityHotspots,
          code_smells: payload.codeSmells,
          duplicated_code_percentage: payload.duplicatePercentage,
          complexity_score: Math.min(100, Math.round(payload.complexityScore)),
          maintainability_index: Math.round(payload.maintainabilityIndex),
          test_coverage_percentage: Number(payload.testCoveragePercentage.toFixed(2)),
          metrics_json: {
            ...payload,
            storedScanId: scan.id,
            scannerLanguage: language || 'typescript',
            scanSource: isGithubFile ? 'github_file' : 'manual',
            githubFilePath: isGithubFile ? fp : undefined,
            githubRepoUrl: github_repo_url ?? undefined,
          },
        })
      } catch (e) {
        console.error('[CodeSpectra] analyze-code persist:', e)
      }
    }

    return NextResponse.json(
      { ...payload, scanId, scannerLanguage: language || 'typescript' },
      { headers: { 'Cache-Control': 'no-cache' } },
    )
  } catch (error) {
    console.error('[CodeSpectra] Code analysis error:', error)
    return NextResponse.json({ error: 'Failed to analyze code' }, { status: 500 })
  }
}
