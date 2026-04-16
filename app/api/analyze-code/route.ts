import { NextRequest, NextResponse } from 'next/server'

interface AnalysisRequest {
  code: string
  language: string
}

interface Issue {
  line: number
  column: number
  message: string
  severity: 'error' | 'warning' | 'info'
  rule: string
  type: string
}

interface Suggestion {
  title: string
  description: string
  code: string
  explanation: string
  confidence: number
}

interface AnalysisResponse {
  quality: number
  issues: Issue[]
  suggestions: Suggestion[]
  bugs: number
  vulnerabilities: number
  codeSmells: number
  complexityScore: number
  maintainabilityIndex: number
  testCoveragePercentage: number
  timeMs: number
}

// Simulated analysis engine - in production, integrate with ESLint, SonarQube, or similar
function analyzeCode(code: string, language: string): AnalysisResponse {
  const startTime = Date.now()
  const issues: Issue[] = []
  const suggestions: Suggestion[] = []

  // Basic pattern matching for common issues
  const lines = code.split('\n')

  lines.forEach((line, index) => {
    const lineNum = index + 1

    // Check for console.log
    if (line.includes('console.log')) {
      issues.push({
        line: lineNum,
        column: line.indexOf('console.log') + 1,
        message: 'Remove debug console.log statement before production',
        severity: 'warning',
        rule: 'no-console',
        type: 'debug-code',
      })
    }

    // Check for var declarations
    if (/^\s*var\s+/.test(line)) {
      issues.push({
        line: lineNum,
        column: line.indexOf('var') + 1,
        message: "Use 'const' or 'let' instead of 'var'",
        severity: 'warning',
        rule: 'no-var',
        type: 'best-practice',
      })

      suggestions.push({
        title: 'Replace var with const',
        description: 'Modern JavaScript recommends using const or let',
        code: line.replace(/var\s+/, 'const '),
        explanation:
          'const and let have block scope and prevent accidental reassignment',
        confidence: 0.95,
      })
    }

    // Check for empty catch blocks
    if (line.includes('catch') && line.includes('{}')) {
      issues.push({
        line: lineNum,
        column: line.indexOf('catch') + 1,
        message: 'Empty catch block - handle error properly',
        severity: 'error',
        rule: 'no-empty-catch',
        type: 'error-handling',
      })
    }

    // Check for loose equality
    if (line.includes('==') && !line.includes('===')) {
      issues.push({
        line: lineNum,
        column: line.indexOf('==') + 1,
        message: "Use '===' instead of '==' for comparison",
        severity: 'warning',
        rule: 'eqeqeq',
        type: 'best-practice',
      })

      suggestions.push({
        title: 'Use strict equality',
        description: 'Replace == with === to avoid type coercion issues',
        code: line.replace(/==/g, '==='),
        explanation: 'Strict equality prevents unexpected type conversions',
        confidence: 0.9,
      })
    }

    // Check for long lines
    if (line.length > 100) {
      issues.push({
        line: lineNum,
        column: 101,
        message: 'Line exceeds maximum length of 100 characters',
        severity: 'info',
        rule: 'max-len',
        type: 'style',
      })
    }

    // Check for TODO comments without context
    if (line.includes('TODO') && !line.includes('TODO:')) {
      issues.push({
        line: lineNum,
        column: line.indexOf('TODO') + 1,
        message: 'TODO comment needs more context',
        severity: 'info',
        rule: 'no-todo',
        type: 'documentation',
      })
    }
  })

  // Calculate metrics
  const complexity = Math.min(100, Math.round(code.split('{').length * 2))
  const maintainability = Math.max(0, 100 - complexity)
  const testCoverage = Math.random() * 80 // Simulated

  // Calculate quality score
  const errorCount = issues.filter(i => i.severity === 'error').length
  const warningCount = issues.filter(i => i.severity === 'warning').length
  const infoCount = issues.filter(i => i.severity === 'info').length

  const qualityScore = Math.max(
    0,
    100 -
      errorCount * 20 -
      warningCount * 5 -
      infoCount * 2 -
      Math.min(30, code.length / 100)
  )

  return {
    quality: Math.round(qualityScore),
    issues,
    suggestions: suggestions.slice(0, 3),
    bugs: errorCount,
    vulnerabilities: Math.max(0, errorCount - 1),
    codeSmells: warningCount,
    complexityScore: complexity,
    maintainabilityIndex: maintainability,
    testCoveragePercentage: testCoverage,
    timeMs: Date.now() - startTime,
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { code, language }: AnalysisRequest = await request.json()

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Code is required and must be a string' },
        { status: 400 }
      )
    }

    // Perform analysis
    const result = analyzeCode(code, language || 'typescript')

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('[v0] Code analysis error:', error)
    return NextResponse.json(
      { error: 'Failed to analyze code' },
      { status: 500 }
    )
  }
}
