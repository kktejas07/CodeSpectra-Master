import type { Issue, FileMetric, QualityGate } from '@/types/scanner'

/**
 * Calculate Quality Gate Status
 * Determines if a project passes the defined quality gate rules
 */
export function calculateQualityGateStatus(
  issues: Issue[],
  metrics: FileMetric[],
  gate: QualityGate
): 'PASSED' | 'FAILED' {
  // Count issues by type
  const securityIssues = issues.filter(i => i.type === 'vulnerability').length
  const reliabilityIssues = issues.filter(i => i.type === 'bug').length
  const maintainabilityIssues = issues.filter(i => i.type === 'code_smell').length

  // Calculate aggregate metrics
  const totalCoverage = metrics.length > 0
    ? metrics.reduce((sum, m) => sum + m.coverage, 0) / metrics.length
    : 0

  const totalDuplications = metrics.length > 0
    ? metrics.reduce((sum, m) => sum + m.duplication, 0) / metrics.length
    : 0

  // Check all conditions
  const passedSecurity = securityIssues <= gate.conditions.securityIssues
  const passedReliability = reliabilityIssues <= gate.conditions.reliabilityIssues
  const passedMaintainability = maintainabilityIssues <= gate.conditions.maintainabilityIssues
  const passedCoverage = totalCoverage >= gate.conditions.coverage
  const passedDuplications = totalDuplications <= gate.conditions.duplications

  // All conditions must pass
  const allPassed = passedSecurity && passedReliability && passedMaintainability && passedCoverage && passedDuplications

  return allPassed ? 'PASSED' : 'FAILED'
}

/**
 * Get failing conditions for a quality gate
 * Useful for showing users which specific conditions failed
 */
export function getFailingConditions(
  issues: Issue[],
  metrics: FileMetric[],
  gate: QualityGate
): string[] {
  const failures: string[] = []

  const securityIssues = issues.filter(i => i.type === 'vulnerability').length
  if (securityIssues > gate.conditions.securityIssues) {
    failures.push(`Security issues: ${securityIssues} > ${gate.conditions.securityIssues}`)
  }

  const reliabilityIssues = issues.filter(i => i.type === 'bug').length
  if (reliabilityIssues > gate.conditions.reliabilityIssues) {
    failures.push(`Reliability issues: ${reliabilityIssues} > ${gate.conditions.reliabilityIssues}`)
  }

  const maintainabilityIssues = issues.filter(i => i.type === 'code_smell').length
  if (maintainabilityIssues > gate.conditions.maintainabilityIssues) {
    failures.push(`Maintainability issues: ${maintainabilityIssues} > ${gate.conditions.maintainabilityIssues}`)
  }

  const totalCoverage = metrics.length > 0
    ? metrics.reduce((sum, m) => sum + m.coverage, 0) / metrics.length
    : 0

  if (totalCoverage < gate.conditions.coverage) {
    failures.push(`Coverage: ${totalCoverage.toFixed(1)}% < ${gate.conditions.coverage}%`)
  }

  const totalDuplications = metrics.length > 0
    ? metrics.reduce((sum, m) => sum + m.duplication, 0) / metrics.length
    : 0

  if (totalDuplications > gate.conditions.duplications) {
    failures.push(`Duplications: ${totalDuplications.toFixed(1)}% > ${gate.conditions.duplications}%`)
  }

  return failures
}

/**
 * Check if a single file passes quality gate
 */
export function filePassesGate(metric: FileMetric, gate: QualityGate): boolean {
  if (metric.coverage < gate.conditions.coverage) return false
  if (metric.duplication > gate.conditions.duplications) return false
  if (metric.bugs > gate.conditions.reliabilityIssues) return false
  if (metric.vulnerabilities > gate.conditions.securityIssues) return false
  if (metric.code_smells > gate.conditions.maintainabilityIssues) return false
  return true
}

/**
 * Get quality gate pass rate percentage
 */
export function getQualityGatePassRate(metrics: FileMetric[], gate: QualityGate): number {
  if (metrics.length === 0) return 0
  const passingFiles = metrics.filter(m => filePassesGate(m, gate)).length
  return (passingFiles / metrics.length) * 100
}
