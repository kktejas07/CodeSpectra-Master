/**
 * Mock-interview engine (server only): start, answer, finish.
 *
 *  start   caps (per-user daily sessions, monthly AI spend) → company context
 *          (catalog + exam pattern) + question-bank seeds → one AI call plans
 *          the talk questions; coding rounds add problems with sample cases
 *          from the bank (approved, with test cases) or the built-in set.
 *  answer  prompt-guard the answer (scanUntrusted → neutralise + cap) → code
 *          answers run in the sandbox (Piston) → one AI call scores the
 *          question against the round rubric and replies briefly →
 *          follow-up / next question / end (scoring.ts nextStep).
 *  finish  per-question results → overall + readiness (pure) → one AI call
 *          for the summary (falls back to a scored-only report) → gap links
 *          to Learn posts and practice pages.
 *
 * Every AI call checks the per-session and monthly caps first and records its
 * estimated cost. Learner text is never logged.
 */
import 'server-only'
import { newId } from '@/lib/db/ids'
import { logger } from '@/lib/logger'
import { neutraliseUntrusted, scanUntrusted } from '@/lib/ai/untrusted-input'
import { buildPlanPrompt, buildReportPrompt, buildTurnPrompt, cleanTestCases, interviewerPersona, parsePlan, parseReport, parseTurn } from './prompt'
import {
  aggregateResults, aggregateVoice, canSpend, canStartSession, capCorrectness, capFlagged, codeProblemCount, gapLinks, nextStep,
  questionScore, rankDimensions, topGapTopics, voiceStatsFor,
} from './scoring'
import { pickBuiltinProblems } from './problems'
import {
  dayKey, getOwnSession, getRecordingMeta, getSimSettings, monthKey, monthSpend, recordSpend, sessions, sessionsStartedToday,
} from './store'
import {
  DIMENSION_LABEL, roundLabel, type AnswerInput, type CodeRun, type InterviewSimSettings, type PlannedQuestion, type QuestionResult,
  type ReportGap, type SimHistoryItem, type SimReport, type SimSessionDoc, type SimSessionView, type SimTurn, type StartInput, type TestCase,
} from './types'

type Fail = { ok: false; status: number; error: string }
const fail = (status: number, error: string): Fail => ({ ok: false, status, error })

export interface SimUser { id: string; role?: string }

// ─── AI ─────────────────────────────────────────────────────────────────────

async function callJson(system: string, user: string, feature: string, userId: string): Promise<{ json: unknown | null; cost: number }> {
  const { backendComplete } = await import('@/lib/ai/backend')
  const { platformModelOverrides, extractJson } = await import('@/lib/interviews/ai-mock-engine')
  const { costUsd } = await import('@/lib/agent/metering')
  const { estimateTokens, withUsageMeter } = await import('@/lib/ai/usage-meter')
  const overrides = await platformModelOverrides()
  try {
    // The recorder prices the call (lib/ai/usage-record); the token estimate is the fallback.
    let recorded: number | undefined
    const res = await withUsageMeter((u) => { if (typeof u.costMicros === 'number') recorded = (recorded ?? 0) + u.costMicros }, () => backendComplete({ systemMessage: system, userMessage: user, responseFormat: 'json', modelRole: 'fast', feature, userId, cache: false, ...overrides }))
    const out = res.raw || res.text || (res.json !== undefined ? JSON.stringify(res.json) : '')
    const cost = recorded !== undefined ? recorded / 1_000_000 : costUsd([{ provider: res.provider || '', model: res.model || overrides.modelOverride || '', inputTokens: res.usage?.input_tokens ?? estimateTokens(`${system}\n${user}`), outputTokens: res.usage?.output_tokens ?? estimateTokens(out) }])
    if (!res.ok) return { json: null, cost }
    return { json: res.json !== undefined && res.json !== null ? res.json : extractJson(out), cost }
  } catch (e) {
    logger.warn(`[interview-sim] ${feature} AI call failed: ${(e as Error)?.message?.slice(0, 160)}`)
    return { json: null, cost: 0 }
  }
}

// ─── Options ────────────────────────────────────────────────────────────────

export interface SimCompanyOption { slug: string; name: string; patterns: Array<{ id: string; name: string }> }

export async function simOptions(userId: string): Promise<{
  companies: SimCompanyOption[]
  settings: Pick<InterviewSimSettings, 'enabled' | 'allow_voice' | 'allow_recordings' | 'recording_retention_days' | 'questions_per_session' | 'daily_sessions_per_user'>
  started_today: number
  server_transcription: boolean
}> {
  const { COMPANY_CATALOG } = await import('@/lib/companies/company-catalog')
  const { listPatterns } = await import('@/lib/company-tests/db')
  const [settings, startedToday, patterns, deepgram] = await Promise.all([
    getSimSettings(),
    sessionsStartedToday(userId),
    listPatterns({ activeOnly: true }).catch(() => []),
    import('@/lib/ai/get-api-key').then((m) => m.getApiKey('deepgram')).catch(() => null),
  ])
  const bySlug = new Map<string, SimCompanyOption>()
  for (const c of COMPANY_CATALOG) bySlug.set(c.slug, { slug: c.slug, name: c.name, patterns: [] })
  for (const p of patterns) {
    const row = bySlug.get(p.companySlug) ?? { slug: p.companySlug, name: p.companyName, patterns: [] }
    row.patterns.push({ id: p.id, name: p.examName })
    bySlug.set(p.companySlug, row)
  }
  return {
    companies: [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name)),
    settings: {
      enabled: settings.enabled, allow_voice: settings.allow_voice, allow_recordings: settings.allow_recordings,
      recording_retention_days: settings.recording_retention_days, questions_per_session: settings.questions_per_session,
      daily_sessions_per_user: settings.daily_sessions_per_user,
    },
    started_today: startedToday,
    server_transcription: settings.allow_voice && !!deepgram?.key,
  }
}

// ─── Start ──────────────────────────────────────────────────────────────────

const BANK_DIFFICULTY = { intern: 'Easy', entry: 'Easy', mid: 'Medium', senior: 'Hard' } as const

async function companyContext(slug: string | null, patternId: string | null): Promise<{ name: string | null; notes: string[]; topics: string[]; patternId: string | null }> {
  if (!slug) return { name: null, notes: [], topics: [], patternId: null }
  const { getCompanyBySlug } = await import('@/lib/companies/company-catalog')
  const { listPatterns } = await import('@/lib/company-tests/db')
  const c = getCompanyBySlug(slug)
  const patterns = await listPatterns({ companySlug: slug, activeOnly: true }).catch(() => [])
  const pattern = patterns.find((p) => p.id === patternId) ?? patterns[0] ?? null
  const notes = c
    ? [
        ...c.interviewProcess.slice(0, 5).map((s) => `${s.step}: ${s.description}`.slice(0, 220)),
        ...c.tips.slice(0, 3).map((t) => `Tip: ${t}`.slice(0, 200)),
        ...c.sampleQuestions.slice(0, 6).map((q) => `Reported question (${q.category}, ${q.difficulty}): ${q.question}`.slice(0, 220)),
      ]
    : []
  const topics = pattern ? [...new Set(pattern.sections.flatMap((s) => [s.name, ...s.categories]))].slice(0, 12) : []
  return { name: c?.name ?? pattern?.companyName ?? null, notes, topics, patternId: pattern?.id ?? null }
}

/** Approved bank prompts for the role (technical / system design seeds). */
async function bankSeeds(role: string, round: StartInput['round'], difficulty: 'Easy' | 'Medium' | 'Hard'): Promise<string[]> {
  if (round === 'hr') return []
  const { questionBank } = await import('@/lib/question-bank')
  const { sanitizeRegex } = await import('@/lib/sanitize')
  const words = role.toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length > 2 && !['engineer', 'developer', 'senior', 'junior', 'software'].includes(w)).slice(0, 3)
  const match: Record<string, unknown> = { is_active: { $ne: false }, review_status: { $ne: 'draft' }, difficulty, type: { $in: ['short_answer', 'long_answer', 'essay', 'descriptive', 'subjective', 'mcq'] } }
  if (round === 'system_design') match.$or = [{ subject: /system design/i }, { tags: /system.?design/i }]
  else if (words.length) match.$or = words.flatMap((w) => { const re = new RegExp(sanitizeRegex(w), 'i'); return [{ subject: re }, { tags: re }, { tech_stack: re }] })
  try {
    const rows = await (await questionBank()).aggregate<{ question: string }>([{ $match: match }, { $sample: { size: 6 } }, { $project: { _id: 0, question: 1 } }]).toArray()
    return rows.map((r) => String(r.question || '').replace(/\s+/g, ' ').slice(0, 240)).filter((q) => q.length > 10)
  } catch {
    return []
  }
}

/** Coding problems: approved bank coding items with sample cases, topped up from the built-in set. */
async function codingProblems(difficulty: 'Easy' | 'Medium' | 'Hard', count: number): Promise<Array<Omit<PlannedQuestion, 'id'>>> {
  if (count <= 0) return []
  const out: Array<Omit<PlannedQuestion, 'id'>> = []
  try {
    const { questionBank } = await import('@/lib/question-bank')
    const rows = await (await questionBank()).aggregate<{ id: string; question: string; title?: string; subject?: string; test_cases?: unknown; starter_code?: string; tags?: string[] }>([
      { $match: { type: 'coding', difficulty, is_active: { $ne: false }, review_status: { $ne: 'draft' }, 'test_cases.0': { $exists: true } } },
      { $sample: { size: count * 2 } },
      { $project: { _id: 0, id: 1, question: 1, title: 1, subject: 1, test_cases: 1, starter_code: 1, tags: 1 } },
    ]).toArray()
    for (const r of rows) {
      const cases = cleanTestCases(Array.isArray(r.test_cases) ? (r.test_cases as Array<Record<string, unknown>>).filter((t) => t?.isSample !== false && t?.is_hidden !== true) : [])
      if (!cases.length || !r.question) continue
      out.push({ kind: 'code', text: String(r.question).slice(0, 2000), topic: String(r.subject || r.tags?.[0] || r.title || 'Coding').slice(0, 60), expected_points: [], test_cases: cases, starter_code: typeof r.starter_code === 'string' ? r.starter_code.slice(0, 4000) : undefined, bank_id: r.id })
      if (out.length >= count) break
    }
  } catch {
    // Bank unavailable: the built-in problems below still make a session.
  }
  if (out.length < count) out.push(...pickBuiltinProblems(difficulty, count - out.length, Date.now()).map(({ difficulty: _d, ...p }) => p))
  return out
}

function interleave(talk: Array<Omit<PlannedQuestion, 'id'>>, code: Array<Omit<PlannedQuestion, 'id'>>): PlannedQuestion[] {
  const out: Array<Omit<PlannedQuestion, 'id'>> = []
  let t = 0
  for (const c of code) {
    if (t < talk.length) out.push(talk[t++])
    out.push(c)
  }
  while (t < talk.length) out.push(talk[t++])
  return out.map((q, i) => ({ ...q, id: `q${i + 1}` }))
}

function promptFor(q: PlannedQuestion, lead = ''): string {
  const body = q.kind === 'code' ? `Coding problem: ${q.text} Explain your approach, then write and run your code in the editor.` : q.text
  return lead ? `${lead} ${body}` : body
}

/** Sessions per day the user's plan allows (Infinity = no plan limit). */
export async function planSessionsPerDay(user: SimUser & { role?: string }): Promise<number> {
  const { hasEntitlement } = await import('@/lib/entitlements')
  const d = await hasEntitlement({ id: user.id, role: (user.role ?? 'user') as never }, 'interview_sim_sessions_per_day')
  return d.limit
}

export async function startSession(user: SimUser, input: StartInput, now = new Date()): Promise<{ ok: true; session: SimSessionDoc } | Fail> {
  const settings = await getSimSettings()
  const [today, spend, perDay] = await Promise.all([sessionsStartedToday(user.id, now), monthSpend(now), planSessionsPerDay(user)])
  // Plan limit (lib/billing/entitlement-features) under the admin's platform-wide daily cap.
  const cap = canStartSession({ ...settings, daily_sessions_per_user: Math.min(settings.daily_sessions_per_user, perDay) }, today, spend.cost_usd)
  if (!cap.ok) return fail(429, cap.reason)
  if (input.mode === 'voice' && !settings.allow_voice) return fail(400, 'Voice interviews are switched off. Choose text mode.')
  if (input.record && !settings.allow_recordings) return fail(400, 'Recordings are switched off.')
  if ((input.mode === 'voice' || input.record) && !input.consent) return fail(400, 'Please accept the microphone / camera notice first.')

  let config = input
  if (input.retake_of) {
    const prev = await getOwnSession(input.retake_of, user.id)
    if (!prev) return fail(404, 'That interview was not found.')
    config = { ...input, company: prev.config.company, pattern_id: prev.config.pattern_id, role: prev.config.role, level: prev.config.level, round: prev.config.round, code_language: prev.config.code_language }
  }

  const company = await companyContext(config.company ?? null, config.pattern_id ?? null)
  const difficulty = BANK_DIFFICULTY[config.level]
  const planned = settings.questions_per_session
  const codeCount = codeProblemCount(config.round, planned)
  const talkCount = planned - codeCount
  const [seeds, code] = await Promise.all([bankSeeds(config.role, config.round, difficulty), codingProblems(difficulty, codeCount)])

  const { system, user: prompt } = buildPlanPrompt({
    role: config.role, level: config.level, round: config.round, language: config.language, companyName: company.name,
    companyNotes: company.notes, patternTopics: company.topics, seedQuestions: seeds, talkCount,
  })
  const ai = await callJson(system, prompt, 'interview-sim-plan', user.id)
  await recordSpend(ai.cost, {}, now).catch(() => undefined)
  const plan = parsePlan(ai.json, talkCount)
  if (plan.questions.length < Math.min(3, talkCount)) return fail(503, 'The interviewer is not available right now. Try again in a few minutes.')

  const questions = interleave(plan.questions.map((q) => ({ ...q, kind: 'talk' as const })), code)
  const greeting = plan.greeting || `Hi, thanks for joining. Let's begin your ${roundLabel(config.round).toLowerCase()} round.`
  const iso = now.toISOString()
  const first: SimTurn = { n: 0, question_id: questions[0].id, prompt: promptFor(questions[0]), is_followup: false, asked_at: iso }
  const doc: SimSessionDoc = {
    id: newId(),
    user_id: user.id,
    status: 'active',
    config: {
      company: config.company ?? null, company_name: company.name, pattern_id: company.patternId, role: config.role, level: config.level,
      round: config.round, language: config.language, mode: config.mode, code_language: config.code_language || 'python', record: !!config.record,
    },
    greeting,
    plan: questions,
    turns: [first],
    results: [],
    cursor: 0,
    followups_used: {},
    cost_usd: ai.cost,
    ai_calls: 1,
    share_token: null,
    ...(input.retake_of ? { retake_of: input.retake_of } : {}),
    day: dayKey(now),
    month: monthKey(now),
    created_at: iso,
    updated_at: iso,
  }
  await (await sessions()).insertOne({ ...doc })
  await recordSpend(0, { newSession: true }, now).catch(() => undefined)
  return { ok: true, session: doc }
}

// ─── Answer ─────────────────────────────────────────────────────────────────

async function runCode(language: string, source: string, cases: TestCase[]): Promise<CodeRun> {
  const { executeOnce } = await import('@/lib/piston')
  let passed = 0
  let error: string | undefined
  for (const tc of cases.slice(0, 4)) {
    try {
      const r = await executeOnce({ language: language.toLowerCase(), source, stdin: tc.input, timeoutMs: 5000 })
      if (r.compile && typeof r.compile.code === 'number' && r.compile.code !== 0) { error = 'Compilation failed'; break }
      if ((r.run?.stdout || '').trim() === tc.output.trim()) passed++
      else if (r.run?.stderr && !error) error = 'Runtime error on a sample case'
    } catch {
      error = 'The code runner is unavailable'
      break
    }
  }
  return { language, passed, total: Math.min(4, cases.length), ...(error ? { error } : {}) }
}

export async function answerTurn(user: SimUser, id: string, input: AnswerInput, now = new Date()): Promise<{ ok: true; session: SimSessionDoc } | Fail> {
  const s = await getOwnSession(id, user.id)
  if (!s) return fail(404, 'Interview not found.')
  if (s.status !== 'active') return fail(409, 'This interview has ended.')
  const idx = s.turns.length - 1
  const turn = s.turns[idx]
  if (!turn || turn.n !== input.turn || turn.answered_at) return fail(409, 'This question was already answered. Refresh to continue.')
  const q = s.plan.find((p) => p.id === turn.question_id)
  if (!q) return fail(409, 'This interview is out of step. Refresh to continue.')
  const text = input.text.trim()
  if (!text && !(q.kind === 'code' && input.code?.trim())) return fail(400, 'Type or say an answer first.')

  // Claim the turn so a double submit can't score twice.
  const col = await sessions()
  const claimed = await col.updateOne({ id, user_id: user.id, status: 'active', [`turns.${idx}.n`]: input.turn, [`turns.${idx}.answered_at`]: { $exists: false } }, { $set: { [`turns.${idx}.answered_at`]: now.toISOString() } })
  if (claimed.modifiedCount !== 1) return fail(409, 'This question was already answered. Refresh to continue.')
  const release = () => col.updateOne({ id, user_id: user.id }, { $unset: { [`turns.${idx}.answered_at`]: '' } }).catch(() => undefined)

  const settings = await getSimSettings()
  const spend = await monthSpend(now)
  const scan = scanUntrusted(`${text}\n${input.code || ''}`)
  const answer = scan.flagged ? neutraliseUntrusted(text) : text
  const code = input.code ? (scan.flagged ? neutraliseUntrusted(input.code) : input.code) : undefined
  const codeLanguage = (input.code_language || s.config.code_language || 'python').slice(0, 20)
  const codeRun = q.kind === 'code' && code?.trim() && q.test_cases?.length ? await runCode(codeLanguage, code, q.test_cases) : undefined
  const voice = input.input === 'voice' ? voiceStatsFor(text, input.duration_ms) : undefined

  const followupsUsed = s.followups_used[q.id] || 0
  const followupAllowed = followupsUsed < settings.max_followups_per_question
  const nextQ = s.plan[s.cursor + 1] ?? null
  const exchanges = s.turns.filter((t) => t.question_id === q.id && t.answered_at && t.n !== turn.n).map((t) => ({ prompt: t.prompt, answer: t.answer || '' }))

  const budgetOk = canSpend(settings, s.cost_usd, spend.cost_usd)
  let parsed = null as ReturnType<typeof parseTurn>
  let cost = 0
  if (budgetOk) {
    const persona = interviewerPersona({ role: s.config.role, level: s.config.level, round: s.config.round, companyName: s.config.company_name, language: s.config.language })
    const { system, user: prompt } = buildTurnPrompt({
      persona, round: s.config.round, question: q, exchanges, prompt: turn.prompt, answer, code, codeLanguage, codeRun, followupAllowed, nextQuestion: nextQ?.text ?? null,
    })
    const ai = await callJson(system, prompt, 'interview-sim-turn', user.id)
    cost = ai.cost
    await recordSpend(cost, {}, now).catch(() => undefined)
    parsed = parseTurn(ai.json)
    if (!parsed) {
      await col.updateOne({ id, user_id: user.id }, { $inc: { cost_usd: cost, ai_calls: 1 } }).catch(() => undefined)
      await release()
      return fail(503, 'The interviewer could not process that answer. Please send it again.')
    }
  }

  const answeredTurn: SimTurn = {
    ...turn, answer: text.slice(0, 6000), ...(code ? { code: input.code!.slice(0, 50_000) } : {}), ...(codeRun ? { code_run: codeRun } : {}),
    input: input.input, ...(voice ? { voice } : {}), ...(scan.flagged ? { flagged: true } : {}), answered_at: now.toISOString(),
  }
  const turns = [...s.turns.slice(0, idx), answeredTurn]
  let results = s.results
  if (parsed) {
    const flagged = scan.flagged || s.results.find((r) => r.question_id === q.id)?.flagged
    let scores = capCorrectness(parsed.scores, codeRun)
    if (flagged) scores = capFlagged(scores)
    const result: QuestionResult = {
      question_id: q.id, scores, score: questionScore(scores, s.config.round), feedback: parsed.feedback, model_answer: parsed.model_answer,
      strengths: parsed.strengths, gaps: parsed.gaps, ...(flagged ? { flagged: true } : {}),
    }
    results = [...s.results.filter((r) => r.question_id !== q.id), result]
  }

  const step = nextStep({
    cursor: s.cursor, planned: s.plan.length, followupsUsed, maxFollowups: settings.max_followups_per_question,
    followup: followupAllowed ? parsed?.follow_up : null, turnsSoFar: turns.length, outOfBudget: !budgetOk || !canSpend(settings, s.cost_usd + cost, spend.cost_usd + cost),
  })
  const set: Record<string, unknown> = { results, updated_at: now.toISOString() }
  const reply = parsed?.reply || ''
  if (step.kind === 'followup') {
    turns.push({ n: turn.n + 1, question_id: q.id, prompt: step.text, is_followup: true, asked_at: now.toISOString() })
    set[`followups_used.${q.id}`] = followupsUsed + 1
  } else if (step.kind === 'next') {
    const nq = s.plan[step.index]
    turns.push({ n: turn.n + 1, question_id: nq.id, prompt: promptFor(nq, reply), is_followup: false, asked_at: now.toISOString() })
    set.cursor = step.index
  }
  set.turns = turns
  const upd = await col.findOneAndUpdate({ id, user_id: user.id, status: 'active' }, { $set: set, $inc: { cost_usd: cost, ai_calls: parsed ? 1 : 0 } }, { returnDocument: 'after', projection: { _id: 0 } })
  if (!upd) return fail(409, 'This interview has ended.')
  if (step.kind === 'end') {
    return finishSession(user, id, { now, closing: reply, cutShort: s.cursor + 1 < s.plan.length })
  }
  return { ok: true, session: upd as SimSessionDoc }
}

// ─── Finish ─────────────────────────────────────────────────────────────────

async function learnLinks(topic: string): Promise<Array<{ label: string; href: string }>> {
  try {
    const { listPublishedTop } = await import('@/lib/learn/queries')
    const r = await listPublishedTop({ q: topic }, 2)
    return r.items.map((p) => ({ label: String(p.title).slice(0, 90), href: `/learn/${encodeURIComponent(String(p.slug))}` }))
  } catch {
    return []
  }
}

function fallbackSummary(rep: ReturnType<typeof aggregateResults>, round: SimSessionDoc['config']['round']): { summary: string; strengths: string[]; tips: string[] } {
  const { best, worst } = rankDimensions(rep.dimension_averages)
  return {
    summary: rep.answered
      ? `You answered ${rep.answered} of ${rep.planned} questions in this ${roundLabel(round).toLowerCase()} round and scored ${rep.overall}/100. Your strongest areas were ${best.map((d) => DIMENSION_LABEL[d].toLowerCase()).join(' and ')}; focus next on ${worst.map((d) => DIMENSION_LABEL[d].toLowerCase()).join(' and ')}.`
      : 'No answers were scored in this session. Start a new one when you are ready.',
    strengths: best.map((d) => `${DIMENSION_LABEL[d]}: ${rep.dimension_averages[d]}/5 on average`),
    tips: round === 'hr'
      ? ['Use STAR: situation, task, action, result.', 'Quantify the result where you can.', 'Keep each answer under two minutes.']
      : round === 'coding'
        ? ['Restate the problem and confirm the input format.', 'Say the complexity before you code.', 'Run the sample cases, then think of edge cases.']
        : ['Start with the core idea, then add detail.', 'Name the trade-offs out loud.', 'Close with a one-line summary.'],
  }
}

export async function finishSession(user: SimUser, id: string, opts: { now?: Date; closing?: string; cutShort?: boolean } = {}): Promise<{ ok: true; session: SimSessionDoc } | Fail> {
  const now = opts.now ?? new Date()
  const s = await getOwnSession(id, user.id)
  if (!s) return fail(404, 'Interview not found.')
  if (s.status === 'completed' && s.report) return { ok: true, session: s }
  const col = await sessions()
  // One finisher at a time: flip active → completed before the AI call.
  const claim = await col.updateOne({ id, user_id: user.id, status: 'active' }, { $set: { status: 'completed', completed_at: now.toISOString(), updated_at: now.toISOString() } })
  if (claim.modifiedCount !== 1 && s.status !== 'completed') return fail(409, 'This interview is already being wrapped up.')

  const settings = await getSimSettings()
  const planned = opts.cutShort ? Math.max(s.results.length, 1) : s.plan.length
  const agg = aggregateResults(s.results, planned)
  const rows = s.plan
    .map((q) => ({ q, r: s.results.find((x) => x.question_id === q.id) }))
    .filter((x): x is { q: PlannedQuestion; r: QuestionResult } => !!x.r)
    .map(({ q, r }) => ({ ...r, text: q.text, topic: q.topic }))

  let ai: ReturnType<typeof parseReport> = null
  let cost = 0
  const spend = await monthSpend(now)
  if (rows.length && canSpend(settings, s.cost_usd, spend.cost_usd)) {
    const persona = interviewerPersona({ role: s.config.role, level: s.config.level, round: s.config.round, companyName: s.config.company_name, language: s.config.language })
    const { system, user: prompt } = buildReportPrompt({ persona, round: s.config.round, results: rows, overall: agg.overall })
    const r = await callJson(system, prompt, 'interview-sim-report', user.id)
    cost = r.cost
    await recordSpend(cost, {}, now).catch(() => undefined)
    ai = parseReport(r.json)
  }
  const fb = fallbackSummary(agg, s.config.round)
  const gapTopics = ai?.gaps.length ? ai.gaps.map((g) => g.topic) : topGapTopics(s.results, rows.filter((r) => r.score < 60).map((r) => r.topic))
  const gaps: ReportGap[] = await Promise.all(gapTopics.slice(0, 5).map(async (topic) => {
    const posts = await learnLinks(topic)
    return {
      topic,
      note: ai?.gaps.find((g) => g.topic === topic)?.note || '',
      links: [...posts.map((p) => ({ ...p, kind: 'learn' as const })), ...gapLinks(topic, s.config.round, s.config.pattern_id)].slice(0, 5),
    }
  }))
  const report: SimReport = {
    ...agg,
    summary: ai?.summary || fb.summary,
    strengths: ai?.strengths.length ? ai.strengths : fb.strengths,
    gaps,
    tips: ai?.tips.length ? ai.tips : fb.tips,
    questions: rows,
    voice: aggregateVoice(s.turns),
    ...(ai ? {} : { fallback: true }),
    generated_at: now.toISOString(),
  }
  const done = await col.findOneAndUpdate({ id, user_id: user.id }, {
    $set: { report, status: 'completed', updated_at: now.toISOString(), ...(opts.closing ? { closing: opts.closing } : {}) },
    $inc: { cost_usd: cost, ai_calls: ai ? 1 : 0 },
  }, { returnDocument: 'after', projection: { _id: 0 } })
  if (!done) return fail(404, 'Interview not found.')
  return { ok: true, session: done as SimSessionDoc }
}

// ─── Views ──────────────────────────────────────────────────────────────────

export async function toView(s: SimSessionDoc): Promise<SimSessionView> {
  const rec = await getRecordingMeta(s.id, s.user_id).catch(() => null)
  const last = s.turns[s.turns.length - 1]
  const q = last ? s.plan.find((p) => p.id === last.question_id) : undefined
  const { user_id: _u, followups_used: _f, cost_usd: _c, ai_calls: _a, day: _d, month: _m, plan, ...rest } = s
  return {
    ...rest,
    plan: plan.map((p) => ({ id: p.id, topic: p.topic, kind: p.kind })),
    current: s.status === 'active' && last && !last.answered_at && q
      ? { turn: last.n, prompt: last.prompt, kind: q.kind, question_id: q.id, is_followup: last.is_followup, ...(q.kind === 'code' ? { test_cases: q.test_cases, starter_code: q.starter_code } : {}) }
      : null,
    recording: rec ? { size: rec.size, mime: rec.mime, expires_at: rec.expires_at.toISOString() } : null,
    share_url: s.share_token ? `/interview-report/${s.share_token}` : null,
  }
}

export function toHistoryItem(s: SimSessionDoc, hasRecording: boolean): SimHistoryItem {
  return {
    id: s.id, status: s.status, company_name: s.config.company_name, role: s.config.role, level: s.config.level, round: s.config.round, mode: s.config.mode,
    overall: s.report?.overall ?? null, readiness: s.report?.readiness ?? null, answered: s.report?.answered ?? (s.results?.length || 0),
    planned: s.report?.planned ?? 0, shared: !!s.share_token, has_recording: hasRecording, created_at: s.created_at,
  }
}

/** The shared report: scores, feedback and questions — never answers, code, recordings or who took it. */
export function publicReport(s: SimSessionDoc): { config: Pick<SimSessionDoc['config'], 'company_name' | 'role' | 'level' | 'round' | 'mode'>; report: SimReport; completed_at: string | null } | null {
  if (!s.report) return null
  return {
    config: { company_name: s.config.company_name, role: s.config.role, level: s.config.level, round: s.config.round, mode: s.config.mode },
    report: s.report,
    completed_at: s.completed_at ?? null,
  }
}

