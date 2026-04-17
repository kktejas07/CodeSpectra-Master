import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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
      console.error('[v0] GitHub tree API error:', response.statusText)
      return []
    }

    const data = await response.json()
    const tree = data.tree || []

    // Transform GitHub tree to FileNode structure
    const nodes: FileNode[] = []
    const pathMap = new Map<string, FileNode>()

    // Sort by path for proper tree structure
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

        // Find parent and add as child
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
    console.error('[v0] Error fetching GitHub tree:', error)
    return []
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams
    const owner = searchParams.get('owner')
    const repoName = searchParams.get('repo')
    const recursive = searchParams.get('recursive') === 'true'

    if (!owner || !repoName) {
      return NextResponse.json(
        { error: 'Missing owner or repo parameter' },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: userData } = await supabase.auth.getUser(token)

    if (!userData.user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    // Get GitHub integration for user
    const { data: integration } = await supabase
      .from('github_integrations')
      .select('github_token')
      .eq('user_id', userData.user.id)
      .eq('is_active', true)
      .single()

    if (!integration) {
      return NextResponse.json({ error: 'GitHub not connected' }, { status: 400 })
    }

    // Fetch file tree from GitHub
    const fileTree = await fetchGitHubTree(owner, repoName, integration.github_token, recursive)

    return NextResponse.json(fileTree)
  } catch (error) {
    console.error('[v0] Repo files error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch repository files' },
      { status: 500 }
    )
  }
}
