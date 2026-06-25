import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { codeScans } from '@/lib/db/scans'
import { suggestedFixes } from '@/lib/db/misc'
import { getGitHubAccessTokenFromSession } from '@/lib/github-api-auth'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ success: false, error: gate.error }, { status: gate.status })
  }

  let body: { fix_id?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const fixId = typeof body.fix_id === 'string' ? body.fix_id.trim() : ''
  if (!fixId) {
    return NextResponse.json({ success: false, error: 'fix_id is required' }, { status: 400 })
  }

  const fixesCol = await suggestedFixes()
  const fix = await fixesCol.findOne({ id: fixId })
  if (!fix?.scan_id) {
    return NextResponse.json({ success: false, error: 'Fix not found' }, { status: 404 })
  }

  const scansCol = await codeScans()
  const scan = await scansCol.findOne({ id: fix.scan_id as string })
  if (!scan || scan.user_id !== gate.user.id) {
    return NextResponse.json({ success: false, error: 'Scan not found' }, { status: 404 })
  }
  if (scan.scan_type !== 'github_file') {
    return NextResponse.json(
      { success: false, error: 'Rollback to GitHub is only supported for github_file scans' },
      { status: 400 },
    )
  }

  const owner = String(scan.github_repo_owner || '')
  const repo = String(scan.github_repo_name || '')
  const filePath = String(scan.file_path || '')
  const branch = String(scan.branch || 'main')
  if (!owner || !repo || !filePath) {
    return NextResponse.json(
      { success: false, error: 'Scan is missing GitHub path metadata' },
      { status: 400 },
    )
  }

  const tok = await getGitHubAccessTokenFromSession()
  if (!tok.ok) return tok.response
  const token = tok.accessToken

  const pathSeg = filePath.split('/').map((p) => encodeURIComponent(p)).join('/')
  const getUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${pathSeg}?ref=${encodeURIComponent(branch)}`

  const cur = await fetch(getUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  const curJson = (await cur.json().catch(() => ({}))) as { sha?: string; message?: string }
  if (!cur.ok || !curJson.sha) {
    return NextResponse.json(
      {
        success: false,
        error: curJson.message || `Could not read file from GitHub (${cur.status})`,
      },
      { status: 502 },
    )
  }

  const content = Buffer.from(String(fix.original_code ?? ''), 'utf8').toString('base64')
  const putUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${pathSeg}`

  const putRes = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `CodeSpectra: restore original before suggested fix (${fixId.slice(0, 8)})`,
      content,
      sha: curJson.sha,
      branch,
    }),
  })
  const putJson = (await putRes.json().catch(() => ({}))) as {
    message?: string
    commit?: { sha?: string }
  }
  if (!putRes.ok) {
    return NextResponse.json(
      { success: false, error: putJson.message || `GitHub update failed (${putRes.status})` },
      { status: 502 },
    )
  }

  return NextResponse.json({
    success: true,
    commit_sha: putJson.commit?.sha ?? null,
    path: filePath,
    repository: `${owner}/${repo}`,
  })
}
