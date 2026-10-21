/**
 * Question bot run (server only): fill the biggest bank gaps with AI drafts.
 *
 *   1. caps: daily question cap + monthly AI cost cap (lib/question-bot/settings)
 *   2. one run at a time (claim in question_bot_settings, across replicas)
 *   3. plan: biggest (domain × type × difficulty) gaps first (planner.ts)
 *   4. per cell: the shared generator (lib/question-bank-generate.ts — dedupe,
 *      drafts) with the quality gate (quality.ts): bad MCQs are dropped, coding
 *      questions only survive if their reference solution passes its own test
 *      cases in the sandbox (Piston)
 *   5. every draft carries domain, quality score + reasons and the run id;
 *      reviewers approve them on Admin → SME review → Question drafts
 *
 * Nightly from lib/scheduler.ts (heavy lane, day window, heartbeat
 * `question-bot`), "Run now" from the admin page and the run_question_bot tool.
 */
import 'server-only'
import { logger } from '@/lib/logger'
import type { BankQuestionDoc } from '@/lib/question-bank'
import type { BankDifficulty, QuestionDomain } from './domains'
import { planRun, type PlannedCell } from './planner'
import { checkQuestionQuality, verifyReferenceSolution, type ExecFn } from './quality'
import { nightlyDue, runBudget, type QuestionBotSettings } from './settings'
import { newId } from '@/lib/db/ids'
import {
  claimRun, coverageCounts, dayKey, getBotSettings, listDomains, monthKey, releaseRun, saveRunDoc, startRunDoc, usageSoFar,
  type BotCellResult, type BotRunDoc,
} from './store'

export interface BotRunSummary {
  ok: boolean
  status: BotRunDoc['status'] | 'blocked'
  runId?: string
  inserted: number
  dropped: number
  costUsd: number
  message: string
}

const MCQ_RULES = 'QUALITY RULES: every MCQ has exactly 4 distinct options and exactly ONE correct option; "answer" is the exact text of that option (not a letter); "explanation" says in 1-3 sentences why it is right. Avoid "all of the above" / "none of the above".'

function codingRules(language: string): string {
  return `CODING RULES: each coding question must be solvable by a program that reads stdin and prints to stdout. Also return "language": "${language}" and "reference_solution": a complete, correct ${language} program that reads the input from stdin and prints exactly the expected output. Give 3-4 "test_cases" whose "output" is EXACTLY what reference_solution prints for that "input" (no extra text). "explanation" describes the approach. Never show the solution inside "question".`
}

/** Bank executor → the quality gate's ExecFn. */
const pistonExec: ExecFn = async ({ language, source, stdin }) => {
  const { executeOnce } = await import('@/lib/piston')
  const r = await executeOnce({ language, source, stdin })
  if (r.compile && typeof r.compile.code === 'number' && r.compile.code !== 0) return { stdout: '', code: r.compile.code, stderr: r.compile.stderr }
  return { stdout: r.run.stdout || '', code: r.run.code, stderr: r.run.stderr }
}

function topicFor(d: QuestionDomain, cell: PlannedCell, i: number): string {
  const topics = d.topics.length ? d.topics : [d.label]
  return topics[(cell.current + i) % topics.length]
}


/** The quality gate for one cell (enriches the doc in place). */
function gateFor(d: QuestionDomain, cell: PlannedCell, runId: string, exec: ExecFn) {
  return async (raw: Record<string, unknown>, doc: BankQuestionDoc): Promise<{ keep: boolean; reason?: string }> => {
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined)
    const language = cell.type === 'coding' ? (str(raw.language, 20)?.toLowerCase() || d.language) : undefined
    const reference = cell.type === 'coding' ? str(raw.reference_solution, 20_000) : undefined
    const q = checkQuestionQuality({
      type: doc.type,
      question: doc.question,
      options: doc.options,
      answer: doc.answer,
      explanation: doc.explanation,
      rawDifficulty: raw.difficulty,
      requestedDifficulty: cell.difficulty,
      test_cases: doc.test_cases,
      reference_solution: reference,
      language,
    })
    if (doc.type !== cell.type) return { keep: false, reason: `Wrong type (${doc.type})` }
    if (!q.pass) return { keep: false, reason: q.reasons[0] }
    const reasons = [...q.reasons]
    if (cell.type === 'coding') {
      const v = await verifyReferenceSolution({ language, reference_solution: reference, test_cases: doc.test_cases }, exec)
      if (!v.ok) return { keep: false, reason: v.reason }
      reasons.push(`Reference solution passed ${v.passed}/${v.total} test cases`)
    }
    const out = doc
    if (q.fixes.answer) out.answer = q.fixes.answer
    out.difficulty = cell.difficulty
    out.domain = d.id
    if (d.kind === 'branch' && d.branch) out.branch = d.branch
    out.quality_score = q.score
    out.quality_reasons = reasons.slice(0, 10)
    out.bot_run_id = runId
    if (cell.type === 'coding') {
      // Same shape as the reverse-coding reference (lib/question-extensions.ts): staff only.
      out.reference_solution = { language: language!, code: reference! }
      out.language = language
    }
    return { keep: true }
  }
}

/**
 * Run the bot once. `trigger: 'cron'` only runs while enabled; manual / agent
 * runs work while switched off, but every run obeys the caps.
 */
export async function runQuestionBot(opts: { trigger: BotRunDoc['trigger']; by?: string | null; now?: Date; timeBudgetMs?: number; exec?: ExecFn } = { trigger: 'manual' }): Promise<BotRunSummary> {
  const now = opts.now ?? new Date()
  const settings = await getBotSettings()
  const none = (status: BotRunSummary['status'], message: string): BotRunSummary => ({ ok: status !== 'failed', status, inserted: 0, dropped: 0, costUsd: 0, message })
  if (opts.trigger === 'cron' && !settings.enabled) return none('skipped', 'The question bot is switched off.')

  const usage = await usageSoFar(now)
  const budget = runBudget(settings, usage.writtenToday, usage.spentThisMonth)
  if (budget.questions <= 0) return none('blocked', budget.blocked || 'Nothing left in today’s budget.')

  const runId = newId()
  if (!(await claimRun(runId, now))) return none('blocked', 'Another run is in progress. Try again in a few minutes.')
  const started = Date.now()
  const deadline = started + (opts.timeBudgetMs ?? 8 * 60_000)
  let run: BotRunDoc | null = null
  try {
    const domains = await listDomains({ activeOnly: true })
    const coverage = await coverageCounts(domains)
    const plan = planRun(domains, coverage.total, { budget: budget.questions, perCellMax: settings.per_cell_cap })
    if (!plan.length) return none('skipped', 'Every target is met. Raise targets or add domains to write more.')

    run = await startRunDoc({
      id: runId, trigger: opts.trigger, by: opts.by ?? null, status: 'running', started_at: now.toISOString(),
      day: dayKey(now), month: monthKey(now),
      planned: plan.map((c) => ({ domain: c.domain, type: c.type, difficulty: c.difficulty, gap: c.gap, take: c.take })),
      results: [], inserted: 0, dropped: 0, cost_usd: 0,
    })
    const byId = new Map(domains.map((d) => [d.id, d]))
    const { generateBankQuestions } = await import('@/lib/question-bank-generate')
    const exec = opts.exec ?? pistonExec
    let stopReason = ''
    for (const [i, cell] of plan.entries()) {
      if (Date.now() > deadline) { stopReason = 'Stopped at the run time limit.'; break }
      if (usage.spentThisMonth + run.cost_usd >= settings.monthly_cost_cap_usd) { stopReason = 'Stopped at the monthly AI cap.'; break }
      const d = byId.get(cell.domain)!
      const res: BotCellResult = { domain: cell.domain, type: cell.type, difficulty: cell.difficulty, asked: cell.take, inserted: 0, skipped: 0, dropped: 0, reasons: [] }
      if (cell.type === 'coding' && !d.language) {
        res.error = 'No language set for coding questions'
      } else {
        try {
          const g = await generateBankQuestions({
            branch: d.kind === 'branch' ? d.branch : undefined,
            subject: topicFor(d, cell, i),
            difficulty: cell.difficulty as BankDifficulty,
            types: [cell.type],
            count: cell.take,
            domain: { id: d.id, label: d.label },
            extraInstructions: cell.type === 'coding' ? codingRules(d.language!) : MCQ_RULES,
            extraFields: cell.type === 'coding' ? '"language": string, "reference_solution": string' : undefined,
          }, { maxCount: cell.take, gate: gateFor(d, cell, runId, exec), feature: 'question-bot' })
          run.cost_usd = Math.round((run.cost_usd + g.costUsd) * 1e6) / 1e6
          if (g.ok) {
            res.inserted = g.inserted.length
            res.skipped = g.skipped
            res.dropped = g.dropped
            res.reasons = [...new Set(g.dropReasons)].slice(0, 5)
            if (g.errors.length) res.error = g.errors[0]
          } else {
            res.error = g.error.slice(0, 300)
          }
        } catch (e) {
          res.error = 'Generation failed'
          logger.warn(`[question-bot] cell ${cell.domain}/${cell.type}/${cell.difficulty}: ${(e as Error)?.message?.slice(0, 200)}`)
        }
      }
      run.results.push(res)
      run.inserted += res.inserted
      run.dropped += res.dropped
      await saveRunDoc(runId, { results: run.results, inserted: run.inserted, dropped: run.dropped, cost_usd: run.cost_usd })
    }
    const failedCells = run.results.filter((r) => r.error && r.inserted === 0).length
    run.status = run.inserted === 0 && failedCells > 0 ? 'failed' : failedCells > 0 || stopReason ? 'partial' : 'ok'
    run.message = [`Wrote ${run.inserted} draft${run.inserted === 1 ? '' : 's'} across ${run.results.length} batch${run.results.length === 1 ? '' : 'es'}${run.dropped ? `, dropped ${run.dropped} that failed the quality gate` : ''}.`, stopReason].filter(Boolean).join(' ')
    await saveRunDoc(runId, { status: run.status, message: run.message, finished_at: new Date().toISOString() })
    return { ok: run.status !== 'failed', status: run.status, runId, inserted: run.inserted, dropped: run.dropped, costUsd: run.cost_usd, message: run.message }
  } catch (e) {
    if (run) await saveRunDoc(runId, { status: 'failed', message: 'The run stopped with an error.', finished_at: new Date().toISOString() }).catch(() => undefined)
    throw e
  } finally {
    await releaseRun(runId)
  }
}

// ─── Scheduler hook ─────────────────────────────────────────────────────────

let cached: { at: number; s: QuestionBotSettings } | null = null
/** Is the nightly run due? Reads settings at most every 5 minutes (called every minute). */
export async function questionBotDue(now: Date): Promise<boolean> {
  if (!cached || Date.now() - cached.at > 5 * 60_000) cached = { at: Date.now(), s: await getBotSettings() }
  return nightlyDue(cached.s, now)
}

/** Drop the cached settings (after an admin changes them). */
export function resetQuestionBotCache(): void {
  cached = null
}
