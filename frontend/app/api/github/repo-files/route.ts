import { NextRequest, NextResponse } from 'next/server'
import { getGitHubAccessTokenFromSession } from '@/lib/github-api-auth'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  sha?: string
  children?: FileNode[]
}

async function fetchGitHubTree(
  owner: string,
  repo: string,
  token: string,
  recursive = true
): Promise<FileNode[]> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=${recursive ? 1 : 0}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    )

    if (!response.ok) {
      console.error('[CodeSpectra] GitHub tree API error:', response.statusText)
      return []
    }

    const data = await response.json()
    const tree = data.tree || []

    const nodes: FileNode[] = []
    const pathMap = new Map<string, FileNode>()

    tree
      .sort((a: any, b: any) => a.path.localeCompare(b.path))
      .forEach((item: any) => {
        const node: FileNode = {
          name: item.path.split('/').pop() || item.path,
          path: item.path,
          type: item.type === 'tree' ? 'dir' : 'file',
          size: item.size,
          sha: item.sha,
          children: [],
        }

        pathMap.set(item.path, node)

        const parts = item.path.split('/')
        if (parts.length > 1) {
          const parentPath = parts.slice(0, -1).join('/')
          const parent = pathMap.get(parentPath)
          if (parent) {
            parent.children = parent.children || []
            parent.children.push(node)
          }
        } else {
          nodes.push(node)
        }
      })

    return nodes
  } catch (error) {
    console.error('[CodeSpectra] Error fetching GitHub tree:', error)
    return []
  }
}

export async function GET(request: NextRequest) {
  const auth = await getGitHubAccessTokenFromSession()
  if (!auth.ok) {
    return auth.response
  }

  const searchParams = request.nextUrl.searchParams
  const owner = searchParams.get('owner')
  const repoName = searchParams.get('repo')
  const recursive = searchParams.get('recursive') === 'true'

  if (!owner || !repoName) {
    return NextResponse.json({ error: 'Missing owner or repo parameter' }, { status: 400 })
  }

  try {
    const fileTree = await fetchGitHubTree(owner, repoName, auth.accessToken, recursive)
    return NextResponse.json(fileTree)
  } catch (error) {
    console.error('[CodeSpectra] Repo files error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch repository files' },
      { status: 500 }
    )
  }
}
