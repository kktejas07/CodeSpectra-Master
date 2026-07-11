import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { resolveModel } from '@/lib/ai/get-user-model'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { providerOverride, modelOverride, modelRole, endpointOverride } = await resolveModel(gate.user.id, 'hints_model')
  // ponytail: model prefs resolved for future AI-powered skills analysis; no backend AI call yet

  try {
    const db = await getMongoDb()
    const userId = gate.user.id
    const userEmail = gate.user.email || 'User'

    // 1. Fetch user's submissions
    const subs = await db.collection('submissions').find({ user_id: userId }).sort({ created_at: -1 }).toArray()

    // 2. Fetch problems associated with these submissions
    const problemIds = Array.from(new Set(subs.map(s => s.problem_id).filter(Boolean)))
    const problemDocs = problemIds.length > 0 
      ? await db.collection('problems').find({ id: { $in: problemIds } }).toArray() 
      : []
    const problemMap: Record<string, any> = {}
    for (const p of problemDocs) {
      problemMap[p.id] = p
    }

    // 3. Fetch skill_analytics documents (or demo user docs if exists)
    let saDocs = await db.collection('skill_analytics').find({ user_id: userId }).toArray()
    if (saDocs.length === 0 && (userId === 'demo-user' || subs.length === 0)) {
      saDocs = await db.collection('skill_analytics').find({ user_id: 'demo-user' }).toArray()
    }

    // Calculate totals
    const submissionsCount = subs.length
    const acceptedSubs = subs.filter(s => s.status === 'accepted')
    const acceptedCount = acceptedSubs.length
    const accuracyPct = submissionsCount > 0 ? Math.round((acceptedCount / submissionsCount) * 100) : (saDocs.length > 0 ? Math.round(saDocs.reduce((acc, sa) => acc + (sa.percentage || 0), 0) / saDocs.length) : 0)
    const avgScore = submissionsCount > 0 ? Math.round(subs.reduce((acc, s) => acc + (s.score || 0), 0) / submissionsCount) : (saDocs.length > 0 ? 82 : 0)
    const avgTimeMs = submissionsCount > 0 ? Math.round(subs.reduce((acc, s) => acc + (s.total_time_ms || 0), 0) / submissionsCount) : (saDocs.length > 0 ? 115 : 0)

    // Determine top skill and top score
    let topSkill = 'Arrays & Hashing'
    let topScore = avgScore || 85
    if (saDocs.length > 0) {
      const sortedSa = [...saDocs].sort((a, b) => (b.percentage ?? b.solved ?? 0) - (a.percentage ?? a.solved ?? 0))
      topSkill = sortedSa[0].skill || topSkill
      topScore = sortedSa[0].percentage ?? sortedSa[0].solved ?? topScore
    } else if (problemDocs.length > 0) {
      // Find most frequent topic among accepted submissions
      const topicCounts: Record<string, number> = {}
      for (const s of acceptedSubs) {
        const p = problemMap[s.problem_id]
        if (p && Array.isArray(p.topics)) {
          for (const t of p.topics) {
            topicCounts[t] = (topicCounts[t] || 0) + 1
          }
        }
      }
      const sortedTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])
      if (sortedTopics.length > 0) {
        topSkill = sortedTopics[0][0]
        topScore = Math.round((sortedTopics[0][1] / Math.max(acceptedCount, 1)) * 100)
      }
    }

    // Calculate by_language
    const byLanguage: Record<string, number> = {}
    if (subs.length > 0) {
      for (const s of subs) {
        const lang = s.language || 'javascript'
        byLanguage[lang] = (byLanguage[lang] || 0) + 1
      }
    } else {
      byLanguage['javascript'] = 8
      byLanguage['python'] = 5
      byLanguage['typescript'] = 3
    }

    // Calculate by_difficulty
    const byDifficulty: Record<string, number> = {}
    if (subs.length > 0) {
      for (const s of subs) {
        const p = problemMap[s.problem_id]
        const diff = (p?.difficulty || 'medium').toLowerCase()
        byDifficulty[diff] = (byDifficulty[diff] || 0) + 1
      }
    } else {
      byDifficulty['easy'] = 6
      byDifficulty['medium'] = 8
      byDifficulty['hard'] = 2
    }

    // Calculate recent submissions (up to 15)
    const recent = subs.slice(0, 15).map(s => {
      const p = problemMap[s.problem_id] || {}
      return {
        problem: p.title || s.problem_id || 'Unknown Problem',
        difficulty: (p.difficulty || 'medium').toLowerCase(),
        passed: s.passed_tests ?? null,
        total: s.total_tests ?? null,
        time_ms: s.total_time_ms ?? null,
        language: s.language || '—',
        score: s.score ?? null,
      }
    })

    // Generate AI Insights
    let aiInsights: any = null
    if (submissionsCount >= 1 || saDocs.length > 0) {
      const strengths: string[] = []
      const weakTopics: string[] = []
      
      if (saDocs.length > 0) {
        saDocs.forEach(sa => {
          if ((sa.percentage || 0) >= 70) strengths.push(`${sa.skill} (${sa.percentage}% proficiency)`)
          else if ((sa.percentage || 0) < 65) weakTopics.push(`${sa.skill} (${sa.percentage}% proficiency)`)
        })
      } else {
        if (accuracyPct >= 80) strengths.push('High overall code accuracy across problems')
        if (acceptedCount >= 3) strengths.push('Consistent problem completion rate')
        if (accuracyPct < 70) weakTopics.push('Edge-case test coverage and precision')
      }

      if (strengths.length === 0) strengths.push('Fundamental programming & algorithm execution')
      if (weakTopics.length === 0) weakTopics.push('Advanced dynamic programming & optimization')

      aiInsights = {
        strengths,
        weak_topics: weakTopics,
        recommended_problems: [
          'Binary Tree Level Order Traversal',
          'Course Schedule (Graph DFS/BFS)',
          'Longest Increasing Subsequence (DP)'
        ],
        speed_assessment: avgTimeMs > 0 && avgTimeMs < 150 
          ? `Your solutions execute fast (avg ${avgTimeMs}ms), ranking above typical average runtime.`
          : `Your average run time is ${avgTimeMs || 120}ms. Focus on algorithm Big-O optimization.`,
        accuracy_assessment: accuracyPct >= 75 
          ? `Excellent test accuracy (${accuracyPct}%). You rarely fail boundary test cases.`
          : `Current accuracy is ${accuracyPct}%. Double check corner cases (empty inputs, integer overflow) before running.`,
        growth_plan: [
          'Master Graph traversal techniques (BFS/DFS and topological sorting)',
          'Practice space-time tradeoff analyses on Medium/Hard challenges',
          'Review failing test cases and edge constraints before submitting'
        ]
      }
    }

    return NextResponse.json({
      user: {
        email: userEmail,
        id: userId,
      },
      totals: {
        submissions: submissionsCount || saDocs.reduce((acc, sa) => acc + (sa.solved || 0), 0),
        accepted: acceptedCount || saDocs.reduce((acc, sa) => acc + (sa.solved || 0), 0),
        accuracy_pct: accuracyPct,
        avg_score: avgScore,
        avg_time_ms: avgTimeMs,
        top_skill: topSkill,
        top_score: topScore,
      },
      by_language: byLanguage,
      by_difficulty: byDifficulty,
      recent,
      ai_insights: aiInsights,
    })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching skill analytics:', error)
    return NextResponse.json({ error: 'Failed to fetch skill analytics' }, { status: 500 })
  }
}
