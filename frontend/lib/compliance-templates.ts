/**
 * Phase 4: compliance presets → `quality_gates.standards` + suggested numeric thresholds (API body fields).
 */

export interface ComplianceGatePreset {
  id: string
  label: string
  description: string
  standards: string[]
  min_quality_score: number
  max_bugs_count: number
  max_vulnerabilities_count: number
  max_code_smells_count: number
  min_test_coverage_percent: number
  max_security_hotspots_count: number
  max_duplicated_code_percentage: number
  enforce_on_push: boolean
}

export const COMPLIANCE_GATE_PRESETS: ComplianceGatePreset[] = [
  {
    id: 'owasp-strict',
    label: 'OWASP-focused',
    description: 'Tight security posture: zero tolerance for vulnerabilities, moderate smells.',
    standards: ['OWASP Top 10', 'CWE'],
    min_quality_score: 72,
    max_bugs_count: 3,
    max_vulnerabilities_count: 0,
    max_code_smells_count: 25,
    min_test_coverage_percent: 55,
    max_security_hotspots_count: 2,
    max_duplicated_code_percentage: 6,
    enforce_on_push: true,
  },
  {
    id: 'nist-balanced',
    label: 'NIST / balanced',
    description: 'Enterprise-friendly defaults aligned with common NIST SSDF-style checks.',
    standards: ['NIST SSDF', 'OWASP Top 10'],
    min_quality_score: 65,
    max_bugs_count: 8,
    max_vulnerabilities_count: 1,
    max_code_smells_count: 60,
    min_test_coverage_percent: 50,
    max_security_hotspots_count: 5,
    max_duplicated_code_percentage: 10,
    enforce_on_push: false,
  },
  {
    id: 'fast-pr',
    label: 'PR quick gate',
    description: 'Light gate for feature branches — catch only severe regressions.',
    standards: ['Team baseline'],
    min_quality_score: 50,
    max_bugs_count: 15,
    max_vulnerabilities_count: 3,
    max_code_smells_count: 120,
    min_test_coverage_percent: 35,
    max_security_hotspots_count: 12,
    max_duplicated_code_percentage: 15,
    enforce_on_push: false,
  },
]

export function findCompliancePreset(id: string): ComplianceGatePreset | undefined {
  return COMPLIANCE_GATE_PRESETS.find((p) => p.id === id)
}
