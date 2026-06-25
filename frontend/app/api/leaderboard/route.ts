import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/admin-service-client'
import { languageBadgeClass, languageLabel, rankTitle, xpToLevel } from '@/lib/leaderboard-utils'
import type { LeaderboardEntryDTO } from '@/lib/leaderboard-types'

function avatarUrl(seed: string) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`
}

export async function GET(request: Request) {
  const supabase = getServiceSupabase()
  if (!supabase) {
    return NextResponse.json(
      { error: 'Server leaderboard unavailable (missing service role key).' },
      { status: 503 }
    )
  }

  const { searchParams } = new URL(request.url)
  const scope = (searchParams.get('scope') || 'global').toLowerCase()
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50)))

  const me = await getAPIUser()

  try {
    if (scope === 'monthly') {
      const monthStart = new Date()
      monthStart.setUTCDate(1)
      monthStart.setUTCHours(0, 0, 0, 0)

      const { data: subs, error: sErr } = await supabase
        .from('submissions')
        .select('user_id, challenge_id')
        .eq('status', 'accepted')
        .gte('submitted_at', monthStart.toISOString())

      if (sErr) throw sErr

      const challengeIds = [...new Set((subs ?? []).map((r) => r.challenge_id as string).filter(Boolean))]
      const pointsByChallenge = new Map<string, number>()
      if (challengeIds.length > 0) {
        const { data: chRows, error: cErr } = await supabase
          .from('challenges')
          .select('id, points')
          .in('id', challengeIds)
        if (cErr) throw cErr
        for (const c of chRows ?? []) {
          pointsByChallenge.set(c.id as string, (c.points as number) ?? 0)
        }
      }

      const xpByUser = new Map<string, number>()
      for (const row of subs ?? []) {
        const uid = row.user_id as string
        const cid = row.challenge_id as string
        const pts = pointsByChallenge.get(cid) ?? 0
        xpByUser.set(uid, (xpByUser.get(uid) ?? 0) + pts)
      }

      const sorted = [...xpByUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
      const ids = sorted.map(([id]) => id)
      if (ids.length === 0) {
        return NextResponse.json({
          scope: 'monthly',
          entries: [] as LeaderboardEntryDTO[],
          total: 0,
          organizationId: null,
        })
      }

      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, preferred_language, organization_id')
        .in('id', ids)

      if (pErr) throw pErr
      const profileById = new Map((profs ?? []).map((p) => [p.id as string, p]))

      const entries: LeaderboardEntryDTO[] = sorted.map(([userId, xp], i) => {
        const p = profileById.get(userId)
        const email = (p?.email as string) || ''
        const name =
          (p?.full_name as string)?.trim() ||
          (email ? email.split('@')[0] : 'Developer')
        const langRaw = (p?.preferred_language as string) || 'javascript'
        const language = languageLabel(langRaw)
        return {
          rank: i + 1,
          userId,
          name,
          title: rankTitle(i + 1),
          level: xpToLevel(xp),
          xp,
          language,
          languageClass: languageBadgeClass(language),
          avatar: avatarUrl(email || userId),
          lastSubmission: null,
          streak: 0,
          challengesSolved: 0,
        }
      })

      return NextResponse.json({
        scope: 'monthly',
        entries,
        total: entries.length,
        organizationId: null,
      })
    }

    let orgFilter: string | null = null
    if (scope === 'team') {
      if (!me) {
        return NextResponse.json({ error: 'Sign in to view team leaderboard' }, { status: 401 })
      }
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', me.id)
        .maybeSingle()
      orgFilter = (myProfile?.organization_id as string | null) ?? null
      if (!orgFilter) {
        return NextResponse.json({
          scope: 'team',
          entries: [] as LeaderboardEntryDTO[],
          total: 0,
          organizationId: null,
          message: 'Your profile has no organization assigned yet.',
        })
      }
    }

    const { data: lbRows, error: lbErr } = await supabase
      .from('leaderboard')
      .select('user_id, total_points, challenges_solved, rank, streak, last_submission')
      .order('total_points', { ascending: false })
      .limit(limit)

    if (lbErr) throw lbErr

    const uids = [...new Set((lbRows ?? []).map((r) => r.user_id as string))]
    if (uids.length === 0) {
      return NextResponse.json({
        scope,
        entries: [] as LeaderboardEntryDTO[],
        total: 0,
        organizationId: orgFilter,
      })
    }

    const { data: profs, error: pErr } = await supabase
      .from('profiles')
      .select('id, full_name, email, preferred_language, organization_id')
      .in('id', uids)

    if (pErr) throw pErr
    const pmap = new Map((profs ?? []).map((p) => [p.id as string, p]))

    let combined = (lbRows ?? []).map((r) => ({
      ...r,
      profile: pmap.get(r.user_id as string) ?? null,
    }))

    if (scope === 'team' && orgFilter) {
      combined = combined.filter((r) => r.profile?.organization_id === orgFilter)
    }

    const entries: LeaderboardEntryDTO[] = combined.map((r, i) => {
      const email = r.profile?.email || ''
      const baseName =
        r.profile?.full_name?.trim() || (email ? email.split('@')[0] : 'Developer')
      const name = me?.id === r.user_id ? `${baseName} (You)` : baseName
      const xp = r.total_points ?? 0
      const langRaw = r.profile?.preferred_language || 'javascript'
      const language = languageLabel(langRaw)
      return {
        rank: i + 1,
        userId: r.user_id as string,
        name,
        title: rankTitle(i + 1),
        level: xpToLevel(xp),
        xp,
        language,
        languageClass: languageBadgeClass(language),
        avatar: avatarUrl(email || (r.user_id as string)),
        lastSubmission: r.last_submission,
        streak: r.streak ?? 0,
        challengesSolved: r.challenges_solved ?? 0,
      }
    })

    return NextResponse.json({
      scope,
      entries,
      total: entries.length,
      organizationId: orgFilter,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Leaderboard error'
    console.error('[CodeSpectra] /api/leaderboard:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
