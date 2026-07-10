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

const TYPE_TO_CLIENT: Record<string, ClientIssueType> = {
  bug: 'bug',
  vulnerability: 'vulnerability',
  security: 'vulnerability',
  code_smell: 'code_smell',
  security_hotspot: 'security_hotspot',
  duplicate: 'duplicate',
  style: 'code_smell',
  documentation: 'code_smell',
  error_handling: 'code_smell',
  best_practice: 'code_smell',
  debug_code: 'code_smell',
  structure: 'code_smell',
  complexity: 'code_smell',
}

const SEVERITY_TO_CLIENT: Record<string, ClientIssueSeverity> = {
  error: 'critical',
  warning: 'major',
  info: 'info',
}

export function mapIssuesForClient(issues: RawAnalyzerIssue[]): ClientAnalysisPayload['issues'] {
  return issues.map((i) => ({
    type: TYPE_TO_CLIENT[i.type] ?? 'code_smell',
    severity: SEVERITY_TO_CLIENT[i.severity] ?? 'info',
    rule: i.rule,
    message: i.message,
    line: i.line,
  }))
}

export function toClientAnalysisPayload(result: RawAnalysisResult): ClientAnalysisPayload {
  const { issues: rawIssues, suggestions: rawSuggestions, ...rest } = result
  const issues = mapIssuesForClient(rawIssues)

  const securityHotspots = issues.filter(i => i.type === 'security_hotspot').length

  const duplicatePercentage = Math.min(100, Math.round(
    (rawIssues.filter(i => i.type === 'duplicate').length > 0 ? 10 : 0) +
    rawIssues.filter(i => i.type === 'duplicate').length * 5
  ))

  let bestPractices: string[] = []
  if (result.quality >= 80 && issues.length === 0) {
    bestPractices = ['No issues found — code is clean']
  } else if (result.quality >= 75) {
    bestPractices = ['Code quality is good — maintain current practices']
  } else if (result.quality >= 55) {
    bestPractices = ['Address critical and major issues before merging', 'Reduce complexity where possible']
  } else if (result.quality < 55) {
    bestPractices = ['High issue count — consider a full refactor before proceeding']
  }

  return {
    ...rest,
    issues,
    suggestions: rawSuggestions.map(s => s.title),
    securityHotspots,
    duplicatePercentage,
    performance: '',
    bestPractices,
  }
}