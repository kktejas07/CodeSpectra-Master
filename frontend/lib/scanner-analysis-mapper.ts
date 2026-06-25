/** Shared shape returned to the scanner UI and stored in `code_metrics.metrics_json`. */

export type ClientIssueSeverity = 'critical' | 'major' | 'minor' | 'info'
export type ClientIssueType = 'bug' | 'vulnerability' | 'code_smell' | 'security_hotspot' | 'duplicate'

export interface RawAnalyzerIssue {
  line: number
  column: number
  message: string
  severity: 'error' | 'warning' | 'info'
  rule: string
  type: string
}

export interface RawAnalyzerSuggestion {
  title: string
  description: string
  code: string
  explanation: string
  confidence: number
}

export interface RawAnalysisResult {
  quality: number
  issues: RawAnalyzerIssue[]
  suggestions: RawAnalyzerSuggestion[]
  bugs: number
  vulnerabilities: number
  codeSmells: number
  complexityScore: number
  maintainabilityIndex: number
  testCoveragePercentage: number
  timeMs: number
}

export interface ClientAnalysisPayload extends Omit<RawAnalysisResult, 'issues' | 'suggestions'> {
  securityHotspots: number
  duplicatePercentage: number
  performance: string
  bestPractices: string[]
  issues: Array<{
    type: ClientIssueType
    severity: ClientIssueSeverity
    rule: string
    message: string
    line?: number
    effortMinutes?: number
  }>
  suggestions: string[]
}

export function mapIssuesForClient(issues: RawAnalyzerIssue[]): ClientAnalysisPayload['issues'] {
  return issues.map((i) => {
    if (i.severity === 'error') {
      return {
        type: 'bug' as const,
        severity: 'critical' as const,
        rule: i.rule,
        message: i.message,
        line: i.line,
      }
    }
    if (i.severity === 'warning') {
      return {
        type: 'code_smell' as const,
        severity: 'major' as const,
        rule: i.rule,
        message: i.message,
        line: i.line,
      }
    }
    return {
      type: 'code_smell' as const,
      severity: 'info' as const,
      rule: i.rule,
      message: i.message,
      line: i.line,
    }
  })
}

export function toClientAnalysisPayload(result: RawAnalysisResult): ClientAnalysisPayload {
  const { issues: rawIssues, suggestions: rawSuggestions, ...rest } = result
  const issues = mapIssuesForClient(rawIssues)
  const bestPractices =
    result.quality >= 75
      ? ['No blocking structural smells detected in this pass']
      : result.quality >= 55
        ? ['Continue tightening error paths and style consistency']
        : []

  return {
    ...rest,
    issues,
    suggestions: rawSuggestions.map((s) => s.title),
    securityHotspots: 0,
    duplicatePercentage: 0,
    performance: '',
    bestPractices,
  }
}
