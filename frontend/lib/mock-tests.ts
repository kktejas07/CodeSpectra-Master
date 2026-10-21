/** Sample mock tests shown on /dashboard/mock-tests. Shared so the
 * setup and take pages can resolve company/role for an id when query params are absent.
 * `pattern` links an entry to a company exam pattern (Admin → Company patterns): the
 * catalogue opens the timed, sectioned practice run for it instead of the AI mock. */
export interface MockTestCatalogItem {
  id: string
  company: string
  role: string
  type: 'Tech' | 'Data'
  level: 'Entry-level' | 'Mid-level' | 'Advanced'
  /** company_exam_patterns id; null = AI-generated mock only. */
  pattern: string | null
}

export const MOCK_TESTS: readonly MockTestCatalogItem[] = [
  { id: 'tcs-software-engineer', company: 'TCS', role: 'Software Engineer', type: 'Tech', level: 'Entry-level', pattern: 'tcs-nqt' },
  { id: 'tcs-qa-engineer', company: 'TCS', role: 'QA Engineer', type: 'Tech', level: 'Mid-level', pattern: null },
  { id: 'ey-data-analyst', company: 'EY', role: 'Data Analyst', type: 'Data', level: 'Entry-level', pattern: null },
  { id: 'fractal-data-scientist', company: 'Fractal Analytics', role: 'Data Scientist', type: 'Data', level: 'Advanced', pattern: null },
  { id: 'google-sde', company: 'Google', role: 'Software Development Engineer', type: 'Tech', level: 'Mid-level', pattern: 'google-oa' },
  { id: 'amazon-sde', company: 'Amazon', role: 'SDE I', type: 'Tech', level: 'Entry-level', pattern: 'amazon-sde-oa' },
  { id: 'wipro-frontend', company: 'Wipro', role: 'Frontend Developer', type: 'Tech', level: 'Mid-level', pattern: null },
  { id: 'wipro-elite-nth', company: 'Wipro', role: 'Project Engineer (Elite NTH)', type: 'Tech', level: 'Entry-level', pattern: 'wipro-elite-nth' },
  { id: 'infosys-sp-dse', company: 'Infosys', role: 'Specialist Programmer / DSE', type: 'Tech', level: 'Entry-level', pattern: 'infosys-sp-dse' },
  { id: 'accenture-ase', company: 'Accenture', role: 'Associate Software Engineer', type: 'Tech', level: 'Entry-level', pattern: 'accenture-ase' },
  { id: 'cognizant-genc', company: 'Cognizant', role: 'GenC Programmer Analyst', type: 'Tech', level: 'Entry-level', pattern: 'cognizant-genc' },
  { id: 'capgemini-analyst', company: 'Capgemini', role: 'Analyst', type: 'Tech', level: 'Entry-level', pattern: 'capgemini-analyst' },
  { id: 'hcl-techbee', company: 'HCLTech', role: 'TechBee trainee', type: 'Tech', level: 'Entry-level', pattern: 'hcl-techbee' },
]

/** Query string carrying company + role, used from the list → setup → take pages. */
export function mockTestQuery(company: string, role: string): string {
  return new URLSearchParams({ company: company.trim(), role: role.trim() }).toString()
}

/** Where a catalogue entry opens: the pattern practice run when it has one, else the AI mock test. */
export function mockTestHref(t: Pick<MockTestCatalogItem, 'id' | 'company' | 'role' | 'pattern'>): string {
  return t.pattern ? `/dashboard/company-tests/${t.pattern}` : `/dashboard/mock-tests/${t.id}?${mockTestQuery(t.company, t.role)}`
}

/** Collections used by /api/mock-tests/*. */
export const MOCK_TEST_SESSIONS = 'mock_test_sessions'
