/**
 * Raw platform records → passport Evidence (pure mappers; tests/skill-passport.test.ts).
 * Only server-recorded, server-graded rows are mapped; anything not released,
 * not completed, revoked or unscored returns null.
 */
import { clamp, placementScore, skillsFromText, type Evidence } from './core'

type Doc = Record<string, unknown>

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const iso = (v: unknown): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString()
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'string' && Number.isFinite(Date.parse(v))) return new Date(v).toISOString()
  return null
}

/** Trust / integrity score on a submission, when one was recorded (0–100). */
export function submissionTrust(sub: Doc): number | null {
  for (const k of ['trust_score', 'integrity_score']) {
    const v = num(sub[k])
    if (v !== null) return clamp(v <= 1 ? v * 100 : v, 0, 100)
  }
  return null
}

/** Proctored = identity check done without a manual-review flag, or strict (device audit) mode. */
export function submissionProctored(sub: Doc, exam: Doc): boolean {
  const idc = sub.identity_check as Doc | null | undefined
  const identityOk = !!idc && idc.needs_manual_review !== true && !idc.no_camera_reason
  return identityOk || (exam.proctoring_mode === 'strict' && sub.extension_detected === true)
}

/**
 * Released assessment score. Adaptive tests become `adaptive` evidence (their
 * difficulty-weighted percent); per-section scores add their own skills.
 */
export function examEvidence(sub: Doc, exam: Doc): Evidence | null {
  if (sub.score_released !== true) return null
  const at = iso(sub.submitted_at)
  if (!at) return null
  const adaptive = sub.adaptive as Doc | undefined
  let score: number | null = null
  if (adaptive && num(adaptive.percent) !== null) score = num(adaptive.percent)
  else {
    const s = num(sub.score)
    const max = num(sub.max_score)
    if (s !== null && max && max > 0) score = (s / max) * 100
    else if (s !== null && s <= 100) score = s
  }
  if (score === null) return null
  const title = str(exam.title) || 'Assessment'
  const sections = Array.isArray(sub.sections) ? (sub.sections as Doc[]).map((x) => str(x?.name ?? x?.title, 80)).join(' ') : ''
  const skills = skillsFromText(`${str(exam.subject)} ${str(exam.adaptive_domain)} ${title} ${sections}`, str(exam.subject).toLowerCase() || 'problem solving')
  return {
    id: `exam:${str(sub.id, 80) || `${str(exam.id, 60)}`}`,
    kind: adaptive ? 'adaptive' : 'assessment',
    title,
    skills,
    score: clamp(score, 0, 100),
    at,
    proctored: submissionProctored(sub, exam),
    trust: submissionTrust(sub),
    link: `/dashboard/assessments`,
    publicLink: null,
    // A company's hiring test: the learner decides whether others see it.
    privateByDefault: typeof exam.tenant_id === 'string' && !!exam.tenant_id,
  }
}

/** Completed company-test practice: one row per scored section (skills come from section names). */
export function companyTestEvidence(a: Doc): Evidence[] {
  if (a.status !== 'completed') return []
  const result = a.result as Doc | undefined
  const at = iso(a.completedAt) || iso(a.createdAt)
  if (!result || !at) return []
  const company = str(a.companyName, 80)
  const exam = str(a.examName, 120)
  const sections = Array.isArray(result.sections) ? (result.sections as Doc[]) : []
  const out: Evidence[] = []
  for (const s of sections) {
    const pct = num(s.percent)
    if (pct === null || !(num(s.max) ?? 0)) continue
    const name = str(s.name, 80)
    out.push({
      id: `company_test:${str(a.id, 80)}:${str(s.id, 40)}`,
      kind: 'company_test',
      title: `${company} ${exam} practice: ${name}`.trim(),
      skills: skillsFromText(name, 'aptitude'),
      score: clamp(pct, 0, 100),
      at,
      link: `/dashboard/company-tests/${encodeURIComponent(str(a.patternId, 80))}`,
      publicLink: null,
    })
  }
  return out
}

/**
 * certification_attempts row → evidence. Course completions, codeathon /
 * contest placements and admin-issued certificates count; XP level-ups and
 * exam certificates (the exam itself already counts) do not.
 */
export function certificateEvidence(c: Doc, site = ''): Evidence | null {
  if (c.passed !== true || c.revoked_at) return null
  const at = iso(c.submitted_at) || iso(c.started_at)
  if (!at) return null
  const certId = str(c.certification_id, 200)
  const issueKey = str(c.issue_key, 200)
  const snap = (c.cert_snapshot as Doc) || {}
  const title = str(snap.title) || 'Certificate'
  const token = str(c.verify_token, 128)
  const publicLink = token ? `${site}/cert/verify/${token}` : null
  if (certId.startsWith('level-') || issueKey.startsWith('exam:') || c.exam_submission_id) return null
  if (certId.startsWith('codeathon:')) {
    const source = str(snap.source, 80)
    const isContest = !!source && source !== 'CodeSpectra codeathon'
    const rank = num(c.rank)
    const m = /of\s+(\d{1,6})/i.exec(str(c.score_label, 120))
    const participants = m ? Number(m[1]) : null
    // Participation certificates are attendance, not skill.
    if (c.certificate_kind !== 'rank' || rank === null) return null
    return {
      id: `cert:${str(c.id, 80)}`,
      kind: isContest ? 'contest' : 'codeathon',
      title,
      skills: skillsFromText(`${title} ${source}`, 'problem solving'),
      score: placementScore(rank, participants),
      at,
      rank,
      participants,
      link: '/dashboard/certifications',
      publicLink,
    }
  }
  if (certId.startsWith('pcert:')) {
    // Proctored CodeSpectra certification (lib/pro-certs): proctored + trust-scored; an expired or renewed one no longer counts.
    const exp = iso(c.expires_at)
    if (exp && Date.parse(exp) <= Date.now()) return null
    if (c.superseded_by) return null
    const named = Array.isArray(snap.skills) ? (snap.skills as unknown[]).map((x) => str(x, 40)).filter(Boolean) : []
    const s = num(c.score)
    return {
      id: `cert:${str(c.id, 80)}`,
      kind: 'certificate',
      title,
      skills: skillsFromText(`${title} ${named.join(' ')}`),
      score: s !== null ? clamp(s, 0, 100) : 75,
      at,
      proctored: c.proctored === true,
      trust: num(c.trust_score),
      link: '/dashboard/certifications/proctored',
      publicLink: str(c.credential_id, 40) ? `${site}/verify/${str(c.credential_id, 40)}` : publicLink,
    }
  }
  const isCourse = issueKey.startsWith('course:')
  const s = num(c.score)
  return {
    id: `cert:${str(c.id, 80)}`,
    kind: isCourse ? 'course' : 'certificate',
    title,
    // No skill named in the title → no skill claimed from it.
    skills: skillsFromText(`${title} ${str(snap.level, 60)}`),
    score: s !== null && s > 0 ? clamp(s, 0, 100) : isCourse ? 70 : 75,
    at,
    link: '/dashboard/certifications',
    publicLink,
  }
}

/** Released hackathon placement for one team the learner was on. */
export function hackathonEvidence(team: Doc, hk: Doc, site = ''): Evidence | null {
  if (!hk.results_released) return null
  const rank = num(team.final_rank)
  if (rank === null) return null
  const at = iso(hk.released_at) || iso(hk.end_date) || iso(hk.updated_at)
  if (!at) return null
  const participants = num(hk.num_teams)
  const name = str(hk.name) || 'Hackathon'
  const token = str(team.verify_token, 128)
  return {
    id: `hackathon:${str(team.id, 80)}`,
    kind: 'hackathon',
    title: name,
    skills: skillsFromText(`${name} ${Array.isArray(hk.tracks) ? (hk.tracks as unknown[]).join(' ') : ''} ${Array.isArray(hk.tech_stack) ? (hk.tech_stack as unknown[]).join(' ') : ''}`, 'software development'),
    score: placementScore(rank, participants),
    at,
    rank,
    participants,
    link: hk.slug ? `/hackathons/${encodeURIComponent(str(hk.slug, 120))}` : null,
    publicLink: token ? `${site}/hackathons/verify/${token}` : hk.slug ? `${site}/hackathons/${encodeURIComponent(str(hk.slug, 120))}` : null,
  }
}

/** Completed interview simulation with a generated report (0–100 overall score). */
export function interviewEvidence(s: Doc): Evidence | null {
  if (s.status !== 'completed') return null
  const report = s.report as Doc | undefined
  const score = num(report?.overallScore)
  const at = iso(s.completedAt) || iso(s.startedAt)
  if (score === null || !at) return null
  const role = str(s.role, 80) || 'Interview'
  const skills = ['interview readiness', ...skillsFromText(role)]
  return {
    id: `interview:${str(s.id, 80)}`,
    kind: 'interview_sim',
    title: `${role} interview simulation`,
    skills,
    score: clamp(score, 0, 100),
    at,
    link: '/dashboard/interviews/ai-mock',
    publicLink: null,
  }
}
