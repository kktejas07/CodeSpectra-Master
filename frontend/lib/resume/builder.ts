/**
 * Résumé builder data (pure, client-safe; tests/resume-builder.test.ts):
 * the one shape the builder edits, its whitelist/clamp sanitiser, a plain-text
 * rendering (what ATS parsers read when you apply with a version) and the
 * prefill from the learner's profile + verified skill passport.
 */

export const BUILDER_TEMPLATES = ['ats', 'modern', 'minimal', 'elegant', 'professional', 'creative'] as const
export type BuilderTemplate = (typeof BUILDER_TEMPLATES)[number]

export interface ResumeProject { id: string; name: string; link: string; dates: string; description: string }
export interface ResumeCertificate { id: string; name: string; issuer: string; date: string; link: string }
export interface ResumeAchievement { id: string; title: string; detail: string; date: string }

export interface ResumeBuilderData {
  personal: { fullName: string; email: string; phone: string; location: string; linkedin: string; portfolio: string }
  /** Role this version targets (e.g. "Backend engineer"); several versions per role are fine. */
  targetRole: string
  summary: string
  experience: { id: string; company: string; role: string; dates: string; description: string }[]
  education: { id: string; institution: string; degree: string; dates: string }[]
  skills: string
  projects: ResumeProject[]
  certificates: ResumeCertificate[]
  achievements: ResumeAchievement[]
}

export const MAX_EXPERIENCE = 20
export const MAX_EDUCATION = 10
export const MAX_PROJECTS = 15
export const MAX_CERTIFICATES = 20
export const MAX_ACHIEVEMENTS = 20

export const EMPTY_RESUME: ResumeBuilderData = {
  personal: { fullName: '', email: '', phone: '', location: '', linkedin: '', portfolio: '' },
  targetRole: '', summary: '', experience: [], education: [], skills: '', projects: [], certificates: [], achievements: [],
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v).slice(0, max) : '')
const rid = (v: unknown, i: number) => {
  const s = typeof v === 'string' ? v.slice(0, 40) : ''
  return /^[A-Za-z0-9_-]+$/.test(s) ? s : `item-${i}`
}
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : [])

/** Whitelist + clamp. Returns null when the input isn't an object. */
export function sanitizeBuilderData(raw: unknown): ResumeBuilderData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const p = obj(r.personal)
  return {
    personal: {
      fullName: str(p.fullName, 120), email: str(p.email, 200), phone: str(p.phone, 40),
      location: str(p.location, 120), linkedin: str(p.linkedin, 300), portfolio: str(p.portfolio, 300),
    },
    targetRole: str(r.targetRole, 120),
    summary: str(r.summary, 3000),
    experience: list(r.experience, MAX_EXPERIENCE).map((e, i) => {
      const x = obj(e)
      return { id: rid(x.id, i), company: str(x.company, 160), role: str(x.role, 160), dates: str(x.dates, 80), description: str(x.description, 4000) }
    }),
    education: list(r.education, MAX_EDUCATION).map((e, i) => {
      const x = obj(e)
      return { id: rid(x.id, i), institution: str(x.institution, 160), degree: str(x.degree, 160), dates: str(x.dates, 80) }
    }),
    skills: str(r.skills, 2000),
    projects: list(r.projects, MAX_PROJECTS).map((e, i) => {
      const x = obj(e)
      return { id: rid(x.id, i), name: str(x.name, 160), link: str(x.link, 300), dates: str(x.dates, 80), description: str(x.description, 3000) }
    }),
    certificates: list(r.certificates, MAX_CERTIFICATES).map((e, i) => {
      const x = obj(e)
      return { id: rid(x.id, i), name: str(x.name, 160), issuer: str(x.issuer, 160), date: str(x.date, 40), link: str(x.link, 300) }
    }),
    achievements: list(r.achievements, MAX_ACHIEVEMENTS).map((e, i) => {
      const x = obj(e)
      return { id: rid(x.id, i), title: str(x.title, 200), detail: str(x.detail, 1000), date: str(x.date, 40) }
    }),
  }
}

export function sanitizeTemplate(v: unknown): BuilderTemplate {
  return (BUILDER_TEMPLATES as readonly string[]).includes(String(v)) ? (v as BuilderTemplate) : 'ats'
}

/** Section headings for the plain-text / PDF rendering (callers pass translated ones). */
export interface ResumeHeadings {
  summary: string; experience: string; projects: string; education: string; skills: string; certificates: string; achievements: string
}
export const EN_HEADINGS: ResumeHeadings = {
  summary: 'Summary', experience: 'Experience', projects: 'Projects', education: 'Education',
  skills: 'Skills', certificates: 'Certificates', achievements: 'Achievements',
}

/** Single-column plain text in ATS reading order: contact, summary, experience, projects, education, skills, certificates, achievements. */
export function resumeToText(d: ResumeBuilderData, h: ResumeHeadings = EN_HEADINGS): string {
  const out: string[] = []
  const line = (...parts: string[]) => parts.map((p) => p.trim()).filter(Boolean).join(' | ')
  if (d.personal.fullName.trim()) out.push(d.personal.fullName.trim())
  if (d.targetRole.trim()) out.push(d.targetRole.trim())
  const contact = line(d.personal.email, d.personal.phone, d.personal.location)
  if (contact) out.push(contact)
  const links = line(d.personal.linkedin, d.personal.portfolio)
  if (links) out.push(links)
  const section = (title: string, body: string[]) => {
    const b = body.filter((x) => x.trim())
    if (b.length) out.push('', title.toUpperCase(), ...b)
  }
  section(h.summary, [d.summary.trim()])
  section(h.experience, d.experience.flatMap((e) => [line(e.role, e.company, e.dates), e.description.trim()]))
  section(h.projects, d.projects.flatMap((p) => [line(p.name, p.dates, p.link), p.description.trim()]))
  section(h.education, d.education.map((e) => line(e.degree, e.institution, e.dates)))
  section(h.skills, [d.skills.trim()])
  section(h.certificates, d.certificates.map((c) => line(c.name, c.issuer, c.date, c.link)))
  section(h.achievements, d.achievements.map((a) => line(a.title, a.date) + (a.detail.trim() ? ` — ${a.detail.trim()}` : '')))
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ─── Prefill from profile + passport ────────────────────────────────────────

export interface ProfileSource {
  name: string
  email: string
  basic?: Record<string, unknown> | null
  about?: unknown
  skills?: unknown
  links?: Record<string, unknown> | null
  experience?: unknown
  education?: unknown
  projects?: unknown
  achievements?: unknown
  certificates?: unknown
}

export interface PassportSource {
  /** Verified skills, strongest first. */
  skills: Array<{ skill: string; level: string }>
  selfReported: string[]
  /** Platform-recorded results (certificates, contest placements). */
  evidence: Array<{ kind: string; title: string; at: string; rank?: number | null; participants?: number | null; publicLink?: string | null }>
}

const dates = (a: unknown, b: unknown) => [str(a, 40), str(b, 40)].filter(Boolean).join(' – ')
const titleCase = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase())

/**
 * Build a starting résumé from the profile and the passport. Verified skills
 * come first with their level; self-reported skills follow unlabelled. Only
 * facts already recorded — nothing is invented.
 */
export function resumeFromProfile(p: ProfileSource, pass: PassportSource, levelLabel: (level: string) => string = (l) => titleCase(l)): ResumeBuilderData {
  const b = obj(p.basic)
  const links = obj(p.links)
  const verified = pass.skills.slice(0, 20).map((s) => `${s.skill} (${levelLabel(s.level)})`)
  const verifiedSet = new Set(pass.skills.map((s) => s.skill.toLowerCase()))
  const selfList = (typeof p.skills === 'string' ? p.skills.split(/[,\n]/) : Array.isArray(p.skills) ? p.skills.map(String) : [])
    .concat(pass.selfReported)
    .map((s) => s.trim()).filter(Boolean)
  const self = [...new Set(selfList.map((s) => s.toLowerCase()))].filter((s) => !verifiedSet.has(s)).slice(0, 25)
  const name = [str(b.firstName, 60), str(b.lastName, 60)].filter(Boolean).join(' ') || p.name
  const certsFromProfile = list(p.certificates, MAX_CERTIFICATES).map((c, i) => {
    const x = obj(c)
    return { id: `cert-p${i}`, name: str(x.name ?? x.title, 160), issuer: str(x.issuer ?? x.organisation, 160), date: str(x.date ?? x.issued, 40), link: str(x.link ?? x.url, 300) }
  }).filter((c) => c.name)
  const certsFromPassport = pass.evidence.filter((e) => e.kind === 'certificate').slice(0, 10).map((e, i) => ({
    id: `cert-v${i}`, name: str(e.title, 160), issuer: 'CodeSpectra', date: e.at.slice(0, 10), link: str(e.publicLink ?? '', 300),
  }))
  const contests = pass.evidence.filter((e) => ['contest', 'codeathon', 'hackathon'].includes(e.kind) && e.rank).slice(0, 10).map((e, i) => ({
    id: `ach-v${i}`, title: str(e.title, 200), detail: e.participants ? `Rank ${e.rank} of ${e.participants}` : `Rank ${e.rank}`, date: e.at.slice(0, 10),
  }))
  const achievementsFromProfile = list(p.achievements, MAX_ACHIEVEMENTS).map((a, i) => {
    const x = obj(a)
    return { id: `ach-p${i}`, title: str(x.title, 200), detail: str(x.description, 1000), date: '' }
  }).filter((a) => a.title)
  return sanitizeBuilderData({
    personal: {
      fullName: name, email: p.email, phone: str(b.phone, 40), location: str(b.location, 120),
      linkedin: str(links.linkedin, 300), portfolio: str(links.portfolio || links.github, 300),
    },
    targetRole: str(b.designation ?? b.careerGoal, 120),
    summary: str(p.about, 3000),
    experience: list(p.experience, MAX_EXPERIENCE).map((e, i) => {
      const x = obj(e)
      return { id: `exp-${i}`, company: x.organisation ?? x.company, role: x.designation ?? x.role, dates: dates(x.start, x.end) || x.dates, description: x.description }
    }).filter((e) => e.company || e.role),
    education: list(p.education, MAX_EDUCATION).map((e, i) => {
      const x = obj(e)
      const degree = [str(x.qualification, 80), str(x.course, 80), str(x.specialization, 80)].filter(Boolean).join(', ') || x.degree
      return { id: `edu-${i}`, institution: x.college ?? x.institution, degree, dates: dates(x.start, x.end) || x.dates }
    }).filter((e) => e.institution || e.degree),
    skills: [...verified, ...self].join(', '),
    projects: list(p.projects, MAX_PROJECTS).map((e, i) => {
      const x = obj(e)
      return { id: `proj-${i}`, name: x.name, link: x.link, dates: dates(x.start, x.end), description: x.description }
    }).filter((x) => x.name),
    certificates: [...certsFromPassport, ...certsFromProfile].slice(0, MAX_CERTIFICATES),
    achievements: [...contests, ...achievementsFromProfile].slice(0, MAX_ACHIEVEMENTS),
  })!
}
