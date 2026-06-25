import { toClientAnalysisPayload } from '@/lib/scanner-analysis-mapper'
import { analyzeCodeLocally } from '@/lib/local-code-analyzer'
import { insertScan, insertMetrics } from '@/lib/db/scans'

export interface PersistGithubFileScanParams {
  userId: string
  code: string
  language: string
  owner: string
  repo: string
  filePath: string
  branch: string
  commitHash: string
}

/**
 * Insert `code_scans` + `code_metrics` for a GitHub file push event.
 *
 * Phase 3 migration: native MongoDB driver via the scans repository.
 * The `supabase` client parameter from the legacy signature has been
 * dropped; the only caller (the GitHub webhook queue worker) doesn't
 * need it any more.
 */
export async function persistGithubFileScan(
  params: PersistGithubFileScanParams,
): Promise<{ scanId: string | null; error?: string }> {
  const { userId, code, language, owner, repo, filePath, branch, commitHash } = params
  try {
    const raw = analyzeCodeLocally(code, language || 'typescript')
    const payload = toClientAnalysisPayload(raw)
    const snippet = code.length > 50_000 ? code.slice(0, 50_000) : code
    const github_repo_url = `https://github.com/${owner}/${repo}`

    const scan = await insertScan({
      user_id: userId,
      scan_type: 'github_file',
      code_snippet: snippet,
      language: language || 'typescript',
      scan_status: 'completed',
      scan_duration_ms: Math.round(payload.timeMs),
      completed_at: new Date().toISOString(),
      github_repo_url,
      github_repo_owner: owner,
      github_repo_name: repo,
      branch: branch || 'HEAD',
      commit_hash: commitHash,
      file_path: filePath,
    })

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
        scanSource: 'github_file',
        githubFilePath: filePath,
        githubRepoUrl: github_repo_url,
        webhookAutoScan: true,
      },
    })

    return { scanId: scan.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { scanId: null, error: message }
  }
}
