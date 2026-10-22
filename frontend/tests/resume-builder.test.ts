import { describe, expect, it } from 'vitest'
import { careerAiAllowed, DEFAULT_CAREER_AI, mergeCareerAi } from '@/lib/career-ai/settings'
import { EMPTY_RESUME, resumeFromProfile, resumeToText, sanitizeBuilderData, sanitizeTemplate } from '@/lib/resume/builder'

describe('sanitizeBuilderData', () => {
  it('whitelists and clamps, including the new sections', () => {
    const d = sanitizeBuilderData({ personal: { fullName: 'A'.repeat(500), evil: 1 }, targetRole: 'Backend', projects: [{ id: 'x y', name: 'P', extra: 1 }], certificates: Array(50).fill({ name: 'C' }), achievements: 'nope' })!
    expect(d.personal.fullName).toHaveLength(120)
    expect((d.personal as Record<string, unknown>).evil).toBeUndefined()
    expect(d.targetRole).toBe('Backend')
    expect(d.projects[0]).toEqual({ id: 'item-0', name: 'P', link: '', dates: '', description: '' })
    expect(d.certificates).toHaveLength(20)
    expect(d.achievements).toEqual([])
    expect(sanitizeBuilderData(null)).toBeNull()
    expect(sanitizeBuilderData([])).toBeNull()
  })
  it('templates default to the ATS one', () => {
    expect(sanitizeTemplate('modern')).toBe('modern')
    expect(sanitizeTemplate('zzz')).toBe('ats')
  })
})

describe('resumeToText', () => {
  it('renders one column in ATS order and skips empty sections', () => {
    const t = resumeToText({
      ...EMPTY_RESUME,
      personal: { ...EMPTY_RESUME.personal, fullName: 'Asha Rao', email: 'a@x.in', location: 'Hyderabad' },
      targetRole: 'Backend engineer',
      experience: [{ id: '1', role: 'Intern', company: 'Acme', dates: '2025', description: '• Built APIs' }],
      skills: 'Python, SQL',
    })
    expect(t.split('\n').slice(0, 3)).toEqual(['Asha Rao', 'Backend engineer', 'a@x.in | Hyderabad'])
    expect(t).toContain('EXPERIENCE\nIntern | Acme | 2025\n• Built APIs')
    expect(t).toContain('SKILLS\nPython, SQL')
    expect(t).not.toContain('PROJECTS')
  })
})

describe('resumeFromProfile', () => {
  it('puts verified skills first with level, de-duplicates self-reported, maps profile sections', () => {
    const d = resumeFromProfile(
      {
        name: 'Asha', email: 'a@x.in',
        basic: { firstName: 'Asha', lastName: 'Rao', phone: '+91 9', location: 'Hyderabad', designation: 'Student' },
        skills: 'Python, Docker', links: { github: 'gh/asha' },
        education: [{ qualification: 'B.Tech', course: 'CSE', college: 'VNR', start: '2022', end: '2026' }],
        projects: [{ name: 'Bot', link: 'x', description: 'A bot', start: '2025' }, { name: '' }],
        achievements: [{ title: 'Hackathon finalist', description: 'Top 10' }],
      },
      { skills: [{ skill: 'python', level: 'advanced' }], selfReported: ['docker'], evidence: [
        { kind: 'certificate', title: 'SQL basics', at: '2026-01-02T00:00:00Z', publicLink: 'https://c' },
        { kind: 'contest', title: 'Weekly 12', at: '2026-02-01T00:00:00Z', rank: 3, participants: 400 },
        { kind: 'contest', title: 'No rank', at: '2026-02-01T00:00:00Z', rank: null },
      ] },
    )
    expect(d.personal.fullName).toBe('Asha Rao')
    expect(d.personal.portfolio).toBe('gh/asha')
    expect(d.targetRole).toBe('Student')
    expect(d.skills).toBe('python (Advanced), docker')
    expect(d.education[0]).toMatchObject({ institution: 'VNR', degree: 'B.Tech, CSE', dates: '2022 – 2026' })
    expect(d.projects).toHaveLength(1)
    expect(d.certificates[0]).toMatchObject({ name: 'SQL basics', issuer: 'CodeSpectra', date: '2026-01-02' })
    expect(d.achievements.map((a) => a.title)).toEqual(['Weekly 12', 'Hackathon finalist'])
    expect(d.achievements[0].detail).toBe('Rank 3 of 400')
  })
})

describe('career AI caps', () => {
  const now = new Date('2026-10-23T10:00:00Z')
  const usage = { day: '2026-10-23', day_count: 0, month: '2026-10', month_cost_usd: 0 }
  it('allows under the caps and names the cap that blocks', () => {
    expect(careerAiAllowed(DEFAULT_CAREER_AI, usage, 0, now)).toEqual({ ok: true })
    expect(careerAiAllowed({ ...DEFAULT_CAREER_AI, resume_ai: false }, usage, 0, now)).toEqual({ ok: false, code: 'career_ai_off' })
    expect(careerAiAllowed(DEFAULT_CAREER_AI, { ...usage, month_cost_usd: 5 }, 0, now)).toEqual({ ok: false, code: 'career_ai_monthly_cap' })
    expect(careerAiAllowed(DEFAULT_CAREER_AI, { ...usage, day_count: 500 }, 0, now)).toEqual({ ok: false, code: 'career_ai_daily_cap' })
    expect(careerAiAllowed(DEFAULT_CAREER_AI, usage, 5, now)).toEqual({ ok: false, code: 'career_ai_user_cap' })
  })
  it('old counters reset with a new day / month', () => {
    expect(careerAiAllowed(DEFAULT_CAREER_AI, { day: '2026-10-22', day_count: 9999, month: '2026-09', month_cost_usd: 999 }, 0, now)).toEqual({ ok: true })
  })
  it('merges stored settings over defaults, ignoring bad fields', () => {
    expect(mergeCareerAi({ daily_cap: 10, junk: 1 }).daily_cap).toBe(10)
    expect(mergeCareerAi({ daily_cap: -5 })).toEqual(DEFAULT_CAREER_AI)
  })
})
