/**
 * Write tool: start_mock_interview — start an AI mock interview for the
 * signed-in admin themself (user scope: the session is owned by the caller,
 * never by a tenant or another user; nothing here takes a user id). Same
 * service and caps as /dashboard/interview-sim (per-user daily sessions,
 * monthly AI cap). propose() only checks the caps; execute() plans the
 * questions (one AI call) and returns the link to open the session.
 */
import { ToolInputError } from '@/lib/agent/contract'
import { LANGUAGE_IDS, LEVEL_IDS, ROUND_IDS, levelLabel, roundLabel, type RoundType, type SimLanguage, type SimLevel } from '@/lib/interview-sim/types'
import { writeTool } from '../define'
import { argsObject, optEnum, optString, reqString } from '../args'
import { clip } from '../output'

export interface StartMockInterviewArgs {
  role: string
  round: RoundType
  level?: SimLevel
  company?: string
  language?: SimLanguage
}

async function resolveCompany(q: string | undefined): Promise<{ slug: string; name: string } | null> {
  if (!q) return null
  const needle = q.trim().toLowerCase()
  const { COMPANY_CATALOG } = await import('@/lib/companies/company-catalog')
  const { listPatterns } = await import('@/lib/company-tests/db')
  const rows = [
    ...COMPANY_CATALOG.map((c) => ({ slug: c.slug, name: c.name })),
    ...(await listPatterns({ activeOnly: true }).catch(() => [])).map((p) => ({ slug: p.companySlug, name: p.companyName })),
  ]
  const hit = rows.find((r) => r.slug === needle || r.name.toLowerCase() === needle) ?? rows.find((r) => r.name.toLowerCase().includes(needle))
  if (!hit) throw new ToolInputError(`No company matches “${clip(q, 60)}”. Leave \`company\` out for a general interview.`)
  return hit
}

export const startMockInterviewTool = writeTool<StartMockInterviewArgs>({
  name: 'start_mock_interview',
  risk: 'create',
  description:
    'Start an AI mock interview for YOU (the signed-in user) — practice only, private to you. Pick the round: hr (behavioural, STAR), technical (concepts), ' +
    'coding (live coding with the code editor and sandbox runs) or system_design; optional company (e.g. "google", "tcs") and level (intern, entry, mid, senior). ' +
    'Text mode; switch to voice on the page. Counts toward your daily mock-interview limit. Returns a link to the session.',
  parameters: {
    type: 'object',
    properties: {
      role: { type: 'string', maxLength: 80, description: 'Target role, e.g. "Backend developer".' },
      round: { type: 'string', enum: [...ROUND_IDS] },
      level: { type: 'string', enum: [...LEVEL_IDS] },
      company: { type: 'string', maxLength: 80, description: 'Company name or slug (optional).' },
      language: { type: 'string', enum: [...LANGUAGE_IDS], description: 'Interview language, default en-IN.' },
    },
    required: ['role', 'round'],
  },
  parse(raw) {
    const r = argsObject(raw, ['role', 'round', 'level', 'company', 'language'])
    const round = optEnum(r, 'round', ROUND_IDS)
    if (!round) throw new ToolInputError('`round` is required: hr, technical, coding or system_design.')
    const out: StartMockInterviewArgs = { role: reqString(r, 'role', { min: 2, max: 80 }), round }
    const level = optEnum(r, 'level', LEVEL_IDS)
    const company = optString(r, 'company', { max: 80 })
    const language = optEnum(r, 'language', LANGUAGE_IDS)
    if (level) out.level = level
    if (company) out.company = company
    if (language) out.language = language
    return out
  },
  async propose(a, ctx) {
    const { getSimSettings, monthSpend, sessionsStartedToday } = await import('@/lib/interview-sim/store')
    const { canStartSession } = await import('@/lib/interview-sim/scoring')
    const { planSessionsPerDay } = await import('@/lib/interview-sim/engine')
    const [rawSettings, today, spend, company, perDay] = await Promise.all([getSimSettings(), sessionsStartedToday(ctx.caller.userId), monthSpend(), resolveCompany(a.company), planSessionsPerDay({ id: ctx.caller.userId })])
    // Same per-plan limit the engine enforces (hasEntitlement).
    const settings = { ...rawSettings, daily_sessions_per_user: Math.min(rawSettings.daily_sessions_per_user, perDay) }
    const cap = canStartSession(settings, today, spend.cost_usd)
    if (!cap.ok) throw new ToolInputError(cap.reason)
    return {
      title: `Start a ${roundLabel(a.round).toLowerCase()} mock interview for ${clip(a.role, 60)}`,
      preview: {
        fields: {
          Role: a.role,
          Round: roundLabel(a.round),
          Level: levelLabel(a.level ?? 'entry'),
          Company: company?.name ?? 'General',
          Language: a.language ?? 'en-IN',
          Questions: String(settings.questions_per_session),
          'Left today': `${Math.max(0, settings.daily_sessions_per_user - today)} of ${settings.daily_sessions_per_user}`,
          Visibility: 'Private to you',
        },
      },
    }
  },
  async execute(a, ctx) {
    const company = await resolveCompany(a.company)
    const { startSession } = await import('@/lib/interview-sim/engine')
    const r = await startSession({ id: ctx.caller.userId }, {
      role: a.role, round: a.round, level: a.level ?? 'entry', language: a.language ?? 'en-IN', mode: 'text',
      company: company?.slug ?? null, pattern_id: null, record: false, consent: false,
    })
    if (!r.ok) return { ok: false, message: r.error }
    return {
      ok: true,
      message: `Your ${roundLabel(a.round).toLowerCase()} mock interview is ready (${r.session.plan.length} questions). Open it to begin.`,
      link: `/dashboard/interview-sim/${r.session.id}`,
      data: { session_id: r.session.id, questions: r.session.plan.length },
    }
  },
})
