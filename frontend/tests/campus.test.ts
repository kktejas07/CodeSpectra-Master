import { describe, expect, it } from 'vitest'
import { csvCell, parseCsv, toCsv, validateStudentCsv } from '@/lib/campus/csv'
import { checkEligibility, decideInviteJoin, decideSelfJoin, driveAcceptsApplications } from '@/lib/campus/rules'
import { computeReadiness, percentileFromRank, studentReadiness } from '@/lib/campus/readiness'
import { median, placementStats } from '@/lib/campus/stats'
import { cleanDomains, driveInputSchema, onCollegeDomain } from '@/lib/campus/types'
import { campusRoleFor } from '@/lib/campus/access'
import { readinessCsv } from '@/lib/campus/export'

const departments = [{ id: 'd1', name: 'Computer Science', code: 'CSE' }, { id: 'd2', name: 'Electronics', code: 'ECE' }]
const batches = [
  { id: 'b1', name: '2027 CSE', department_id: 'd1', graduation_year: 2027 },
  { id: 'b2', name: '2027 ECE', department_id: 'd2', graduation_year: 2027 },
  { id: 'b3', name: '2028', department_id: null, graduation_year: 2028 },
]

describe('campus CSV', () => {
  it('parses quoted fields, escaped quotes, CRLF and blank lines', () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\n\n1,2')).toEqual([['a', 'b'], ['x, y', 'he said "hi"'], ['1', '2']])
  })

  it('validates rows against departments and batches', () => {
    const csv = [
      'Name,Email,Roll No,Branch,Year,CGPA,Backlogs',
      'Asha Rao,ASHA@college.edu,21cs001,CSE,2027,8.456,0',
      'Ravi,ravi@college.edu,21ec002,Electronics,2027,7,1',
      'No Email,,x,CSE,2027,,',
      'Dup,asha@college.edu,21cs009,CSE,2027,,',
      'Bad dept,b@college.edu,,MECH,,,',
      'Bad gpa,c@college.edu,,,,11,',
      'Bad roll,d@college.edu,21 CS 001,,,,',
    ].join('\n')
    const r = validateStudentCsv(csv, { departments, batches })
    expect(r.total).toBe(7)
    expect(r.rows.map((x) => x.email)).toEqual(['asha@college.edu', 'ravi@college.edu'])
    expect(r.rows[0]).toMatchObject({ roll_no: '21CS001', department_id: 'd1', batch_id: 'b1', cgpa: 8.46, backlogs: 0 })
    expect(r.rows[1]).toMatchObject({ department_id: 'd2', batch_id: 'b2', backlogs: 1 })
    expect(r.issues.map((i) => i.line)).toEqual([4, 5, 6, 7, 8])
    expect(r.issues[1].message).toMatch(/twice/)
  })

  it('requires the header columns', () => {
    expect(validateStudentCsv('foo,bar\n1,2', { departments, batches }).issues[0].message).toMatch(/name/)
  })

  it('guards export cells against formula injection', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+1')).toBe("'+1")
    expect(toCsv(['a'], [['x,y']])).toBe('a\r\n"x,y"\r\n')
  })
})

describe('campus domains and roles', () => {
  it('rejects public webmail and bad domains', () => {
    expect(cleanDomains('college.edu, @CSE.College.edu')).toEqual({ ok: true, domains: ['college.edu', 'cse.college.edu'] })
    expect(cleanDomains(['gmail.com']).ok).toBe(false)
    expect(cleanDomains(['not a domain']).ok).toBe(false)
  })
  it('matches sub-domains', () => {
    expect(onCollegeDomain('a@cse.college.edu', ['college.edu'])).toBe(true)
    expect(onCollegeDomain('a@evilcollege.edu', ['college.edu'])).toBe(false)
  })
  it('maps campus roles', () => {
    const college = { tenant_id: 't1', staff: [{ user_id: 'u9', email: '', name: '', added_at: '' }] }
    expect(campusRoleFor({ id: 'x', role: 'superadmin', tenantId: null }, college)).toBe('superadmin')
    expect(campusRoleFor({ id: 'x', role: 'tenant_admin', tenantId: 't1' }, college)).toBe('college_admin')
    expect(campusRoleFor({ id: 'x', role: 'tenant_admin', tenantId: 't2' }, college)).toBeNull()
    expect(campusRoleFor({ id: 'u9', role: 'user', tenantId: null }, college)).toBe('placement_officer')
    expect(campusRoleFor({ id: 'u1', role: 'user', tenantId: null }, college)).toBeNull()
  })
})

describe('eligibility', () => {
  const rules = { min_cgpa: 7, max_backlogs: 0, department_ids: ['d1'], graduation_years: [2027] }
  const s = { status: 'verified' as const, department_id: 'd1', cgpa: 7.5, backlogs: 0, graduation_year: 2027 }
  it('passes an eligible student', () => {
    expect(checkEligibility(s, rules)).toEqual({ eligible: true, reasons: [] })
  })
  it('lists every reason', () => {
    const r = checkEligibility({ status: 'pending', department_id: 'd2', cgpa: null, backlogs: 2, graduation_year: 2028 }, rules)
    expect(r.eligible).toBe(false)
    expect(r.reasons).toHaveLength(5)
  })
  it('empty lists mean everyone', () => {
    expect(checkEligibility({ ...s, department_id: null, graduation_year: null }, { min_cgpa: null, max_backlogs: null, department_ids: [], graduation_years: [] }).eligible).toBe(true)
  })
  it('closes applications after the deadline or when not open', () => {
    const now = new Date('2026-10-01T00:00:00Z')
    expect(driveAcceptsApplications({ status: 'open', schedule: { apply_by: '2026-10-02T00:00:00Z' } }, now)).toBe(true)
    expect(driveAcceptsApplications({ status: 'open', schedule: { apply_by: '2026-09-30T00:00:00Z' } }, now)).toBe(false)
    expect(driveAcceptsApplications({ status: 'draft', schedule: { apply_by: '2026-10-02T00:00:00Z' } }, now)).toBe(false)
  })
})

describe('verification on join', () => {
  const record = { user_id: null, roll_no: '21CS001', invite_expires_at: '2026-12-01T00:00:00Z' }
  const now = new Date('2026-10-01T00:00:00Z')
  it('verifies by college domain', () => {
    expect(decideInviteJoin({ record, userId: 'u1', userEmail: 'a@college.edu', domains: ['college.edu'], now })).toEqual({ ok: true, status: 'verified', via: 'domain' })
  })
  it('falls back to the roll number', () => {
    const base = { record, userId: 'u1', userEmail: 'a@gmail.com', domains: ['college.edu'], now }
    expect(decideInviteJoin(base)).toMatchObject({ ok: false, status: 400, needs_roll_no: true })
    expect(decideInviteJoin({ ...base, rollNo: '21cs 002' })).toMatchObject({ ok: false, status: 403 })
    expect(decideInviteJoin({ ...base, rollNo: ' 21cs001 ' })).toEqual({ ok: true, status: 'verified', via: 'roll_no' })
  })
  it('refuses a used or expired invite', () => {
    expect(decideInviteJoin({ record: { ...record, user_id: 'other' }, userId: 'u1', userEmail: 'a@college.edu', domains: ['college.edu'], now })).toMatchObject({ status: 409 })
    expect(decideInviteJoin({ record, userId: 'u1', userEmail: 'a@college.edu', domains: ['college.edu'], now: new Date('2027-01-01') })).toMatchObject({ status: 410 })
  })
  it('self-join needs a college email and never hands over someone else\'s roll number', () => {
    const base = { userId: 'u1', userEmail: 'me@college.edu', domains: ['college.edu'], byEmail: null, byRoll: null }
    expect(decideSelfJoin({ ...base, userEmail: 'me@gmail.com' })).toMatchObject({ ok: false, status: 403 })
    expect(decideSelfJoin(base)).toEqual({ ok: true, action: 'create' })
    expect(decideSelfJoin({ ...base, byRoll: { id: 's1', user_id: null, email: 'other@college.edu' } })).toMatchObject({ ok: false, status: 409 })
    expect(decideSelfJoin({ ...base, byRoll: { id: 's1', user_id: null, email: 'ME@college.edu' } })).toEqual({ ok: true, action: 'link', studentId: 's1' })
    expect(decideSelfJoin({ ...base, byEmail: { id: 's2', user_id: 'u2' } })).toMatchObject({ status: 409 })
  })
})

describe('readiness', () => {
  const students = [
    { id: 's1', name: 'Asha', department_id: 'd1', batch_id: 'b1', user_id: 'u1' },
    { id: 's2', name: 'Ravi', department_id: 'd1', batch_id: 'b1', user_id: 'u2' },
    { id: 's3', name: 'Mia', department_id: 'd2', batch_id: 'b2', user_id: null },
  ]
  const sections = (q: number, v: number) => [{ name: 'Quant', percent: q }, { name: 'Verbal', percent: v }]
  const signals = new Map([
    ['u1', { companyTests: [{ percent: 80, passed: true, sections: sections(40, 90) }, { percent: 60, passed: false, sections: sections(30, 80) }], adaptive: [90], contests: [1, null] }],
    ['u2', { companyTests: [{ percent: 50, passed: false, sections: sections(20, 70) }], adaptive: [], contests: [], passportLevel: 2 }],
  ])

  it('weights only the components a student has', () => {
    const a = studentReadiness(students[0], signals.get('u1'))
    // company 70 (0.45), adaptive 90 (0.3), contests 100 (0.15) → (31.5 + 27 + 15) / 0.9
    expect(a.readiness).toBeCloseTo(81.7, 1)
    expect(a.company_pass_rate).toBe(50)
    expect(a.contest_count).toBe(2)
    expect(studentReadiness(students[2], undefined).readiness).toBeNull()
  })

  it('aggregates groups, weak areas and top performers', () => {
    const r = computeReadiness(students, signals)
    expect(r.groups).toHaveLength(2)
    const g = r.groups[0]
    expect(g).toMatchObject({ department_id: 'd1', batch_id: 'b1', students: 2, active: 2, contest_entries: 2 })
    expect(g.weak_areas[0]).toEqual({ area: 'Quant', avg: 30, samples: 3 })
    expect(g.top.map((t) => t.name)).toEqual(['Asha', 'Ravi'])
    expect(r.groups[1]).toMatchObject({ students: 1, active: 0, readiness_avg: null })
    expect(r.overall.students).toBe(3)
    const csv = readinessCsv(r.students, r.groups, { departments, batches })
    expect(csv).toContain('Asha,Computer Science,2027 CSE,81.7')
    expect(csv).toContain('Quant (30%)')
  })

  it('maps ranks to percentiles', () => {
    expect(percentileFromRank(1, 10)).toBe(1)
    expect(percentileFromRank(10, 10)).toBe(0)
    expect(percentileFromRank(1, 1)).toBe(1)
    expect(percentileFromRank(null, 10)).toBeNull()
  })
})

describe('placement stats', () => {
  it('counts placed students once and uses their best live offer', () => {
    const students = [
      { id: 'a', department_id: 'd1', graduation_year: 2027 },
      { id: 'b', department_id: 'd1', graduation_year: 2027 },
      { id: 'c', department_id: 'd2', graduation_year: 2027 },
      { id: 'd', department_id: 'd2', graduation_year: 2027 },
      { id: 'e', department_id: 'd1', graduation_year: 2026 },
    ]
    const offers = [
      { student_id: 'a', ctc_minor: 600_000_00, status: 'accepted' as const, currency: 'INR' },
      { student_id: 'a', ctc_minor: 900_000_00, status: 'offered' as const, currency: 'INR' },
      { student_id: 'b', ctc_minor: 400_000_00, status: 'offered' as const, currency: 'INR' },
      { student_id: 'c', ctc_minor: 2_000_000_00, status: 'declined' as const, currency: 'INR' },
    ]
    const [y2027, y2026] = placementStats(students, offers)
    expect(y2027).toMatchObject({ year: 2027, students: 4, placed: 2, placed_pct: 50, offers: 4, median_ctc_minor: 650_000_00, max_ctc_minor: 900_000_00, currency: 'INR' })
    expect(y2027.by_department).toEqual([
      { department_id: 'd1', students: 2, placed: 2, placed_pct: 100 },
      { department_id: 'd2', students: 2, placed: 0, placed_pct: 0 },
    ])
    expect(y2026).toMatchObject({ year: 2026, placed: 0, median_ctc_minor: null, currency: null })
  })
  it('median of odd / even lists', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2])).toBe(2)
    expect(median([])).toBeNull()
  })
})

describe('drive input', () => {
  const base = {
    title: 'TCS Ninja drive', company: { name: 'TCS' }, role_title: 'Engineer',
    eligibility: { min_cgpa: 6, department_ids: [], graduation_years: [2027] },
    schedule: { apply_by: '2026-11-01T10:00:00Z' },
    process: { mode: 'company_test', pattern_id: 'tcs-nqt' },
  }
  it('accepts a valid drive and needs the process target', () => {
    expect(driveInputSchema.safeParse(base).success).toBe(true)
    expect(driveInputSchema.safeParse({ ...base, process: { mode: 'company_test' } }).success).toBe(false)
    expect(driveInputSchema.safeParse({ ...base, process: { mode: 'external', external_url: 'https://jobs.example.com/x' } }).success).toBe(true)
  })
  it('CTC is integer minor units with min ≤ max', () => {
    expect(driveInputSchema.safeParse({ ...base, ctc_minor_min: 10.5 }).success).toBe(false)
    expect(driveInputSchema.safeParse({ ...base, ctc_minor_min: 500, ctc_minor_max: 100 }).success).toBe(false)
  })
})
