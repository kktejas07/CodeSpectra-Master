import { generateText } from 'ai'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { rateLimitGenerateFixes } from '@/lib/upstash-rate-limit'
import { requireAuth } from '@/lib/route-auth'
import { codeScans, codeIssues, newId, nowIso } from '@/lib/db/scans'
import { suggestedFixes } from '@/lib/db/misc'

const fixSchema = z.object({
  fixes: z
    .array(
      z.object({
        issue_id: z.string(),
        issue_severity: z.enum(['critical', 'major', 'minor', 'info']),
        issue_description: z.string(),
        original_code: z.string(),
        suggested_code: z.string(),
        fix_explanation: z.string(),
        confidence_score: z.number().min(0).max(1),
        line_number: z.number().optional(),
      }),
    )
    .describe('Array of suggested fixes for identified issues'),
})

type GeneratedFix = z.infer<typeof fixSchema>['fixes'][number]

const SCAN_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface IssueContext {
  line?: number
  rule?: string
  message?: string
  severity?: string
  type?: string
}

function pickIssueContext(
  issues: IssueContext[],
  fix: GeneratedFix,
  index: number,
): IssueContext | undefined {
  if (typeof fix.line_number === 'number') {
    const byLine = issues.find((i) => i.line === fix.line_number)
    if (byLine) return byLine
  }
  return issues[index]
}

async function persistGeneratedFixes(params: {
  scanId: string
  userId: string
  fixes: GeneratedFix[]
  issueContexts: IssueContext[]
}): Promise<{ rows: Array<{ issueId: string; fixId: string }>; error?: string }> {
  const { scanId, userId, fixes, issueContexts } = params
  const rows: Array<{ issueId: string; fixId: string }> = []

  const scansCol = await codeScans()
  const scan = await scansCol.findOne({ id: scanId })
  if (!scan || scan.user_id !== userId) {
    return { rows, error: 'Scan not found' }
  }

  const issuesCol = await codeIssues()
  const fixesCol = await suggestedFixes()

  for (let i = 0; i < fixes.length; i++) {
    const fix = fixes[i]
    const ctx = pickIssueContext(issueContexts, fix, i)
    const lineNum =
      typeof fix.line_number === 'number' ? fix.line_number : ctx?.line ?? null
    const message = (fix.issue_description || ctx?.message || 'AI suggested fix').slice(0, 2000)
    const issueType =
      typeof ctx?.type === 'string' && ctx.type.length > 0 ? ctx.type : 'code_smell'

    const issueDoc = {
      id: newId(),
      scan_id: scanId,
      user_id: userId,
      type: issueType as 'bug' | 'vulnerability' | 'code_smell' | 'security_hotspot',
      severity: fix.issue_severity as 'critical' | 'major' | 'minor' | 'info',
      status: 'open' as const,
      rule: (ctx?.rule?.trim() || `ai-fix:${lineNum ?? i}`).slice(0, 500),
      message,
      line_number: lineNum,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    await issuesCol.insertOne(issueDoc)

    const confidence = Math.round(Math.min(1, Math.max(0, fix.confidence_score)) * 100)
    const fixDoc = {
      id: newId(),
      issue_id: issueDoc.id,
      scan_id: scanId,
      user_id: userId,
      description: fix.fix_explanation.slice(0, 4000),
      original_code: fix.original_code,
      suggested_code: fix.suggested_code,
      confidence_level: confidence,
      applied: false,
      created_at: nowIso(),
    }
    await fixesCol.insertOne(fixDoc)

    rows.push({ issueId: issueDoc.id, fixId: fixDoc.id })
  }

  return { rows }
}

const MOCK_FIXES: GeneratedFix[] = [
  {
    issue_id: 'issue_1',
    issue_severity: 'major',
    issue_description: 'Use === instead of ==',
    original_code: 'if (x == 5) { }',
    suggested_code: 'if (x === 5) { }',
    fix_explanation:
      'Using === prevents type coercion issues and is more explicit about type checking.',
    confidence_score: 0.95,
    line_number: 5,
  },
  {
    issue_id: 'issue_2',
    issue_severity: 'minor',
    issue_description: 'Add error handling',
    original_code: 'const result = JSON.parse(data)',
    suggested_code:
      'try {\n  const result = JSON.parse(data)\n} catch (error) {\n  console.error("Parse error:", error)\n}',
    fix_explanation:
      'JSON.parse can throw an error if the string is not valid JSON. Always wrap it in a try-catch block.',
    confidence_score: 0.88,
    line_number: 12,
  },
]

export async function POST(request: Request): Promise<NextResponse> {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const code = body.code
  const issues = body.issues
  const language = typeof body.language === 'string' ? body.language : 'javascript'
  const scanIdRaw = typeof body.scan_id === 'string' ? body.scan_id.trim() : ''
  const wantsPersist = Boolean(scanIdRaw && SCAN_UUID_RE.test(scanIdRaw))

  if (typeof code !== 'string' || !Array.isArray(issues) || issues.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Code and issues are required' },
      { status: 400 },
    )
  }

  let authedUserId: string | null = null
  if (wantsPersist) {
    const gate = await requireAuth()
    if ('error' in gate) {
      return NextResponse.json({ success: false, error: gate.error }, { status: gate.status })
    }
    authedUserId = gate.user.id
  }

  const lim = await rateLimitGenerateFixes(request, authedUserId)
  if (!lim.ok) {
    return NextResponse.json(
      {
        success: false,
        error: 'Too many AI fix requests in a short window. Try again later.',
        retry_after: lim.retryAfterSec,
      },
      { status: 429, headers: { 'Retry-After': String(lim.retryAfterSec) } },
    )
  }

  const issueContexts = issues as IssueContext[]

  try {
    const result = await generateText({
      model: 'openai/gpt-4o-mini',
      system: `You are an expert code fixer. Generate concrete, actionable fixes for code issues.

      For each issue, provide:
      1. The original problematic code snippet
      2. The corrected code snippet
      3. A clear explanation of why this fix is needed
      4. A confidence score (0-1) indicating how confident you are in the fix

      Fixes should be:
      - Minimal (only change what's necessary)
      - Production-ready
      - Following best practices
      - Easy to understand`,
      prompt: `Generate fixes for the following ${language} code issues:

Code:
\`\`\`${language}
${code}
\`\`\`

Issues to fix:
${issues.map((issue: { severity?: string; message?: string }, index: number) => `${index + 1}. [${issue.severity}] ${issue.message}`).join('\n')}

Return ONLY valid JSON matching the schema.`,
      output: z.object({ fixes: fixSchema.shape.fixes }),
    })

    const fixes = result.object.fixes
    let persisted: Array<{ issueId: string; fixId: string }> | undefined

    if (wantsPersist && authedUserId) {
      const { rows, error: pErr } = await persistGeneratedFixes({
        scanId: scanIdRaw,
        userId: authedUserId,
        fixes,
        issueContexts,
      })
      persisted = rows.length > 0 ? rows : undefined
      if (pErr && rows.length === 0) {
        return NextResponse.json(
          { success: false, error: pErr },
          { status: pErr === 'Scan not found' ? 404 : 400 },
        )
      }
    }

    return NextResponse.json({
      success: true,
      fixes: attachPersistedIds(fixes, persisted),
      count: fixes.length,
      persisted,
    })
  } catch (error) {
    console.error('[CodeSpectra] Generate fixes error:', error)
    return NextResponse.json({
      success: true,
      fixes: MOCK_FIXES,
      count: MOCK_FIXES.length,
      degraded: true,
    })
  }
}

function attachPersistedIds(
  fixes: GeneratedFix[],
  persisted: Array<{ issueId: string; fixId: string }> | undefined,
): Array<GeneratedFix & { db_issue_id?: string; db_fix_id?: string }> {
  if (!persisted?.length) return fixes
  return fixes.map((f, i) => {
    const p = persisted[i]
    if (!p) return f
    return { ...f, db_issue_id: p.issueId, db_fix_id: p.fixId }
  })
}
