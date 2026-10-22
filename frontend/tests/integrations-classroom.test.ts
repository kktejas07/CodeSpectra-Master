/** Google Classroom grade mapping + Slack / Teams message builders (lib/integrations). */
import { describe, expect, it } from 'vitest'
import { bestPercentByEmail, classroomAuthUrl, courseWorkBody, dueFields, gradeFor, gradePatches } from '@/lib/integrations/classroom-pure'
import { chatMessage, cleanEvents, maskSecret, slackEscape, slackPayload, teamsPayload, validateSlack, validateTeams } from '@/lib/integrations/chat'

describe('Classroom grades', () => {
  it('maps percent to points', () => {
    expect(gradeFor(83.33, 100)).toBe(83.33)
    expect(gradeFor(50, 20)).toBe(10)
    expect(gradeFor(120, 10)).toBe(10)
    expect(gradeFor(NaN, 10)).toBe(0)
  })
  it('keeps the best released result per email', () => {
    const m = bestPercentByEmail([
      { email: 'A@x.edu', score: 4, max_score: 10, score_released: true },
      { email: 'a@x.edu', score: 9, max_score: 10, score_released: true },
      { email: 'b@x.edu', score: 10, max_score: 10, score_released: false },
    ])
    expect(Object.fromEntries(m)).toEqual({ 'a@x.edu': 90 })
  })
  it('patches only students with a released result and a changed grade', () => {
    const p = gradePatches({
      submissions: [{ id: 's1', userId: 'g1' }, { id: 's2', userId: 'g2', assignedGrade: 45 }, { id: 's3', userId: 'g3' }],
      rosterEmails: new Map([['g1', 'a@x.edu'], ['g2', 'b@x.edu']]),
      percents: new Map([['a@x.edu', 90], ['b@x.edu', 90]]),
      maxPoints: 50,
    })
    expect(p).toEqual([{ submissionId: 's1', grade: 45 }])
  })
  it('builds course work with a link and a UTC due date', () => {
    expect(dueFields('2026-11-10T18:30:00.000Z')).toEqual({ dueDate: { year: 2026, month: 11, day: 10 }, dueTime: { hours: 18, minutes: 30 } })
    const b = courseWorkBody({ title: 'Test', description: 'd', url: 'https://cs.example/assessment/e1?link=t', maxPoints: 100, due: null })
    expect(b).toMatchObject({ workType: 'ASSIGNMENT', state: 'PUBLISHED', maxPoints: 100, materials: [{ link: { url: 'https://cs.example/assessment/e1?link=t' } }] })
    expect('dueDate' in b).toBe(false)
  })
  it('asks for offline access and the Classroom scopes', () => {
    const u = new URL(classroomAuthUrl({ client_id: 'id', client_secret: 's' }, 'https://cs.example/cb', 'st'))
    expect(u.searchParams.get('access_type')).toBe('offline')
    expect(u.searchParams.get('scope')).toContain('classroom.coursework.students')
    expect(u.searchParams.get('state')).toBe('st')
  })
})

describe('Slack / Teams', () => {
  it('builds a message per hiring event', () => {
    const m = chatMessage('application', { candidate_name: 'Asha <b>', job_title: 'Backend', source: 'apply_page', match_score: 78.4, candidate_id: 'c1' }, 'https://cs.example')
    expect(m.title).toBe('New application: Asha <b> for Backend')
    expect(m.url).toBe('https://cs.example/dashboard/hiring/candidates/c1')
    expect(m.lines).toContainEqual({ label: 'Match', value: '78%' })
    const s = slackPayload(m, 'C0123456789') as { channel: string; blocks: { text?: { text: string } }[] }
    expect(s.channel).toBe('C0123456789')
    expect(s.blocks[0].text!.text).toContain('Asha &lt;b&gt;')
    const tm = teamsPayload(chatMessage('test_completed', { exam_title: 'Java', email: 'a@x.io', score: 7, max_score: 10, has_pending_review: true, exam_id: 'e1' }, 'https://cs.example')) as { attachments: { content: { body: { facts?: { value: string }[] }[] } }[] }
    expect(tm.attachments[0].content.body[1].facts).toContainEqual({ title: 'Score', value: '7 / 10 (needs grading)' })
  })
  it('validates Slack and Teams connections', () => {
    expect(validateSlack({ webhook_url: 'https://hooks.slack.com/services/T/B/x' }).ok).toBe(true)
    expect(validateSlack({ webhook_url: 'https://evil.example/hook' }).ok).toBe(false)
    expect(validateSlack({ mode: 'bot', bot_token: 'xoxb-1234567890-abc', channel: 'C0123456' }).ok).toBe(true)
    expect(validateSlack({ mode: 'bot', bot_token: 'xoxp-user', channel: 'C0123456' }).ok).toBe(false)
    expect(validateTeams({ webhook_url: 'https://contoso.webhook.office.com/webhookb2/abc' }).ok).toBe(true)
    expect(validateTeams({ webhook_url: 'https://hooks.slack.com/services/T/B/x' }).ok).toBe(false)
  })
  it('cleans events, escapes Slack text, masks secrets', () => {
    expect(cleanEvents(['application', 'nope', 'application'])).toEqual(['application'])
    expect(cleanEvents(undefined)).toEqual(['application', 'test_completed', 'drive_status'])
    expect(slackEscape('a & <b>')).toBe('a &amp; &lt;b&gt;')
    expect(maskSecret('https://hooks.slack.com/services/T000/B000/XXXXsecret')).toBe('https://hooks.slac…cret')
  })
})
