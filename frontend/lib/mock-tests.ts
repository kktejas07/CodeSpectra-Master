/** Sample mock tests shown on /dashboard/mock-tests. Shared so the setup and
 * take pages can resolve company/role for an id when query params are absent. */
export const MOCK_TESTS = [
  { id: 'tcs-software-engineer', company: 'TCS', role: 'Software Engineer', type: 'Tech', level: 'Entry-level' },
  { id: 'tcs-qa-engineer', company: 'TCS', role: 'QA Engineer', type: 'Tech', level: 'Mid-level' },
  { id: 'ey-data-analyst', company: 'EY', role: 'Data Analyst', type: 'Data', level: 'Entry-level' },
  { id: 'fractal-data-scientist', company: 'Fractal Analytics', role: 'Data Scientist', type: 'Data', level: 'Advanced' },
  { id: 'google-sde', company: 'Google', role: 'Software Development Engineer', type: 'Tech', level: 'Mid-level' },
  { id: 'amazon-sde', company: 'Amazon', role: 'SDE I', type: 'Tech', level: 'Entry-level' },
  { id: 'wipro-frontend', company: 'Wipro', role: 'Frontend Developer', type: 'Tech', level: 'Mid-level' },
] as const

export type MockTestCatalogItem = (typeof MOCK_TESTS)[number]

/** Query string carrying company + role, used from the list → setup → take pages. */
export function mockTestQuery(company: string, role: string): string {
  return new URLSearchParams({ company: company.trim(), role: role.trim() }).toString()
}

/** Collections used by /api/mock-tests/*. */
export const MOCK_TEST_SESSIONS = 'mock_test_sessions'
