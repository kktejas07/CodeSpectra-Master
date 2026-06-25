/**
 * Quality Rating System (A-E Scale)
 * Based on SonarQube's industry-standard rating system
 */

export type QualityRating = 'A' | 'B' | 'C' | 'D' | 'E'

/**
 * Convert numeric score (0-10) to letter grade
 * A = 8.0+  (Excellent)
 * B = 7.0-7.9 (Good)
 * C = 5.0-6.9 (Fair)
 * D = 3.0-4.9 (Poor)
 * E = <3.0   (Critical)
 */
export function scoreToRating(score: number): QualityRating {
  if (score >= 8.0) return 'A'
  if (score >= 7.0) return 'B'
  if (score >= 5.0) return 'C'
  if (score >= 3.0) return 'D'
  return 'E'
}

/**
 * Get rating color for UI display
 */
export function getRatingColor(rating: QualityRating): string {
  const colors = {
    A: '#10b981', // green
    B: '#3b82f6', // blue
    C: '#f59e0b', // amber
    D: '#f97316', // orange
    E: '#ef4444', // red
  }
  return colors[rating]
}

/**
 * Get rating description
 */
export function getRatingDescription(rating: QualityRating): string {
  const descriptions = {
    A: 'Excellent - No issues found',
    B: 'Good - Minor issues only',
    C: 'Fair - Some concerns',
    D: 'Poor - Significant issues',
    E: 'Critical - Major problems',
  }
  return descriptions[rating]
}

/**
 * Calculate Security Rating
 * Based on vulnerability count and severity
 */
export function calculateSecurityRating(
  criticalVulns: number,
  highVulns: number,
  mediumVulns: number,
  lowVulns: number,
  totalLOC: number
): QualityRating {
  // Weight by severity
  const vulnerabilityScore = (criticalVulns * 4 + highVulns * 2 + mediumVulns * 1 + lowVulns * 0.5) / Math.max(1, totalLOC / 1000)

  let score = 10 - Math.min(10, vulnerabilityScore)
  return scoreToRating(score)
}

/**
 * Calculate Reliability Rating
 * Based on bug count and estimated effort
 */
export function calculateReliabilityRating(bugCount: number, totalLOC: number): QualityRating {
  const bugDensity = (bugCount / Math.max(1, totalLOC)) * 1000
  let score = 10 - Math.min(10, bugDensity * 5)
  return scoreToRating(score)
}

/**
 * Calculate Maintainability Rating
 * Based on code smells, complexity, and duplication
 */
export function calculateMaintainabilityRating(
  codeSmells: number,
  avgComplexity: number,
  duplicationPercentage: number,
  totalLOC: number
): QualityRating {
  // Code smell contribution (higher is worse)
  const codeSmellDensity = (codeSmells / Math.max(1, totalLOC)) * 1000

  // Complexity contribution (max score 3)
  const complexityScore = Math.min(3, avgComplexity / 10)

  // Duplication contribution (max score 2)
  const duplicationScore = Math.min(2, duplicationPercentage / 20)

  let score = 10 - codeSmellDensity - complexityScore - duplicationScore
  return scoreToRating(Math.max(0, score))
}

/**
 * Calculate Technical Debt Rating
 * Estimated effort to fix all issues
 */
export function calculateTechnicalDebtRating(effortMinutes: number): QualityRating {
  // Convert to effort days (8 hour workday)
  const effortDays = effortMinutes / 480

  if (effortDays < 1) return 'A'
  if (effortDays < 5) return 'B'
  if (effortDays < 20) return 'C'
  if (effortDays < 100) return 'D'
  return 'E'
}

/**
 * Get rating badge class for Tailwind CSS
 */
export function getRatingBadgeClass(rating: QualityRating): string {
  const classes = {
    A: 'bg-green-100 text-green-800 border-green-300',
    B: 'bg-blue-100 text-blue-800 border-blue-300',
    C: 'bg-amber-100 text-amber-800 border-amber-300',
    D: 'bg-orange-100 text-orange-800 border-orange-300',
    E: 'bg-red-100 text-red-800 border-red-300',
  }
  return classes[rating]
}

/**
 * Compare two ratings
 * Returns: 1 if better, -1 if worse, 0 if same
 */
export function compareRatings(rating1: QualityRating, rating2: QualityRating): number {
  const ratingValue = { A: 5, B: 4, C: 3, D: 2, E: 1 }
  const diff = ratingValue[rating1] - ratingValue[rating2]
  return diff > 0 ? 1 : diff < 0 ? -1 : 0
}

/**
 * Calculate overall quality score (0-100)
 * Weighted average of all components
 */
export function calculateOverallScore(
  securityRating: QualityRating,
  reliabilityRating: QualityRating,
  maintainabilityRating: QualityRating,
  weights = { security: 0.3, reliability: 0.4, maintainability: 0.3 }
): number {
  const ratingValue = { A: 90, B: 75, C: 60, D: 40, E: 20 }

  const weightedScore =
    ratingValue[securityRating] * weights.security +
    ratingValue[reliabilityRating] * weights.reliability +
    ratingValue[maintainabilityRating] * weights.maintainability

  return Math.round(weightedScore)
}

/**
 * Get trend indicator
 * Returns symbol and color for trend
 */
export function getTrendIndicator(
  previousRating: QualityRating,
  currentRating: QualityRating
): { symbol: string; color: string; text: string } {
  const comparison = compareRatings(currentRating, previousRating)

  if (comparison > 0) {
    return { symbol: '↑', color: '#10b981', text: 'Improved' }
  } else if (comparison < 0) {
    return { symbol: '↓', color: '#ef4444', text: 'Degraded' }
  } else {
    return { symbol: '→', color: '#6b7280', text: 'No change' }
  }
}
