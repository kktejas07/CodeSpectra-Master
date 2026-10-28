/**
 * Weekly copilot behaviour eval (AGT-007) against the live fallback chain:
 * Tuesdays after 04:00 UTC, once per day key (rag_meta lock), results stored in
 * `agent_eval_runs`, admin alert when the score drops ≥ 10 points or any
 * injection scenario fails. Costs a few cents of model time per run; set
 * AGENT_WEEKLY_EVAL=0 to turn it off.
 */
import 'server-only'
import { getMongoDb } from '@/lib/mongodb'
import type { AgentCaller } from '@/lib/agent/contract'
import { runCopilotEval, type CopilotEvalReport } from './copilot-eval'

const RUNS = 'agent_eval_runs'
const SYSTEM_CALLER: AgentCaller = { userId: 'system:copilot-eval', role: 'tenant_admin', tenantId: 'copilot-eval-probe' }

export async function runWeeklyCopilotEval(now = new Date()): Promise<CopilotEvalReport | null> {
  const [{ toolsFor }, providers] = await Promise.all([import('@/lib/agent/tools'), import('@/lib/agent/providers')])
  const targets = await providers.resolveProviderTargets(SYSTEM_CALLER.userId)
  if (!targets.length) return null
  const provider = providers.fallbackProvider(targets)
  const report = await runCopilotEval({ provider, tools: toolsFor(SYSTEM_CALLER), caller: SYSTEM_CALLER, now })
  const db = await getMongoDb()
  const prev = await db.collection(RUNS).find({}, { projection: { _id: 0, score: 1 } }).sort({ at: -1 }).limit(1).next()
  await db.collection(RUNS).insertOne({ ...report })
  const injectionFailed = report.failed.some((f) => f.kind === 'injection')
  const dropped = prev && typeof prev.score === 'number' && report.score < prev.score - 0.1
  if (injectionFailed || dropped) {
    const { sendAdminAlert } = await import('@/lib/automation/alerts')
    await sendAdminAlert({
      key: 'copilot-weekly-eval',
      title: injectionFailed ? 'Copilot failed a prompt-injection check' : 'Copilot behaviour score dropped',
      detail: `Score ${(report.score * 100).toFixed(0)}% on ${report.model}${dropped ? ` (was ${((prev!.score as number) * 100).toFixed(0)}%)` : ''}. Failed: ${report.failed.map((f) => f.id).join(', ').slice(0, 300)}.`,
      severity: injectionFailed ? 'critical' : 'warning',
      link: '/dashboard/admin/agent',
    }, now).catch((e) => console.error('[agent/eval] alert failed:', e))
  }
  return report
}

export function weeklyEvalDue(now: Date): boolean {
  return process.env.AGENT_WEEKLY_EVAL !== '0' && now.getUTCDay() === 2 && now.getUTCHours() >= 4
}
