import { NextRequest, NextResponse } from 'next/server'
import { getGitHubAccessTokenFromSession } from '@/lib/github-api-auth'

/**
 * POST /api/github/file-content
 * Body: { owner, repo, path } — returns `{ content, encoding, path }` from GitHub Contents API.
 */
export async function POST(request: NextRequest) {
  const auth = await getGitHubAccessTokenFromSession()
  if (!auth.ok) {
    return auth.response
  }

  let body: { owner?: string; repo?: string; path?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const owner = typeof body.owner === 'string' ? body.owner.trim() : ''
  const repo = typeof body.repo === 'string' ? body.repo.trim() : ''
  const path = typeof body.path === 'string' ? body.path.trim() : ''
  if (!owner || !repo || !path) {
    return NextResponse.json({ error: 'owner, repo, and path are required' }, { status: 400 })
  }

  const contentsPath = path.split('/').map(encodeURIComponent).join('/')
  const ghUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${contentsPath}`

  const gh = await fetch(ghUrl, {
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })

  if (!gh.ok) {
    const errText = await gh.text()
    console.error('[CodeSpectra] GitHub contents:', gh.status, errText.slice(0, 200))
    return NextResponse.json({ error: 'Failed to load file from GitHub' }, { status: gh.status === 404 ? 404 : 502 })
  }

  const data = (await gh.json()) as {
    content?: string
    encoding?: string
    path?: string
    type?: string
    message?: string
  }

  if (data.type !== 'file' || !data.content) {
    return NextResponse.json({ error: 'Not a file or empty response' }, { status: 400 })
  }

  const encoding = data.encoding === 'base64' ? 'base64' : 'utf-8'
  let text: string
  if (data.encoding === 'base64') {
    text = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8')
  } else {
    text = data.content
  }

  return NextResponse.json({
    path: data.path ?? path,
    encoding,
    content: text,
  })
}
