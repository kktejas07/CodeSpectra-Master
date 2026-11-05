/**
 * AI Tools automations — AUTO-AI series.
 *
 * Covers all 12 AI admin modules:
 *   AUTO-AI-01  RAG re-index          daily: keep the vector search index fresh
 *   AUTO-AI-02  Knowledge sync        daily: re-index all knowledge sources
 *   AUTO-AI-03  AI inventory audit    weekly: scan for new/removed/misconfigured models
 *   AUTO-AI-04  Question bot          daily: generate questions per domain coverage matrix
 *   AUTO-AI-05  Question generator    weekly: bulk-generate problems for underweight topics
 *   AUTO-AI-06  Company pattern sync  weekly: refresh company test patterns from source URLs
 *   AUTO-AI-07  Agent loop sweep      interval/5 min: advance due agent-loop runs + collect findings
 *   AUTO-AI-08  Interview sim stats   daily: snapshot usage + quality stats for the sim
 *   AUTO-AI-09  AI cost snapshot      daily: record token spend per model for cost tracking
 *   AUTO-AI-10  Hiring agent sweep    interval/5 min: advance pending hiring-agent actions
 *   AUTO-AI-11  Assistants health     daily: ping each enabled assistant, record latency + errors
 *   AUTO-AI-12  Copilot warmup        interval/60 min: warm the RAG index + test a sample query
 */
import { getMongoDb } from '@/lib/mongodb'
import { claimOnce, nowIso } from '../store'
import type { SystemAutomation } from './types'

// ─── helpers ────────────────────────────────────────────────────────────────

type Doc = Record<string, unknown>

/** Internal fetch helper — calls Next.js API routes from within the server
 *  using the per-process internal cron token (lib/cron-auth.ts) so no real
 *  HTTP session is needed. */
function appBase(): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

async function internalPost(path: string, body: Doc = {}): Promise<Doc> {
  try {
    const { internalCronToken } = await import('@/lib/cron-auth')
    const res = await fetch(`${appBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalCronToken()}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    })
    return (await res.json()) as Doc
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

async function internalGet(path: string): Promise<Doc> {
  try {
    const { internalCronToken } = await import('@/lib/cron-auth')
    const res = await fetch(`${appBase()}${path}`, {
      headers: { Authorization: `Bearer ${internalCronToken()}` },
      signal: AbortSignal.timeout(60_000),
    })
    return (await res.json()) as Doc
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ─── AUTO-AI-01: RAG re-index ────────────────────────────────────────────────

export async function runRagReindex(): Promise<Record<string, unknown>> {
  const result = await internalPost('/api/admin/rag/reindex')
  if (result.error) throw new Error(String(result.error))
  return { indexed: result.count ?? 0 }
}

// ─── AUTO-AI-02: Knowledge sync ──────────────────────────────────────────────

export async function runKnowledgeSync(): Promise<Record<string, unknown>> {
  // Trigger a full knowledge source re-index (queues all sources).
  const db = await getMongoDb()
  // Mark every source as pending so the knowledge indexer picks them up.
  const upd = await db.collection('knowledge_sources').updateMany(
    { status: { $ne: 'disabled' } },
    { $set: { needs_reindex: true, queued_at: nowIso() } },
  )
  return { queued: upd.modifiedCount }
}

// ─── AUTO-AI-03: AI inventory audit ──────────────────────────────────────────

export async function runAiInventoryAudit(): Promise<Record<string, unknown>> {
  const db = await getMongoDb()
  // Pull all configured models from settings.
  const settings = await db.collection('platform_settings').findOne({ key: 'ai_models' }) as Doc | null
  const models: Doc[] = Array.isArray(settings?.value) ? settings!.value as Doc[] : []

  const findings: string[] = []

  // Check each model for a valid API key reference.
  for (const m of models) {
    const keyRef = String(m.api_key_env ?? m.key_ref ?? '')
    if (!keyRef) {
      findings.push(`Model "${m.id ?? m.name}" has no API key reference`)
      continue
    }
    // Check the env or secrets store has a value.
    const hasKey = !!process.env[keyRef]
    if (!hasKey) findings.push(`Model "${m.id ?? m.name}" key env "${keyRef}" is unset`)
  }

  // Record findings in the audit collection.
  if (findings.length) {
    await db.collection('ai_audit_findings').insertOne({
      type: 'inventory_audit',
      findings,
      model_count: models.length,
      created_at: nowIso(),
    })
  }

  return { models: models.length, findings: findings.length }
}

// ─── AUTO-AI-04: Question bot generation ────────────────────────────────────

export async function runQuestionBotGeneration(now: Date): Promise<Record<string, unknown>> {
  const db = await getMongoDb()

  // Only run once per day (idempotency key on the UTC date).
  const dayKey = now.toISOString().slice(0, 10)
  const claimed = await claimOnce(`ai:qbot:${dayKey}`)
  if (!claimed) return { skipped: true, reason: 'already ran today' }

  // Load domains and their coverage targets from settings.
  const settings = await db.collection('platform_settings').findOne({ key: 'question_bot' }) as Doc | null
  if (!settings?.value) return { skipped: true, reason: 'no question bot settings' }

  const domains = Array.isArray((settings.value as Doc).domains) ? (settings.value as Doc).domains as Doc[] : []
  let generated = 0
  let errors = 0

  for (const domain of domains) {
    const domainId = String(domain.id ?? domain.name ?? 'unknown')
    const types: string[] = Array.isArray(domain.types) ? domain.types as string[] : ['mcq', 'coding']
    const difficulties: string[] = Array.isArray(domain.difficulties) ? domain.difficulties as string[] : ['beginner', 'intermediate', 'advanced']

    for (const type of types) {
      for (const difficulty of difficulties) {
        // Count current approved questions.
        const current = await db.collection('question_bank').countDocuments({
          domain: domainId, type, difficulty, status: 'approved',
        })
        const target = Number(domain[`target_${difficulty}`] ?? domain.target ?? 20)
        if (current >= target) continue

        const toGenerate = Math.min(target - current, 3) // max 3 per sweep to stay within budget
        for (let i = 0; i < toGenerate; i++) {
          const result = await internalPost('/api/ai/generate-problem', {
            role: String(domain.role ?? 'Software Engineer'),
            difficulty,
            topics: Array.isArray(domain.topics) ? domain.topics : [domainId],
            language_hint: 'python',
            publish: false, // bot-generated questions go to review queue, not live
            source: 'question_bot',
            domain: domainId,
          })
          if (result.error) { errors++; continue }
          generated++
        }
      }
    }
  }

  return { generated, errors, domains: domains.length }
}

// ─── AUTO-AI-05: Question generator bulk run ─────────────────────────────────

export async function runBulkQuestionGeneration(now: Date): Promise<Record<string, unknown>> {
  const db = await getMongoDb()
  const weekKey = `${now.getUTCFullYear()}-W${Math.floor(now.getUTCDate() / 7)}`
  const claimed = await claimOnce(`ai:qgen:${weekKey}`)
  if (!claimed) return { skipped: true, reason: 'already ran this week' }

  // Find topic/difficulty combos with fewer than 10 problems.
  const pipeline = [
    { $group: { _id: { topics: '$topics', difficulty: '$difficulty' }, count: { $sum: 1 } } },
    { $match: { count: { $lt: 10 } } },
    { $limit: 10 }, // cap per sweep
  ]
  const underweight = await db.collection('problems').aggregate(pipeline).toArray()
  let generated = 0

  for (const row of underweight) {
    const { topics, difficulty } = (row._id as { topics: string[]; difficulty: string })
    const result = await internalPost('/api/ai/generate-problem', {
      role: 'Software Engineer',
      difficulty: difficulty ?? 'intermediate',
      topics: Array.isArray(topics) ? topics.slice(0, 3) : ['algorithms'],
      language_hint: 'python',
      publish: true,
      source: 'bulk_gen',
    })
    if (!result.error) generated++
  }

  return { generated, underweight: underweight.length }
}

// ─── AUTO-AI-06: Company pattern sync ────────────────────────────────────────

export async function runCompanyPatternSync(now: Date): Promise<Record<string, unknown>> {
  const db = await getMongoDb()
  const weekKey = `${now.getUTCFullYear()}-W${Math.ceil(now.getUTCDate() / 7)}`
  const claimed = await claimOnce(`ai:cpattern:${weekKey}`)
  if (!claimed) return { skipped: true, reason: 'already ran this week' }

  // Patterns with a sourceUrl that haven't been reviewed in 30+ days.
  const cutoff = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)
  const stale = await db.collection('company_patterns').find(
    { sourceUrl: { $exists: true, $ne: '' }, $or: [{ lastReviewed: { $lt: cutoff } }, { lastReviewed: { $exists: false } }] },
    { projection: { id: 1, name: 1, sourceUrl: 1 }, limit: 20 },
  ).toArray() as Doc[]

  let synced = 0
  for (const p of stale) {
    // Flag for manual review — the AI doesn't auto-modify patterns, it just surfaces them.
    await db.collection('company_patterns').updateOne(
      { id: p.id },
      { $set: { review_flagged: true, review_flagged_at: nowIso(), review_reason: 'stale (auto-sync)' } },
    )
    synced++
  }

  return { flagged: synced, total_stale: stale.length }
}

// ─── AUTO-AI-07: Agent loop sweep ────────────────────────────────────────────

export async function runAgentLoopSweep(): Promise<Record<string, unknown>> {
  const { AGENT_LOOPS } = await import('@/lib/agent-loops/registry')
  const { getLoopSettings } = await import('@/lib/agent-loops/store')
  const db = await getMongoDb()

  let advanced = 0
  let errors = 0

  for (const loop of AGENT_LOOPS) {
    const { settings } = await getLoopSettings(loop.id)
    if (!settings.enabled) continue

    // Find runs in 'running' state that need advancing.
    const runs = await db.collection('agent_loop_runs').find(
      { loop_id: loop.id, status: 'running', next_step_at: { $lte: nowIso() } },
      { projection: { id: 1 }, limit: 5 },
    ).toArray() as Doc[]

    for (const run of runs) {
      const result = await internalPost('/api/admin/agent-loops/advance', { loop_id: loop.id, run_id: run.id })
      if (result.error) errors++
      else advanced++
    }
  }

  return { advanced, errors }
}

// ─── AUTO-AI-08: Interview sim stats snapshot ─────────────────────────────────

export async function runInterviewSimSnapshot(now: Date): Promise<Record<string, unknown>> {
  const db = await getMongoDb()
  const dayKey = now.toISOString().slice(0, 10)
  const claimed = await claimOnce(`ai:simsnapshot:${dayKey}`)
  if (!claimed) return { skipped: true, reason: 'already snapshotted today' }

  const [total, completed, failed] = await Promise.all([
    db.collection('interview_sim_sessions').countDocuments({}),
    db.collection('interview_sim_sessions').countDocuments({ status: 'completed' }),
    db.collection('interview_sim_sessions').countDocuments({ status: 'failed' }),
  ])

  const avgScore = await db.collection('interview_sim_sessions').aggregate([
    { $match: { status: 'completed', score: { $exists: true } } },
    { $group: { _id: null, avg: { $avg: '$score' } } },
  ]).toArray()

  await db.collection('interview_sim_snapshots').insertOne({
    date: dayKey,
    total,
    completed,
    failed,
    avg_score: avgScore[0]?.avg ?? null,
    created_at: nowIso(),
  })

  return { total, completed, failed }
}

// ─── AUTO-AI-09: AI cost snapshot ────────────────────────────────────────────

export async function runAiCostSnapshot(now: Date): Promise<Record<string, unknown>> {
  const db = await getMongoDb()
  const dayKey = now.toISOString().slice(0, 10)
  const claimed = await claimOnce(`ai:costsnapshot:${dayKey}`)
  if (!claimed) return { skipped: true, reason: 'already snapshotted today' }

  // Aggregate token usage from ai_usage_log for the past day.
  const since = new Date(now.getTime() - 86_400_000).toISOString()
  const pipeline = [
    { $match: { created_at: { $gte: since } } },
    { $group: { _id: '$model', tokens_in: { $sum: '$tokens_in' }, tokens_out: { $sum: '$tokens_out' }, calls: { $sum: 1 } } },
  ]
  const rows = await db.collection('ai_usage_log').aggregate(pipeline).toArray()

  await db.collection('ai_cost_snapshots').insertOne({
    date: dayKey,
    models: rows.map((r) => ({ model: r._id, tokens_in: r.tokens_in, tokens_out: r.tokens_out, calls: r.calls })),
    total_calls: rows.reduce((s, r) => s + Number(r.calls ?? 0), 0),
    created_at: nowIso(),
  })

  return { models: rows.length, total_calls: rows.reduce((s, r) => s + Number(r.calls ?? 0), 0) }
}

// ─── AUTO-AI-10: Hiring agent sweep ──────────────────────────────────────────

export async function runHiringAgentSweep(): Promise<Record<string, unknown>> {
  const result = await internalGet('/api/admin/hiring-agents?action=sweep')
  if (result.error) throw new Error(String(result.error))
  return { processed: result.processed ?? 0, pending: result.pending ?? 0 }
}

// ─── AUTO-AI-11: Assistants health check ─────────────────────────────────────

export async function runAssistantsHealthCheck(now: Date): Promise<Record<string, unknown>> {
  const db = await getMongoDb()
  const dayKey = now.toISOString().slice(0, 10)
  const claimed = await claimOnce(`ai:assisthealth:${dayKey}`)
  if (!claimed) return { skipped: true, reason: 'already checked today' }

  const assistants = await db.collection('assistants').find(
    { enabled: true },
    { projection: { id: 1, name: 1 } },
  ).toArray() as Doc[]

  const results: Array<{ id: string; ok: boolean; latency_ms?: number; error?: string }> = []

  for (const a of assistants) {
    const start = Date.now()
    const r = await internalPost('/api/admin/assistants/ping', { id: a.id })
    results.push({
      id: String(a.id),
      ok: !r.error,
      latency_ms: Date.now() - start,
      error: r.error ? String(r.error) : undefined,
    })
  }

  await db.collection('assistant_health_log').insertOne({
    date: dayKey,
    results,
    healthy: results.filter((r) => r.ok).length,
    total: results.length,
    created_at: nowIso(),
  })

  return { healthy: results.filter((r) => r.ok).length, total: results.length }
}

// ─── AUTO-AI-12: Copilot warmup ───────────────────────────────────────────────

export async function runCopilotWarmup(): Promise<Record<string, unknown>> {
  // Send a no-op query to keep the RAG index warm and verify it's responding.
  const result = await internalPost('/api/admin/rag/search', {
    query: 'warmup check', // minimal query; discards result
    limit: 1,
  })
  if (result.error) throw new Error(`Copilot warmup failed: ${result.error}`)
  return { ok: true, results: Array.isArray(result.results) ? result.results.length : 0 }
}

// ─── Automation registry ─────────────────────────────────────────────────────

export const AI_TOOL_AUTOMATIONS: SystemAutomation[] = [
  {
    id: 'ai-rag-reindex',
    title: 'RAG index refresh',
    description: 'Re-indexes all platform content into the vector search index every night so AI features always search the latest problems, docs and hackathons.',
    group: 'AI Tools',
    refs: ['AUTO-AI-01'],
    cadence: { kind: 'daily', hourUtc: 2, minuteUtc: 0 },
    run: () => runRagReindex(),
    defaultOn: true,
    heavy: true,
  },
  {
    id: 'ai-knowledge-sync',
    title: 'Knowledge source sync',
    description: "Queues all active knowledge sources for re-indexing each night, keeping the AI copilot's knowledge base current.",
    group: 'AI Tools',
    refs: ['AUTO-AI-02'],
    cadence: { kind: 'daily', hourUtc: 3, minuteUtc: 0 },
    run: () => runKnowledgeSync(),
    defaultOn: true,
  },
  {
    id: 'ai-inventory-audit',
    title: 'AI model inventory audit',
    description: 'Scans all configured AI models weekly to verify API keys are set and flag any misconfigured or missing integrations.',
    group: 'AI Tools',
    refs: ['AUTO-AI-03'],
    cadence: { kind: 'weekly', weekdayUtc: 1, hourUtc: 4 },
    run: () => runAiInventoryAudit(),
    defaultOn: true,
  },
  {
    id: 'ai-question-bot',
    title: 'Question bot generation',
    description: 'Runs the question bot daily: generates new MCQ and coding questions for any domain/difficulty cell below its coverage target.',
    group: 'AI Tools',
    refs: ['AUTO-AI-04'],
    cadence: { kind: 'daily', hourUtc: 1, minuteUtc: 30 },
    run: (now) => runQuestionBotGeneration(now),
    defaultOn: false,
    heavy: true,
  },
  {
    id: 'ai-question-generator',
    title: 'Bulk question generation',
    description: 'Generates new coding problems each week for any topic/difficulty combination that has fewer than 10 problems in the library.',
    group: 'AI Tools',
    refs: ['AUTO-AI-05'],
    cadence: { kind: 'weekly', weekdayUtc: 2, hourUtc: 2 },
    run: (now) => runBulkQuestionGeneration(now),
    defaultOn: false,
    heavy: true,
  },
  {
    id: 'ai-company-pattern-sync',
    title: 'Company pattern sync',
    description: "Flags company test patterns whose source URL hasn't been reviewed in 30+ days, surfacing them for admin review.",
    group: 'AI Tools',
    refs: ['AUTO-AI-06'],
    cadence: { kind: 'weekly', weekdayUtc: 0, hourUtc: 3 },
    run: (now) => runCompanyPatternSync(now),
    defaultOn: true,
  },
  {
    id: 'ai-agent-loops',
    title: 'Agent loop sweep',
    description: 'Advances all active agent-loop runs every 5 minutes, collecting findings and unblocking stalled loops.',
    group: 'AI Tools',
    refs: ['AUTO-AI-07'],
    cadence: { kind: 'interval', minutes: 5 },
    run: () => runAgentLoopSweep(),
    defaultOn: false,
  },
  {
    id: 'ai-interview-sim-snapshot',
    title: 'Interview sim stats snapshot',
    description: 'Takes a daily snapshot of interview simulator usage — total sessions, completion rate, and average score — for the AI usage dashboard.',
    group: 'AI Tools',
    refs: ['AUTO-AI-08'],
    cadence: { kind: 'daily', hourUtc: 0, minuteUtc: 30 },
    run: (now) => runInterviewSimSnapshot(now),
    defaultOn: true,
  },
  {
    id: 'ai-cost-snapshot',
    title: 'AI cost daily snapshot',
    description: 'Records daily token usage and estimated cost per model so the AI Cost page always shows up-to-date spend breakdowns.',
    group: 'AI Tools',
    refs: ['AUTO-AI-09'],
    cadence: { kind: 'daily', hourUtc: 0, minuteUtc: 15 },
    run: (now) => runAiCostSnapshot(now),
    defaultOn: true,
  },
  {
    id: 'ai-hiring-agents',
    title: 'Hiring agent sweep',
    description: 'Runs every 5 minutes to advance pending hiring agent actions: approvals, auto-sent messages, and case hold/release decisions.',
    group: 'AI Tools',
    refs: ['AUTO-AI-10'],
    cadence: { kind: 'interval', minutes: 5 },
    run: () => runHiringAgentSweep(),
    defaultOn: false,
  },
  {
    id: 'ai-assistants-health',
    title: 'Assistants health check',
    description: 'Pings each enabled assistant daily and logs latency and errors, so degraded assistants appear in the AI inventory audit.',
    group: 'AI Tools',
    refs: ['AUTO-AI-11'],
    cadence: { kind: 'daily', hourUtc: 5, minuteUtc: 0 },
    run: (now) => runAssistantsHealthCheck(now),
    defaultOn: true,
  },
  {
    id: 'ai-copilot-warmup',
    title: 'AI Copilot warmup',
    description: 'Sends a lightweight probe query to the RAG index every hour to keep it warm and verify it\'s responding correctly.',
    group: 'AI Tools',
    refs: ['AUTO-AI-12'],
    cadence: { kind: 'interval', minutes: 60 },
    run: () => runCopilotWarmup(),
    defaultOn: false,
  },
]
