import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getGitHubAccessTokenFromSession } from '@/lib/github-api-auth'
import { newId, nowIso } from '@/lib/db/scans'

async function ghJson(url: string, token: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return { ok: res.ok, status: res.status, body }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ success: false, error: gate.error }, { status: gate.status })
  }

  let body: { repository_full_name?: unknown; limit?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = {}
  }

  const onlyRepo =
    typeof body.repository_full_name === 'string' ? body.repository_full_name.trim() : ''
  const limit = Math.min(25, Math.max(1, Number(body.limit) || 10))

  const db = await getMongoDb()
  const metaCol = db.collection('github_repo_metadata')

  const filter: Record<string, unknown> = { user_id: gate.user.id }
  if (onlyRepo) filter.full_name = onlyRepo

  const rows = await metaCol
    .find(filter)
    .sort({ last_synced_at: -1 })
    .limit(limit)
    .toArray()

  if (rows.length === 0) {
    return NextResponse.json({
      success: true,
      enqueued: 0,
      message: onlyRepo
        ? 'No matching repo in catalog — open repo list in scanner first.'
        : 'No catalog rows yet.',
    })
  }

  const tok = await getGitHubAccessTokenFromSession()
  if (!tok.ok) return tok.response
  const token = tok.accessToken

  const queueCol = db.collection('github_webhook_scan_queue')
  let enqueued = 0
  const errors: string[] = []

  for (const row of rows) {
    const full = String(row.full_name || '')
    const parts = full.split('/').filter(Boolean)
    if (parts.length < 2) {
      errors.push(`bad_full_name:${full}`)
      continue
    }
    const owner = parts[0]
    const repo = parts.slice(1).join('/')
    const branch =
      (typeof row.default_branch === 'string' && row.default_branch.trim()) || 'main'

    const commitsUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?sha=${encodeURIComponent(branch)}&per_page=2`
    const c = await ghJson(commitsUrl, token)
    if (!c.ok || !Array.isArray(c.body)) {
      errors.push(`commits_${full}:${c.status}`)
      continue
    }
    const arr = c.body as Array<{ sha?: string }>
    const head = typeof arr[0]?.sha === 'string' ? arr[0].sha : ''
    const before = typeof arr[1]?.sha === 'string' ? arr[1].sha : ''
    if (!head || !before) {
      errors.push(`short_history:${full}`)
      continue
    }

    const deliveryId = `sweep:${gate.user.id}:${full}:${head}`
    const dup = await queueCol.findOne({ delivery_id: deliveryId })
    if (dup) continue

    await queueCol.insertOne({
      id: newId(),
      delivery_id: deliveryId,
      repository_full_name: full,
      owner_login: owner,
      ref: `refs/heads/${branch}`,
      before_commit_sha: before,
      head_commit_sha: head,
      status: 'pending',
      queue_kind: 'sweep',
      created_at: nowIso(),
    })
    enqueued += 1
  }

  return NextResponse.json({
    success: true,
    enqueued,
    examined: rows.length,
    errors: errors.length ? errors.slice(0, 12) : undefined,
  })
}
