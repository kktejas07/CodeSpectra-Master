import { NextRequest, NextResponse } from 'next/server'
import { getGitHubAccessTokenFromSession } from '@/lib/github-api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/scans'

export async function GET(request: NextRequest) {
  const auth = await getGitHubAccessTokenFromSession()
  if (!auth.ok) {
    return auth.response
  }

  try {
    const page = new URL(request.url).searchParams.get('page') || '1'
    const response = await fetch(
      `https://api.github.com/user/repos?type=owner&sort=updated&per_page=20&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      },
    )

    if (!response.ok) {
      console.error('[CodeSpectra] GitHub API error:', response.status, response.statusText)
      return NextResponse.json({ error: 'Failed to fetch repositories' }, { status: 502 })
    }

    const repos = (await response.json()) as Record<string, unknown>[]
    const now = nowIso()

    const syncRows = repos
      .map((repo) => {
        const id = Number(repo.id)
        if (!Number.isFinite(id)) return null
        const full = typeof repo.full_name === 'string' ? repo.full_name : ''
        const nm = typeof repo.name === 'string' ? repo.name : ''
        if (!full || !nm) return null
        return {
          user_id: auth.userId,
          github_repo_id: id,
          full_name: full,
          name: nm,
          description: typeof repo.description === 'string' ? repo.description : null,
          html_url: typeof repo.html_url === 'string' ? repo.html_url : null,
          default_branch:
            typeof repo.default_branch === 'string' ? repo.default_branch : null,
          private: Boolean(repo.private),
          language: typeof repo.language === 'string' ? repo.language : null,
          stargazers_count: Number(repo.stargazers_count ?? 0) || 0,
          github_updated_at:
            typeof repo.updated_at === 'string'
              ? new Date(repo.updated_at).toISOString()
              : null,
          last_synced_at: now,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r != null)

    if (syncRows.length > 0) {
      try {
        const db = await getMongoDb()
        const col = db.collection('github_repo_metadata')
        for (const row of syncRows) {
          await col.updateOne(
            { user_id: row.user_id, github_repo_id: row.github_repo_id },
            {
              $set: row,
              $setOnInsert: { id: newId(), created_at: now },
            },
            { upsert: true },
          )
        }
      } catch (e) {
        console.warn('[CodeSpectra] github_repo_metadata upsert:', e)
      }
    }

    const transformedRepos = repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      language: repo.language,
      stars: repo.stargazers_count,
      updated_at: repo.updated_at,
      owner: {
        login: (repo.owner as { login?: string })?.login,
        avatar_url: (repo.owner as { avatar_url?: string })?.avatar_url,
      },
    }))

    return NextResponse.json(transformedRepos)
  } catch (error) {
    console.error('[CodeSpectra] GitHub repos error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch repositories' },
      { status: 500 },
    )
  }
}
