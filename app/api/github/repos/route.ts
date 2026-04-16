import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
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

    // Fetch repositories from GitHub
    const page = new URL(request.url).searchParams.get('page') || '1'
    const response = await fetch(
      `https://api.github.com/user/repos?type=owner&sort=updated&per_page=20&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${integration.github_token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    )

    if (!response.ok) {
      console.error('[v0] GitHub API error:', response.statusText)
      return NextResponse.json({ error: 'Failed to fetch repositories' }, { status: 500 })
    }

    const repos = await response.json()

    // Transform to our format
    const transformedRepos = repos.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      language: repo.language,
      stars: repo.stargazers_count,
      updated_at: repo.updated_at,
      owner: {
        login: repo.owner.login,
        avatar_url: repo.owner.avatar_url,
      },
    }))

    return NextResponse.json(transformedRepos)
  } catch (error) {
    console.error('[v0] GitHub repos error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch repositories' },
      { status: 500 }
    )
  }
}
