/**
 * get_integrity_report — integrity summary of one test or contest
 * (lib/integrity): checks switched on, lowest trust scores with their review
 * marks, similar-code clusters and AI-written signals. Staff of the record's
 * organisation only. Signals, never verdicts — the tool says so in its output.
 */
import { readTool } from '../define'
import { argsObject, optEnum, optInt, reqId } from '../args'
import { assertCanManage } from '../scope'
import { clip } from '../output'
import { enabledSignals } from '@/lib/integrity/types'

export const getIntegrityReportTool = readTool({
  name: 'get_integrity_report',
  description: 'Integrity summary for one test or contest: which candidate checks are on, attempts with the lowest trust scores (and reviewer marks), similar-code clusters per question and AI-written-code signals. These are signals for a human reviewer, never proof or a verdict.',
  parameters: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['test', 'contest'], description: 'Default test.' },
      id: { type: 'string', description: 'Test id, or contest id / slug.' },
      limit: { type: 'integer', minimum: 1, maximum: 25, description: 'Rows per section (default 10).' },
    },
    required: ['id'],
  },
  parse(raw) {
    const r = argsObject(raw, ['kind', 'id', 'limit'])
    return { kind: optEnum(r, 'kind', ['test', 'contest'] as const) ?? 'test', id: reqId(r, 'id'), limit: optInt(r, 'limit', 1, 25) ?? 10 }
  },
  async run(a, ctx) {
    const { loadTarget, getSettings, listAttempts } = await import('@/lib/integrity/service')
    const { getReport } = await import('@/lib/integrity/similarity-job')
    const kind = a.kind === 'contest' ? 'contest' : 'exam'
    const t = await loadTarget(kind, a.id)
    assertCanManage(ctx.caller, t ? { tenant_id: t.tenant_id } : null, a.kind === 'contest' ? 'Contest' : 'Test')
    const target = t!
    const [settings, attempts, report] = await Promise.all([getSettings(target.kind, target.id), listAttempts(target, { limit: 500 }), getReport(target)])
    const link = kind === 'exam' ? `/dashboard/admin/assessments/${target.id}/integrity` : `/dashboard/admin/contests/${target.id}/integrity`
    return {
      data: {
        note: 'Signals for a human reviewer. Nothing here fails a candidate; do not present any of it as proof.',
        target: { kind: a.kind, id: target.id, title: clip(target.title, 120), link },
        checks: { enabled: settings.enabled, signals: enabledSignals(settings), snapshots: settings.snapshots_on_violation, similarity: settings.similarity.enabled, ai_signals: settings.ai_signals.enabled },
        attempts: {
          total: attempts.length,
          many_signals: attempts.filter((x) => x.trust.band === 'flag').length,
          worth_a_look: attempts.filter((x) => x.trust.band === 'review').length,
          unreviewed_with_signals: attempts.filter((x) => x.trust.band !== 'clear' && x.review.status === 'unreviewed').length,
          lowest: attempts.slice(0, a.limit).map((x) => ({
            name: clip(x.name, 60), trust_score: x.trust.score, band: x.trust.band, incidents: x.trust.incidents, review: x.review.status,
            top_signals: Object.entries(x.trust.by_type).filter(([, v]) => v.penalty > 0).sort((p, q) => q[1].penalty - p[1].penalty).slice(0, 3).map(([k, v]) => `${k} ×${v.count}`),
          })),
        },
        similarity: report ? {
          status: report.status, checked_at: report.finished_at,
          questions: report.questions.filter((q) => q.clusters.length).slice(0, a.limit).map((q) => ({
            question: clip(q.title, 80), answers: q.submissions,
            clusters: q.clusters.slice(0, 5).map((c) => ({ members: c.members.map((m) => clip(m.name, 40)), max_similarity: c.max_score, review: c.review.status })),
          })),
        } : { status: 'not_run' },
        ai_signals: (report?.ai ?? []).slice(0, a.limit).map((r) => ({ name: clip(r.name, 60), question_id: r.question_id, level: r.level, signals: r.signals.map((s) => s.label) })),
      },
    }
  },
})
