/**
 * Built-in automations for organisation integrations (registered in
 * lib/automation/system/registry.ts):
 *  - hiring alerts to Slack / Teams (new application, test completed);
 *    live-drive status changes are sent from lib/live-drives/service.ts
 *  - grade passback when a result is released: LTI AGS (Moodle …) and
 *    Google Classroom.
 */
import type { SystemAutomation } from '@/lib/automation/system/types'
import type { AutomationEventDoc } from '@/lib/automation/events'

type Doc = Record<string, unknown>

async function passback(ev: AutomationEventDoc) {
  const p = ev.payload as Doc
  const subId = typeof p.submission_id === 'string' ? p.submission_id : null
  const examId = typeof p.exam_id === 'string' ? p.exam_id : null
  if (!subId || !examId) return
  const { getMongoDb } = await import('@/lib/mongodb')
  const sub = await (await getMongoDb()).collection('exam_submissions').findOne({ id: subId }, { projection: { _id: 0, user_id: 1, email: 1, score: 1, max_score: 1, score_released: 1 } })
  if (!sub || sub.score_released !== true || !(Number(sub.max_score) > 0)) return
  const pct = Math.max(0, Math.min(100, (Number(sub.score) / Number(sub.max_score)) * 100))
  const [{ passbackGrade }, { syncAfterRelease }] = await Promise.all([import('./lti/service'), import('./classroom')])
  if (typeof sub.user_id === 'string') await passbackGrade(examId, sub.user_id, pct)
  await syncAfterRelease(examId, typeof sub.email === 'string' ? sub.email : null)
}

export const INTEGRATION_AUTOMATIONS: readonly SystemAutomation[] = [
  {
    id: 'integrations-hiring-chat',
    title: 'Hiring alerts to Slack and Teams',
    description: 'Posts new applications and completed tests to the Slack / Microsoft Teams channels each organisation connected (Admin → Connected apps).',
    group: 'Hiring',
    refs: ['W10B-INT'],
    defaultOn: true,
    events: [
      {
        type: 'candidate.applied',
        handle: async (ev) => {
          const { notifyHiringChat } = await import('./chat-send')
          await notifyHiringChat(ev.tenant_id, 'application', ev.payload as Doc, `application:${String((ev.payload as Doc).application_id || ev.id)}`)
        },
      },
      {
        type: 'exam.submitted',
        handle: async (ev) => {
          const { notifyHiringChat } = await import('./chat-send')
          await notifyHiringChat(ev.tenant_id, 'test_completed', ev.payload as Doc, `test:${String((ev.payload as Doc).submission_id || ev.id)}`)
        },
      },
    ],
  },
  {
    id: 'integrations-grade-passback',
    title: 'Send released results to LMS gradebooks',
    description: 'When a test result is released, sends it to Moodle / LTI 1.3 gradebooks (AGS) and to linked Google Classroom assignments.',
    group: 'Assessments',
    refs: ['W10B-INT'],
    defaultOn: true,
    events: [
      { type: 'score.released', handle: passback },
      { type: 'exam.graded', handle: passback },
    ],
  },
]
