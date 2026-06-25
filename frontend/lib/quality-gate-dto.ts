/** Maps DB `quality_gates` rows to API / `check-quality-gate` shape. */

export type QualityGateDTO = {
  id: string
  gate_name: string
  description: string
  min_quality_score: number
  max_bugs_count: number
  max_vulnerabilities_count: number
  max_code_smells_count: number
  min_test_coverage_percent: number
  max_security_hotspots_count: number
  max_duplicated_code_percentage: number
  is_default: boolean
  is_active: boolean
  custom_rules: Record<string, unknown>
  standards: string[]
  enforce_on_push: boolean
  created_at?: string
  updated_at?: string
  /** Alias for check-quality-gate POST body */
  gate_config: {
    min_quality_score: number
    max_bugs_count: number
    max_vulnerabilities_count: number
    max_code_smells_count: number
    min_test_coverage_percent: number
  }
}

export function rowToQualityGateDTO(row: Record<string, unknown>): QualityGateDTO {
  const minQ = Number(row.min_quality_score ?? 50)
  const maxBugs = Number(row.max_bugs ?? 0)
  const maxVuln = Number(row.max_vulnerabilities ?? 0)
  const maxSmells = Number(row.max_code_smells ?? 10)
  const minCov = Number(row.min_test_coverage_percentage ?? 50)
  const maxHot = Number(row.max_security_hotspots ?? 5)
  const maxDup = Number(row.max_duplicated_code_percentage ?? 10)

  const gate_config = {
    min_quality_score: minQ,
    max_bugs_count: maxBugs,
    max_vulnerabilities_count: maxVuln,
    max_code_smells_count: maxSmells,
    min_test_coverage_percent: minCov,
  }

  return {
    id: String(row.id),
    gate_name: String(row.gate_name ?? ''),
    description: typeof row.description === 'string' ? row.description : '',
    min_quality_score: minQ,
    max_bugs_count: maxBugs,
    max_vulnerabilities_count: maxVuln,
    max_code_smells_count: maxSmells,
    min_test_coverage_percent: minCov,
    max_security_hotspots_count: maxHot,
    max_duplicated_code_percentage: maxDup,
    is_default: Boolean(row.is_default),
    is_active: row.is_active !== false,
    custom_rules: (row.custom_rules as Record<string, unknown>) ?? {},
    standards: Array.isArray(row.standards) ? (row.standards as string[]) : [],
    enforce_on_push: Boolean(row.enforce_on_push),
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
    gate_config,
  }
}

export function bodyToQualityGateRow(
  userId: string,
  body: Record<string, unknown>,
  mode: 'insert' | 'update'
): Record<string, unknown> {
  const now = new Date().toISOString()
  const row: Record<string, unknown> = {
    gate_name: body.gate_name,
    description: typeof body.description === 'string' ? body.description : null,
    min_quality_score: Number(body.min_quality_score ?? 70),
    max_bugs: Number(body.max_bugs_count ?? body.max_bugs ?? 0),
    max_vulnerabilities: Number(body.max_vulnerabilities_count ?? body.max_vulnerabilities ?? 0),
    max_code_smells: Number(body.max_code_smells_count ?? body.max_code_smells ?? 10),
    max_security_hotspots: Number(body.max_security_hotspots_count ?? body.max_security_hotspots ?? 5),
    max_duplicated_code_percentage: Number(body.max_duplicated_code_percentage ?? 10),
    min_test_coverage_percentage: Number(body.min_test_coverage_percent ?? body.min_test_coverage_percentage ?? 50),
    is_default: Boolean(body.is_default),
    is_active: body.is_active !== false,
    custom_rules: (body.custom_rules as Record<string, unknown>) ?? {},
    standards: Array.isArray(body.standards) ? body.standards : [],
    enforce_on_push: Boolean(body.enforce_on_push),
    updated_at: now,
  }
  if (mode === 'insert') {
    row.user_id = userId
    row.created_at = now
  }
  return row
}
