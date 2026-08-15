import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { toClientAnalysisPayload, type ClientAnalysisPayload } from '@/lib/scanner-analysis-mapper'
import { analyzeCodeLocally } from '@/lib/local-code-analyzer'
import { insertScan, insertMetrics } from '@/lib/db/scans'
import { executeOnce } from '@/lib/piston'

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

const COMPILE_TIMEOUT = 4000

function injectCompileErrors(payload: ClientAnalysisPayload, stderr: string): ClientAnalysisPayload {
  const lines = stderr.split('\n').filter(l => l.includes(': error:') || l.includes(': fatal error:'))
  if (lines.length === 0) return payload

  const newIssues = lines.map((line) => {
    const lineMatch = line.match(/:(\d+):/)
    const msg = line.replace(/^.*?:\d+:\d+:\s*(error|fatal error):\s*/i, '').trim()
    return {
      type: 'bug' as const,
      severity: 'critical' as const,
      rule: 'compile-error',
      message: msg || line.trim(),
      line: lineMatch ? parseInt(lineMatch[1], 10) : 1,
      effortMinutes: 5,
    }
  })

  const merged = [...newIssues, ...payload.issues]
  const errorCount = newIssues.length
  let quality = Math.max(0, 100 - errorCount * 20)
  const existingErrorIssues = payload.issues.filter(i => i.severity === 'critical' || i.severity === 'major').length
  quality = Math.max(0, quality - existingErrorIssues * 8)
  quality = Math.min(100, Math.round(quality))

  return {
    ...payload,
    quality,
    bugs: payload.bugs + errorCount,
    codeSmells: payload.codeSmells,
    issues: merged,
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Sign in required to analyze code' }, { status: 401 })
    }

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
    let payload = toClientAnalysisPayload(raw)

    // Attempt compilation — silently degrades if Piston is unreachable
    if (code.trim().length > 0) {
      try {
        const execResult = await executeOnce({
          language: (language || 'typescript').toLowerCase(),
          source: code,
          timeoutMs: COMPILE_TIMEOUT,
        })
        const compileStderr = execResult.compile?.stderr || execResult.run?.stderr || ''
        if (compileStderr.trim()) {
          payload = injectCompileErrors(payload, compileStderr)
        }
      } catch {
        /* Piston unavailable — skip compile check */
      }
    }

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
          codeSnippet: snippet,
        },
      })
    } catch (e) {
      console.error('[CodeSpectra] analyze-code persist:', e)
    }

    return NextResponse.json(
      { ...payload, scanId, scannerLanguage: language || 'typescript', codeSnippet: code },
      { headers: { 'Cache-Control': 'no-cache' } },
    )
  } catch (error) {
    console.error('[CodeSpectra] Code analysis error:', error)
    return NextResponse.json({ error: 'Failed to analyze code' }, { status: 500 })
  }
}
