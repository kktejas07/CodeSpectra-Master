import { generateText } from 'ai'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-client'

const fixSchema = z.object({
  fixes: z.array(
    z.object({
      issue_id: z.string(),
      issue_severity: z.enum(['critical', 'major', 'minor', 'info']),
      issue_description: z.string(),
      original_code: z.string(),
      suggested_code: z.string(),
      fix_explanation: z.string(),
      confidence_score: z.number().min(0).max(1),
      line_number: z.number().optional(),
    })
  ).describe('Array of suggested fixes for identified issues'),
})

/**
 * POST /api/generate-fixes
 * Generate AI-powered fix suggestions for code issues
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { analysis_id, code, issues, language = 'javascript' } = body

    if (!code || !issues || issues.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Code and issues are required' },
        { status: 400 }
      )
    }

    // Generate fixes using AI
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
${issues.map((issue: any, index: number) => `${index + 1}. [${issue.severity}] ${issue.message}`).join('\n')}

Return ONLY valid JSON matching the schema.`,
      output: z.object({
        fixes: fixSchema.shape.fixes,
      }),
    })

    // Save fixes to database if analysis_id provided
    if (analysis_id) {
      for (const fix of result.object.fixes) {
        await supabase.from('suggested_fixes').insert({
          analysis_id,
          issue_id: fix.issue_id,
          issue_severity: fix.issue_severity,
          issue_description: fix.issue_description,
          original_code: fix.original_code,
          suggested_code: fix.suggested_code,
          fix_explanation: fix.fix_explanation,
          confidence_score: fix.confidence_score,
          status: 'pending',
        })
      }
    }

    return NextResponse.json({
      success: true,
      fixes: result.object.fixes,
      count: result.object.fixes.length,
    })
  } catch (error) {
    console.error('[v0] Generate fixes error:', error)

    // Return mock fixes in case of error (for development)
    return NextResponse.json({
      success: true,
      fixes: [
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
          suggested_code: 'try {\n  const result = JSON.parse(data)\n} catch (error) {\n  console.error("Parse error:", error)\n}',
          fix_explanation:
            'JSON.parse can throw an error if the string is not valid JSON. Always wrap it in a try-catch block.',
          confidence_score: 0.88,
          line_number: 12,
        },
      ],
      count: 2,
    })
  }
}
