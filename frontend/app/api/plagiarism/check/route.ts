import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Tokenize code into a fingerprint for similarity comparison.
 * Extracts identifiers, keywords, and operators while stripping literals.
 */
function tokenizeCode(code: string): string[] {
  return code
    .replace(/\/\/.*$/gm, '') // remove line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // remove block comments
    .replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '""') // normalize string literals
    .replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, "''") // normalize char literals
    .replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, '``') // normalize template literals
    .replace(/\b\d+(\.\d+)?\b/g, 'NUM') // normalize numbers
    .split(/[\s{}()[\];,]+/g)
    .filter(t => t.length > 0)
}

/**
 * Compute n-gram fingerprint from tokens.
 */
function ngramFingerprint(tokens: string[], n: number = 3): Map<string, number> {
  const grams = new Map<string, number>()
  for (let i = 0; i <= tokens.length - n; i++) {
    const gram = tokens.slice(i, i + n).join(' ')
    grams.set(gram, (grams.get(gram) || 0) + 1)
  }
  return grams
}

/**
 * Jaccard similarity between two sets of n-grams.
 */
function jaccardSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  const allKeys = new Set([...a.keys(), ...b.keys()])
  if (allKeys.size === 0) return 0
  let intersection = 0
  for (const key of allKeys) {
    if (a.has(key) && b.has(key)) intersection++
  }
  return intersection / allKeys.size
}

interface PlagiarismReq {
  code: string
  language?: string
  problem_slug?: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body: PlagiarismReq
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.code || body.code.trim().length < 20) {
    return NextResponse.json({ error: 'Code too short for analysis' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const submissions = db.collection('submissions')

    // Fetch recent submissions for the same problem (if specified) or recent submissions
    const query: Record<string, unknown> = body.problem_slug ? { problem_slug: body.problem_slug } : {}
    const recentSubmissions = await submissions
      .find(query)
      .sort({ created_at: -1 })
      .limit(100)
      .toArray()

    const inputTokens = tokenizeCode(body.code)
    const inputNgrams = ngramFingerprint(inputTokens)

    const matches: Array<{
      submission_id: string
      user_id: string
      similarity: number
      matched_tokens: number
    }> = []

    for (const sub of recentSubmissions) {
      // Skip own submissions
      if (sub.user_id === gate.user.id) continue
      if (!sub.code && !sub.source_code) continue

      const otherCode = sub.source_code || sub.code || ''
      const otherTokens = tokenizeCode(otherCode)
      const otherNgrams = ngramFingerprint(otherTokens)

      const similarity = jaccardSimilarity(inputNgrams, otherNgrams)
      const matchedTokens = Math.round(similarity * Math.min(inputTokens.length, otherTokens.length))

      if (similarity > 0.4) { // threshold: 40% similarity is suspicious
        matches.push({
          submission_id: sub.id || sub._id?.toString() || 'unknown',
          user_id: sub.user_id || 'unknown',
          similarity: Math.round(similarity * 100) / 100,
          matched_tokens: matchedTokens,
        })
      }
    }

    // Sort by similarity descending
    matches.sort((a, b) => b.similarity - a.similarity)

    const overallSimilarity = matches.length > 0 ? matches[0].similarity : 0
    const riskLevel = overallSimilarity > 0.8 ? 'critical' : overallSimilarity > 0.6 ? 'high' : overallSimilarity > 0.4 ? 'moderate' : 'low'

    return NextResponse.json({
      overall_similarity: overallSimilarity,
      risk_level: riskLevel,
      matches: matches.slice(0, 10), // top 10 matches
      total_comparisons: recentSubmissions.length - 1,
      input_tokens: inputTokens.length,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Plagiarism check failed'
    console.error('[CodeSpectra] plagiarism-check:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
