export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface ComponentHealth {
  componentId: string
  grade: HealthGrade
  score: number
  factors: {
    loc: number
    bugDensity: number
    vulnCount: number
    complexity: number
    duplication: number
  }
}

export interface HealthScoreSummary {
  overallGrade: HealthGrade
  averageScore: number
  componentCount: number
  gradeDistribution: Record<HealthGrade, number>
}

const LOC_WEIGHT = 0.2
const BUG_DENSITY_WEIGHT = 0.3
const VULN_WEIGHT = 0.25
const COMPLEXITY_WEIGHT = 0.15
const DUPLICATION_WEIGHT = 0.1

function locScore(loc: number): number {
  if (loc < 200) return 100
  if (loc < 500) return 90
  if (loc < 1000) return 75
  if (loc < 2000) return 60
  if (loc < 5000) return 40
  return 20
}

function bugDensityScore(bugs: number, loc: number): number {
  const density = loc > 0 ? bugs / (loc / 1000) : 0
  if (density === 0) return 100
  if (density < 0.5) return 90
  if (density < 1) return 75
  if (density < 2) return 55
  if (density < 5) return 35
  return 15
}

function vulnScore(vulns: number): number {
  if (vulns === 0) return 100
  if (vulns === 1) return 80
  if (vulns === 2) return 60
  if (vulns <= 5) return 35
  if (vulns <= 10) return 15
  return 5
}

function complexityScore(complexity: number): number {
  if (complexity < 10) return 100
  if (complexity < 20) return 85
  if (complexity < 40) return 65
  if (complexity < 60) return 45
  if (complexity < 100) return 25
  return 10
}

function duplicationScore(duplication: number): number {
  if (duplication < 2) return 100
  if (duplication < 5) return 85
  if (duplication < 10) return 65
  if (duplication < 15) return 45
  return 20
}

function scoreToGrade(score: number): HealthGrade {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

export const HEALTH_GRADE_COLORS: Record<HealthGrade, string> = {
  A: '#22c55e',
  B: '#84cc16',
  C: '#eab308',
  D: '#f97316',
  F: '#ef4444',
}

export const HEALTH_GRADE_LABELS: Record<HealthGrade, string> = {
  A: 'Excellent',
  B: 'Good',
  C: 'Fair',
  D: 'Poor',
  F: 'Critical',
}

export function computeComponentHealth(params: {
  loc?: number
  bugs?: number
  vulnerabilities?: number
  complexity?: number
  duplication?: number
}): ComponentHealth {
  const { loc = 0, bugs = 0, vulnerabilities = 0, complexity = 0, duplication = 0 } = params

  const scores = {
    loc: locScore(loc),
    bugDensity: bugDensityScore(bugs, loc),
    vulnCount: vulnScore(vulnerabilities),
    complexity: complexityScore(complexity),
    duplication: duplicationScore(duplication),
  }

  const total =
    scores.loc * LOC_WEIGHT +
    scores.bugDensity * BUG_DENSITY_WEIGHT +
    scores.vulnCount * VULN_WEIGHT +
    scores.complexity * COMPLEXITY_WEIGHT +
    scores.duplication * DUPLICATION_WEIGHT

  return {
    componentId: '',
    grade: scoreToGrade(total),
    score: Math.round(total),
    factors: scores,
  }
}

export function computeHealthScoreSummary(
  components: Array<{
    id: string
    linesOfCode?: number
    health?: 'healthy' | 'warning' | 'critical'
  }>
): HealthScoreSummary {
  if (components.length === 0) {
    return { overallGrade: 'A', averageScore: 100, componentCount: 0, gradeDistribution: { A: 0, B: 0, C: 0, D: 0, F: 0 } }
  }

  const healthToScore: Record<string, number> = {
    healthy: 95,
    warning: 60,
    critical: 25,
  }

  const scores = components.map(c => healthToScore[c.health || 'healthy'] ?? 60)
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length

  const distribution: Record<HealthGrade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 }
  for (const s of scores) {
    distribution[scoreToGrade(s)]++
  }

  return {
    overallGrade: scoreToGrade(avg),
    averageScore: Math.round(avg),
    componentCount: components.length,
    gradeDistribution: distribution,
  }
}