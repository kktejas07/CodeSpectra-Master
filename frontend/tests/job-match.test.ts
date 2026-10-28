import { describe, expect, it } from 'vitest'
import { annualMinor, experiencePart, locationPart, matchScore, rankMatches, salaryPart, skillPart, toMatchLevel } from '@/lib/job-match/score'

const job = { skills: ['React', 'TypeScript', 'node'], location: 'Hyderabad, India', work_mode: 'onsite' as const, experience_min: 1, experience_max: 3, salary: { min: 600000, max: 1000000, currency: 'INR', period: 'year' as const } }

describe('skill part', () => {
  it('weights each covered skill by verified level and lists the gaps', () => {
    const r = skillPart(job, { skills: [{ skill: 'reactjs', level: 'expert' }, { skill: 'ts', level: 'intermediate' }] })
    expect(r.matched).toEqual([{ skill: 'react', level: 'expert' }, { skill: 'typescript', level: 'intermediate' }])
    expect(r.missing).toEqual(['node.js'])
    expect(r.part?.score).toBe(Math.round(((1 + 0.65) / 3) * 100))
  })
  it('keeps the best level when a skill appears twice; self-reported counts little', () => {
    const r = skillPart({ skills: ['python'] }, { skills: [{ skill: 'python', level: 'self' }, { skill: 'py', level: 'advanced' }] })
    expect(r.part?.score).toBe(85)
    expect(skillPart({ skills: ['python'] }, { skills: [{ skill: 'python', level: 'self' }] }).part?.score).toBe(20)
  })
  it('a job without skills has no skill part', () => {
    expect(skillPart({ skills: [] }, { skills: [] }).part).toBeNull()
  })
})

describe('location, experience, salary', () => {
  it('location', () => {
    expect(locationPart({ ...job, work_mode: 'remote' }, { skills: [] })?.score).toBe(100)
    expect(locationPart(job, { skills: [], city: 'hyderabad' })?.score).toBe(100)
    expect(locationPart(job, { skills: [], city: 'Pune', country: 'India' })?.score).toBe(60)
    expect(locationPart(job, { skills: [], city: 'Pune', open_to_relocate: true })?.score).toBe(70)
    expect(locationPart(job, { skills: [], city: 'Austin', country: 'US' })?.score).toBe(20)
    expect(locationPart(job, { skills: [] })).toBeNull()
    expect(locationPart({ ...job, location: null }, { skills: [], city: 'x' })).toBeNull()
  })
  it('experience', () => {
    expect(experiencePart(job, { skills: [], experience_years: 2 })?.score).toBe(100)
    expect(experiencePart(job, { skills: [], experience_years: 0 })?.score).toBe(65)
    expect(experiencePart(job, { skills: [], experience_years: 8 })?.score).toBe(80)
    expect(experiencePart(job, { skills: [] })).toBeNull()
  })
  it('salary in annual minor units, same currency only', () => {
    expect(annualMinor(50000, 'month')).toBe(50000 * 100 * 12)
    expect(annualMinor(undefined)).toBeNull()
    expect(salaryPart(job, { skills: [], expected_salary_minor: 800000_00, currency: 'INR' })?.score).toBe(100)
    expect(salaryPart(job, { skills: [], expected_salary_minor: 1200000_00, currency: 'INR' })?.score).toBe(60)
    expect(salaryPart(job, { skills: [], expected_salary_minor: 800000_00, currency: 'USD' })).toBeNull()
    expect(salaryPart({ ...job, salary: null }, { skills: [], expected_salary_minor: 1 })).toBeNull()
  })
})

describe('match score', () => {
  it('re-normalises weights over the parts it could compare', () => {
    const r = matchScore({ skills: ['python'] }, { skills: [{ skill: 'python', level: 'expert' }] })
    expect(r.score).toBe(100)
    expect(r.parts).toHaveLength(1)
    expect(r.parts[0].weight).toBe(1)
  })
  it('combines parts with the default weights', () => {
    const r = matchScore(job, { skills: [{ skill: 'react', level: 'expert' }, { skill: 'typescript', level: 'expert' }, { skill: 'node', level: 'expert' }], city: 'Hyderabad', experience_years: 2, expected_salary_minor: 2000000_00, currency: 'INR' })
    // skills 100, location 100, experience 100, salary 0 → 90
    expect(r.score).toBe(90)
    expect(r.parts.map((p) => p.key)).toEqual(['skills', 'location', 'experience', 'salary'])
  })
  it('is zero with nothing to compare', () => {
    expect(matchScore({ skills: [] }, { skills: [] }).score).toBe(0)
  })
  it('ranks by score, then verified matches', () => {
    const m = (score: number, n: number) => ({ match: { score, parts: [], matched: Array(n).fill({ skill: 'x', level: 'expert' }), missing: [] } })
    const out = rankMatches([m(50, 1), m(80, 0), m(50, 3)])
    expect(out.map((x) => [x.match.score, x.match.matched.length])).toEqual([[80, 0], [50, 3], [50, 1]])
  })
  it('maps passport levels', () => {
    expect(toMatchLevel('advanced')).toBe('advanced')
    expect(toMatchLevel('guru')).toBe('self')
  })
})
