import { describe, it, expect } from 'vitest'
import { scoreCandidate } from '@/lib/ats/screening-score'
import { defaultCriteria } from '@/lib/ats/pipeline'
import type { ParsedResume, ScreeningCriteria } from '@/lib/ats/contract'

const parsed = (p: Partial<ParsedResume> = {}): ParsedResume => ({ skills: [], titles: [], companies: [], education: [], parser: 'heuristic', ...p })
const crit = (c: Partial<ScreeningCriteria>): ScreeningCriteria => ({ ...defaultCriteria(), ...c })

describe('scoreCandidate', () => {
  it('scores must / nice skills with synonyms and lists missing must-haves', () => {
    const s = scoreCandidate(
      crit({ must_have_skills: ['JavaScript', 'Kubernetes'], nice_to_have_skills: ['GraphQL'], pass_score: 50 }),
      { text: 'Built UIs in JS and React; deployed with k8s', parsed: parsed() },
    )
    expect(s.missing_must).toEqual([])
    expect(s.breakdown.must).toBe(100)
    expect(s.breakdown.nice).toBe(0)
    // (35*1 + 15*0) / 50
    expect(s.score).toBe(70)
    expect(s.passed).toBe(true)
    expect(s.reasons[0]).toBe('Has all 2 must-have skills')
  })

  it('fails on a missing required must-have regardless of score', () => {
    const s = scoreCandidate(crit({ must_have_skills: ['Python', 'Go'], must_have_required: true, pass_score: 10 }), { text: 'python developer', parsed: parsed() })
    expect(s.missing_must).toEqual(['Go'])
    expect(s.score).toBe(50)
    expect(s.passed).toBe(false)
    expect(s.reasons).toContain('Missing a required must-have skill')
  })

  it('years range: inside, below, above, unknown', () => {
    const c = crit({ min_years: 3, max_years: 6 })
    expect(scoreCandidate(c, { text: '', parsed: parsed({ total_years: 4 }) }).score).toBe(100)
    expect(scoreCandidate(c, { text: '', parsed: parsed({ total_years: 1.5 }) }).score).toBe(50)
    expect(scoreCandidate(c, { text: '', parsed: parsed({ total_years: 12 }) }).score).toBe(50)
    expect(scoreCandidate(c, { text: '', parsed: parsed() }).score).toBe(50)
  })

  it('location: named city, remote, relocation', () => {
    const c = crit({ locations: ['Hyderabad', 'Bengaluru'] })
    expect(scoreCandidate(c, { text: '', parsed: parsed({ location: 'Hyderabad, Telangana' }) }).score).toBe(100)
    expect(scoreCandidate(c, { text: '', parsed: parsed({ location: 'Pune' }) }).score).toBe(0)
    expect(scoreCandidate({ ...c, relocation_ok: true }, { text: '', parsed: parsed({ location: 'Pune' }), relocate: true }).score).toBe(90)
    expect(scoreCandidate(crit({ locations: ['Remote'] }), { text: '', parsed: parsed({ location: 'Pune' }) }).score).toBe(100)
    expect(scoreCandidate(c, { text: '', parsed: parsed({ location: 'Pune' }) }, { work_mode: 'remote' }).score).toBe(100)
  })

  it('notice, education, salary and keywords', () => {
    const c = crit({ max_notice_days: 30, education: ['B.Tech', 'MCA'], max_expected_salary: 1_000_000, keywords: ['payments', 'kafka'] })
    const s = scoreCandidate(c, {
      text: 'Worked on payments platform',
      parsed: parsed({ notice_days: 60, education: [{ degree: 'MCA' }], expected_salary: 1_200_000 }),
    })
    expect(s.breakdown).toEqual({ keywords: 50, notice: 0, education: 100, salary: 80 })
    expect(s.reasons).toContain('60-day notice — longer than 30 days')
    expect(s.reasons).toContain('Expected salary 20% over budget')
    expect(scoreCandidate(crit({ education: ['Bachelor'] }), { text: '', parsed: parsed({ education: [{ degree: 'B.E' }] }) }).breakdown.education).toBe(100)
  })

  it('AI fit is one weighted component when enabled, ignored when unavailable', () => {
    const c = crit({ must_have_skills: ['Python'], use_ai_match: true })
    expect(scoreCandidate(c, { text: 'python', parsed: parsed(), aiFit: 50 }).score).toBe(Math.round(((35 + 20 * 0.5) / 55) * 100))
    const none = scoreCandidate(c, { text: 'python', parsed: parsed(), aiFit: null })
    expect(none.score).toBe(100)
    expect(none.reasons.join(' ')).toMatch(/AI fit unavailable/)
  })

  it('custom weights and no criteria', () => {
    const c = crit({ must_have_skills: ['Python'], nice_to_have_skills: ['Rust'], weights: { must: 1, nice: 1 } })
    expect(scoreCandidate(c, { text: 'python', parsed: parsed() }).score).toBe(50)
    const empty = scoreCandidate(crit({ pass_score: 90 }), { text: '', parsed: null })
    expect(empty.score).toBe(100)
    expect(empty.passed).toBe(true)
  })
})
