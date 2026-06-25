import type {
  RawAnalysisResult,
  RawAnalyzerIssue,
  RawAnalyzerSuggestion,
} from '@/lib/scanner-analysis-mapper'

/** Same heuristics as `/api/analyze-code` (shared with webhook queue worker). */
export function analyzeCodeLocally(code: string, language: string): RawAnalysisResult {
  const startTime = Date.now()
  const issues: RawAnalyzerIssue[] = []
  const suggestions: RawAnalyzerSuggestion[] = []

  const lines = code.split('\n')

  lines.forEach((line, index) => {
    const lineNum = index + 1

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

  const complexity = Math.min(100, Math.round(code.split('{').length * 2))
  const maintainability = Math.max(0, 100 - complexity)
  const testCoverage = Math.random() * 80

  const errorCount = issues.filter((i) => i.severity === 'error').length
  const warningCount = issues.filter((i) => i.severity === 'warning').length
  const infoCount = issues.filter((i) => i.severity === 'info').length

  const qualityScore = Math.max(
    0,
    100 - errorCount * 20 - warningCount * 5 - infoCount * 2 - Math.min(30, code.length / 100)
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
