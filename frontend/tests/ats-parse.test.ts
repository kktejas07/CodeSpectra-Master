import { describe, it, expect } from 'vitest'
import { heuristicParse, yearsFromRanges, statedYears, noticeDays, educationFrom, mergeAiParse } from '@/lib/ats/parse'
import { toE164, countryFromE164 } from '@/lib/ats/phone'
import { canonicalSkill, dictionarySkillsIn, hasSkill } from '@/lib/ats/skills'

const NOW = new Date('2026-10-01T00:00:00Z')

const RESUME = `PRIYA SHARMA
Senior Software Engineer
priya.sharma@Example.com | +91 98765 43210 | Location: Hyderabad

Summary
Backend engineer with strong Node.js, TypeScript and AWS experience building payment systems.

Experience
Senior Software Engineer, Acme Technologies Pvt Ltd
Jan 2021 – Present
Software Engineer, Beta Solutions
Jun 2018 - Dec 2020

Education
B.Tech in Computer Science, JNTU Hyderabad University
2014 - 2018

Skills: JS, React.js, Docker, k8s, PostgreSQL, Go, Rust
Notice period: 30 days
Expected CTC: 24 LPA
`

describe('heuristic résumé parse', () => {
  const p = heuristicParse(RESUME, { now: NOW })

  it('finds contact details (email lowercased, phone in E.164)', () => {
    expect(p.name).toBe('Priya Sharma')
    expect(p.email).toBe('priya.sharma@example.com')
    expect(p.phone).toBe('+919876543210')
    expect(p.location).toBe('Hyderabad')
    expect(p.parser).toBe('heuristic')
  })

  it('computes years from date ranges outside the education section', () => {
    // Jun 2018 → Dec 2020 (31 months) + Jan 2021 → Oct 2026 (70 months) = 101 months
    expect(p.total_years).toBeCloseTo(8.4, 1)
  })

  it('matches dictionary skills with synonyms', () => {
    expect(p.skills).toEqual(expect.arrayContaining(['javascript', 'typescript', 'node.js', 'react', 'docker', 'kubernetes', 'postgresql', 'aws', 'go', 'rust']))
  })

  it('reads education, notice period and expected salary', () => {
    expect(p.education[0]).toMatchObject({ degree: 'B.Tech', field: 'Computer Science', year: 2018 })
    expect(p.education[0].institution).toMatch(/University/)
    expect(p.notice_days).toBe(30)
    expect(p.expected_salary).toBe(2_400_000)
  })

  it('collects titles and companies', () => {
    expect(p.titles[0]).toMatch(/Software Engineer/i)
    expect(p.companies).toContain('Acme Technologies Pvt Ltd')
  })
})

describe('years / notice helpers', () => {
  it('merges overlapping ranges and caps at now', () => {
    expect(yearsFromRanges('2019 - 2021\nMar 2020 – Feb 2022', NOW)).toBeCloseTo(3.2, 1)
    expect(yearsFromRanges('01/2020 - 12/2020', NOW)).toBe(1)
    expect(yearsFromRanges('no dates here', NOW)).toBeNull()
  })
  it('prefers a stated total', () => {
    expect(statedYears('I have 5+ years of experience in Java')).toBe(5)
    expect(statedYears('Total experience: 3.5 yrs')).toBe(3.5)
    expect(heuristicParse('Over 6 years of experience\n2010 - 2024').total_years).toBe(6)
  })
  it('notice phrases', () => {
    expect(noticeDays('Immediate joiner')).toBe(0)
    expect(noticeDays('notice period of 2 months')).toBe(60)
    expect(noticeDays('3 weeks notice')).toBe(21)
    expect(noticeDays('nothing')).toBeNull()
  })
  it('degrees', () => {
    expect(educationFrom('MCA, Osmania University, 2019').map((e) => e.degree)).toEqual(['MCA'])
    expect(educationFrom('Master of Science in Data Science').map((e) => e.degree)).toEqual(['M.S'])
  })
})

describe('phones', () => {
  it('normalises to E.164 with the candidate country', () => {
    expect(toE164('098765 43210', 'IN')).toBe('+919876543210')
    expect(toE164('(415) 555-0134', 'US')).toBe('+14155550134')
    expect(toE164('+44 20 7946 0958')).toBe('+442079460958')
    expect(toE164('0044 20 7946 0958')).toBe('+442079460958')
    expect(toE164('12')).toBeNull()
    expect(countryFromE164('+919876543210')).toBe('IN')
    expect(countryFromE164('+14155550134')).toBe('US')
  })
})

describe('skills', () => {
  it('canonicalises and matches on word boundaries', () => {
    expect(canonicalSkill('JS')).toBe('javascript')
    expect(canonicalSkill('k8s')).toBe('kubernetes')
    expect(hasSkill('javascript', ' worked with js daily ')).toBe(true)
    expect(hasSkill('java', ' javascript only ')).toBe(false)
    expect(hasSkill('c++', ' modern c++ and python ')).toBe(true)
    expect(dictionarySkillsIn('Let us go to the office')).not.toContain('go')
  })
})

describe('AI merge', () => {
  it('validates model output and refuses invented contact details', () => {
    const heur = heuristicParse('Ravi Kumar\nSkills: Python', { now: NOW })
    const merged = mergeAiParse(
      { name: 'Ravi Kumar', email: 'fake@evil.com', phone: '+1 202 555 0100', total_years: '4', skills: ['Django', 'python'], education: [{ degree: 'B.E', school: 'VNR VJIET', year: 2020 }], notice_days: 999 },
      heur,
      'Ravi Kumar\nSkills: Python',
    )
    expect(merged.parser).toBe('ai')
    expect(merged.email).toBeUndefined()
    expect(merged.phone).toBeUndefined()
    expect(merged.total_years).toBe(4)
    expect(merged.skills.map((s) => s.toLowerCase())).toEqual(['django', 'python'])
    expect(merged.education[0]).toEqual({ degree: 'B.E', institution: 'VNR VJIET', year: 2020 })
    expect(merged.notice_days).toBeNull() // 999 out of range, heuristic had none
    expect(mergeAiParse(null, heur, '')).toBe(heur)
  })
})
