/**
 * Core stage handlers: `applied` (passes straight through — the stage's
 * advance mode decides auto vs recruiter approval) and `screening` (résumé
 * match against job.criteria, optional AI fit).
 */
import { registerStageHandler } from '../handlers'
import { recordStageResult } from '../engine'
import { atsApplications, nowIso } from '../db'
import { aiFitScore, scoreCandidate, toMatch } from '../screening-score'
import type { AtsCandidate, AtsJob } from '../contract'

registerStageHandler({
  type: 'applied',
  async onEnter({ app, stage }) {
    await recordStageResult(app.id, { stage_id: stage.id, outcome: 'pass', summary: 'Application received', at: nowIso() })
  },
})

/** Score one candidate for a job (AI fit when the job asks for it). */
export async function screenCandidate(job: AtsJob, candidate: AtsCandidate) {
  const text = candidate.resume?.text || ''
  const aiFit = job.criteria.use_ai_match ? await aiFitScore(job, text) : null
  return scoreCandidate(job.criteria, { text, parsed: candidate.parsed, aiFit }, job)
}

registerStageHandler({
  type: 'screening',
  async onEnter({ app, job, candidate, stage }) {
    if (!candidate.resume?.text?.trim() && !candidate.parsed) {
      // Nothing to screen yet — a recruiter moves it on (or rescreens after adding a résumé).
      await recordStageResult(app.id, { stage_id: stage.id, outcome: 'pending', summary: 'No résumé to screen yet', at: nowIso() })
      return
    }
    const s = await screenCandidate(job, candidate)
    await (await atsApplications()).updateOne({ id: app.id, tenant_id: app.tenant_id }, { $set: { match: toMatch(s), updated_at: nowIso() } })
    await recordStageResult(app.id, {
      stage_id: stage.id,
      outcome: s.passed ? 'pass' : 'fail',
      score: s.score,
      summary: s.reasons.slice(0, 3).join('; '),
      at: nowIso(),
    })
  },
})
