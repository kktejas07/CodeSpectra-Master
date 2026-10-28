import { describe, expect, it } from 'vitest'
import {
  computePassport, evidenceWeight, handleBase, isEvidenceVisible, levelFor, linkedInCertUrl, parseSelfReported, placementScore,
  publicSkills, recencyFactor, skillIndex, skillsFromText, trustFactor, validHandle, HALF_LIFE_DAYS, type Evidence,
} from '@/lib/passport/core'
import { certificateEvidence, companyTestEvidence, examEvidence, hackathonEvidence, interviewEvidence, submissionTrust } from '@/lib/passport/evidence-map'
import { linkKeyMatches, newLinkKey, signCredential, verifyCredential } from '@/lib/passport/credential'
import { passportJsonLd } from '@/lib/passport/jsonld'

const NOW = new Date('2026-10-21T00:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()
const ev = (o: Partial<Evidence> & Pick<Evidence, 'id'>): Evidence => ({ kind: 'assessment', title: 'Test', skills: ['python'], score: 80, at: daysAgo(10), ...o })

describe('passport scoring', () => {
  it('halves weight every half-life and ignores bad dates', () => {
    expect(recencyFactor(daysAgo(0), NOW)).toBeCloseTo(1)
    expect(recencyFactor(daysAgo(HALF_LIFE_DAYS), NOW)).toBeCloseTo(0.5)
    expect(recencyFactor('nope', NOW)).toBe(0)
    expect(recencyFactor(new Date(NOW.getTime() + 86_400_000).toISOString(), NOW)).toBe(1)
  })

  it('drops low-trust results and scales the rest', () => {
    expect(trustFactor(null)).toBe(1)
    expect(trustFactor(30)).toBeNull()
    expect(trustFactor(80)).toBeCloseTo(0.8)
    expect(evidenceWeight(ev({ id: 'a', trust: 20 }), NOW)).toBe(0)
    expect(evidenceWeight(ev({ id: 'a', proctored: true }), NOW)).toBeGreaterThan(evidenceWeight(ev({ id: 'b' }), NOW))
  })

  it('placement → share of the field beaten, podium fallback', () => {
    expect(placementScore(1, 40)).toBe(100)
    expect(placementScore(20, 40)).toBe(53)
    expect(placementScore(1, null)).toBe(95)
    expect(placementScore(0, 10)).toBe(0)
  })

  it('needs evidence weight, not just a high score, and a proctored result for expert', () => {
    expect(levelFor(95, 0.4, 0)).toBe('beginner')
    expect(levelFor(95, 3, 0)).toBe('advanced')
    expect(levelFor(95, 3, 1)).toBe('expert')
    expect(levelFor(55, 0.7, 0)).toBe('intermediate')
  })

  it('one practice test cannot make an expert; repeated proctored results can', () => {
    const one = computePassport([ev({ id: 'p1', kind: 'company_test', score: 100 })], [], NOW)
    expect(one.skills[0].level).not.toBe('expert')
    const many = computePassport([1, 2, 3].map((i) => ev({ id: `x${i}`, score: 92, proctored: true, at: daysAgo(i * 5) })), [], NOW)
    expect(many.skills[0]).toMatchObject({ skill: 'python', level: 'expert', proctoredCount: 3 })
  })

  it('self-reported skills never become verified and are de-duplicated against verified ones', () => {
    const p = computePassport([ev({ id: 'a' })], ['Python', 'Rust', 'rust'], NOW)
    expect(p.skills.map((s) => s.skill)).toEqual(['python'])
    expect(p.selfReported).toEqual(['rust'])
  })

  it('reports excluded rows and flags stale skills', () => {
    const p = computePassport([ev({ id: 'low', trust: 10 }), ev({ id: 'old', skills: ['sql'], at: daysAgo(800) })], [], NOW)
    expect(p.excluded.map((x) => x.id)).toEqual(['low'])
    expect(p.skills.find((s) => s.skill === 'sql')?.stale).toBe(true)
  })

  it('canonicalises skill names', () => {
    const p = computePassport([ev({ id: 'a', skills: ['JS'] }), ev({ id: 'b', skills: ['javascript'] })], [], NOW)
    expect(p.skills).toHaveLength(1)
    expect(p.skills[0].evidenceCount).toBe(2)
  })
})

describe('skill names', () => {
  it('finds dictionary skills and broad buckets', () => {
    expect(skillsFromText('Python and SQL backend test')).toEqual(expect.arrayContaining(['python', 'sql']))
    expect(skillsFromText('Quantitative aptitude')).toContain('aptitude')
    expect(skillsFromText('Mystery round', 'problem solving')).toEqual(['problem solving'])
    expect(skillsFromText('Mystery round')).toEqual([])
  })
  it('parses free-text profile skills', () => {
    expect(parseSelfReported('React, node js; SQL\nreact')).toEqual(['react', 'node.js', 'sql'])
    expect(parseSelfReported([{ name: 'Go' }, 'golang'])).toEqual(['go'])
  })
})

describe('sharing', () => {
  const evidence = [ev({ id: 'pub', score: 90 }), ev({ id: 'co', skills: ['sql'], privateByDefault: true })]
  it('company tests are hidden unless shown; hidden results stop counting', () => {
    const base = { visibility: 'public' as const, hidden: [], shown: [], showSelfReported: false }
    expect(publicSkills(evidence, base, NOW).map((s) => s.skill)).toEqual(['python'])
    expect(publicSkills(evidence, { ...base, shown: ['co'] }, NOW).map((s) => s.skill).sort()).toEqual(['python', 'sql'])
    expect(publicSkills(evidence, { ...base, hidden: ['pub'] }, NOW)).toEqual([])
    expect(isEvidenceVisible({ id: 'co', privateByDefault: true }, { hidden: ['co'], shown: ['co'] })).toBe(false)
  })
  it('public view only carries public links', () => {
    const s = publicSkills([ev({ id: 'a', link: '/dashboard/x', publicLink: 'https://x/cert/verify/t' })], { visibility: 'link', hidden: [], shown: [], showSelfReported: false }, NOW)
    expect(s[0].evidence[0].link).toBe('https://x/cert/verify/t')
  })
  it('skill index carries level rank for search', () => {
    expect(skillIndex([{ skill: 'sql', level: 'advanced', score: 77 }])).toEqual([{ skill: 'sql', level: 'advanced', rank: 2, score: 77 }])
  })
  it('handles', () => {
    expect(validHandle('priya-raman')).toBe(true)
    expect(validHandle('ab')).toBe(false)
    expect(validHandle('admin')).toBe(false)
    expect(validHandle('a--b')).toBe(false)
    expect(validHandle('Priya')).toBe(false)
    expect(handleBase('Priya Raman')).toBe('priyaraman')
    expect(handleBase('x')).toBe('learnerx')
  })
  it('LinkedIn link', () => {
    const u = new URL(linkedInCertUrl({ name: 'Passport', verifyUrl: 'https://cs.ai/verify/1', issuedAt: '2026-03-02T00:00:00Z', credentialId: 'csp1.x.y' }))
    expect(u.searchParams.get('startTask')).toBe('CERTIFICATION_NAME')
    expect(u.searchParams.get('issueMonth')).toBe('3')
    expect(u.searchParams.get('certId')).toBe('csp1.x.y')
  })
})

describe('evidence mappers', () => {
  it('counts only released exam scores; tenant exams are private by default', () => {
    expect(examEvidence({ id: 's', score: 8, max_score: 10, submitted_at: daysAgo(1) }, { id: 'e', title: 'Python basics' })).toBeNull()
    const e = examEvidence(
      { id: 's', score: 8, max_score: 10, submitted_at: daysAgo(1), score_released: true, identity_check: { needs_manual_review: false }, trust_score: 0.9 },
      { id: 'e', title: 'Python basics', subject: 'Python', tenant_id: 't1' },
    )!
    expect(e).toMatchObject({ kind: 'assessment', score: 80, proctored: true, trust: 90, privateByDefault: true })
    expect(e.skills).toContain('python')
  })
  it('adaptive results use the weighted percent', () => {
    const e = examEvidence({ id: 's', score: 3, max_score: 45, submitted_at: daysAgo(1), score_released: true, adaptive: { percent: 64 } }, { id: 'e', title: 'Adaptive SQL', adaptive_domain: 'sql' })!
    expect(e).toMatchObject({ kind: 'adaptive', score: 64, proctored: false })
  })
  it('trust score accepts 0–1 and 0–100', () => {
    expect(submissionTrust({ trust_score: 0.5 })).toBe(50)
    expect(submissionTrust({ integrity_score: 72 })).toBe(72)
    expect(submissionTrust({})).toBeNull()
  })
  it('company practice → one row per section', () => {
    const rows = companyTestEvidence({ id: 'a', status: 'completed', completedAt: daysAgo(2), companyName: 'Acme', examName: 'Online test', patternId: 'p', result: { sections: [{ id: 'q', name: 'Quantitative aptitude', percent: 70, max: 20 }, { id: 'c', name: 'Coding', percent: 50, max: 0 }] } })
    expect(rows).toHaveLength(1)
    expect(rows[0].skills).toContain('aptitude')
    expect(companyTestEvidence({ status: 'in_progress' })).toEqual([])
  })
  it('certificates: courses and placements count; XP, exam, revoked and participation do not', () => {
    expect(certificateEvidence({ id: 'c', passed: true, issue_key: 'course:1:u', submitted_at: daysAgo(3), cert_snapshot: { title: 'Python for beginners' }, score: 88, verify_token: 'tok' }, 'https://cs.ai')).toMatchObject({ kind: 'course', score: 88, publicLink: 'https://cs.ai/cert/verify/tok' })
    expect(certificateEvidence({ passed: true, certification_id: 'level-3', submitted_at: daysAgo(1) })).toBeNull()
    expect(certificateEvidence({ passed: true, issue_key: 'exam:e:u', submitted_at: daysAgo(1) })).toBeNull()
    expect(certificateEvidence({ passed: true, revoked_at: daysAgo(1), submitted_at: daysAgo(2) })).toBeNull()
    expect(certificateEvidence({ passed: true, certification_id: 'codeathon:x', certificate_kind: 'participation', submitted_at: daysAgo(1) })).toBeNull()
    expect(certificateEvidence({ id: 'r', passed: true, certification_id: 'codeathon:x', certificate_kind: 'rank', rank: 2, score_label: 'Ranked #2 of 40', submitted_at: daysAgo(1), cert_snapshot: { title: 'Sprint', source: 'CTF' } })).toMatchObject({ kind: 'contest', score: 98, participants: 40 })
  })
  it('hackathon placement needs released results', () => {
    expect(hackathonEvidence({ id: 't', final_rank: 1 }, { name: 'H', results_released: false })).toBeNull()
    expect(hackathonEvidence({ id: 't', final_rank: 1, verify_token: 'v' }, { name: 'H', results_released: true, released_at: daysAgo(5), num_teams: 10 }, 'https://cs.ai')).toMatchObject({ kind: 'hackathon', score: 100, publicLink: 'https://cs.ai/hackathons/verify/v' })
  })
  it('interview sim needs a completed report', () => {
    expect(interviewEvidence({ id: 'i', status: 'active' })).toBeNull()
    expect(interviewEvidence({ id: 'i', status: 'completed', completedAt: Date.parse(daysAgo(1)), role: 'Frontend Developer', report: { overallScore: 72 } })!.skills).toContain('interview readiness')
  })
})

describe('credential ids', () => {
  const key = new Uint8Array(32).fill(7)
  it('round-trips and rejects tampering or a different key', () => {
    const id = signCredential(key, { h: 'priya', n: 'nonce1', t: 1_700_000_000_000 })
    expect(verifyCredential(key, id)).toEqual({ h: 'priya', n: 'nonce1', t: 1_700_000_000_000 })
    const [p, body, sig] = id.split('.')
    const forged = Buffer.from(JSON.stringify({ h: 'mallory', n: 'nonce1', t: 1 })).toString('base64url')
    expect(verifyCredential(key, `${p}.${forged}.${sig}`)).toBeNull()
    expect(verifyCredential(new Uint8Array(32).fill(8), id)).toBeNull()
    expect(verifyCredential(key, `${p}.${body}.${'A'.repeat(22)}`)).toBeNull()
    expect(verifyCredential(key, 'garbage')).toBeNull()
  })
  it('link keys compare safely', () => {
    const k = newLinkKey()
    expect(linkKeyMatches(k, k)).toBe(true)
    expect(linkKeyMatches(k.slice(1), k)).toBe(false)
    expect(linkKeyMatches(undefined, k)).toBe(false)
  })
})

describe('json-ld', () => {
  it('Person with one credential per skill', () => {
    const j = passportJsonLd({ site: 'https://cs.ai', handle: 'priya', name: 'Priya', verifyUrl: 'https://cs.ai/verify/x', issuedAt: NOW.toISOString(), skills: [{ skill: 'sql', level: 'advanced', score: 80, evidenceCount: 2, proctoredCount: 1, lastEvidenceAt: NOW.toISOString(), evidence: [] }] })
    expect(j['@type']).toBe('Person')
    const cred = (j.hasCredential as Array<Record<string, unknown>>)[0]
    expect(cred).toMatchObject({ '@type': 'EducationalOccupationalCredential', competencyRequired: 'sql', educationalLevel: 'Advanced' })
  })
})
