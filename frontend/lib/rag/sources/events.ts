/**
 * Event sources: hackathons and codeathons — details, problems (titles,
 * difficulty, points; never hidden tests or solutions), dates, rules, rubric.
 * Platform events (no organisation) that are not drafts are public; drafts are
 * superadmin-only; organisation events are tenant scoped.
 */
import type { Db } from 'mongodb'
import { publicCodeathonProblem } from '@/lib/exam-access'
import type { ExtractedSource } from '../types'
import { arr, fields, isoDate, str, strList, tenantOf, type Doc } from './util'

function eventVisibility(doc: Doc, draft: boolean): ExtractedSource['visibility'] {
  if (tenantOf(doc)) return 'tenant'
  return draft ? 'platform_admin' : 'public'
}

export function hackathonSource(h: Doc): ExtractedSource | null {
  const id = str(h.id, 200)
  if (!id) return null
  const features = (h.features && typeof h.features === 'object' ? h.features : {}) as Doc
  const scoring = (h.scoring && typeof h.scoring === 'object' ? h.scoring : {}) as Doc
  const tasks = arr(h.tasks).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
  const rules = arr(h.rules)
  const rubric = features.judging_rubrics === true ? arr(features.rubric_criteria) : []
  const tracks = arr(features.sponsor_tracks)
  const text = [
    fields([
      ['Status', h.status], ['Type', h.event_type === 'speed_contest' ? 'speed contest' : 'hackathon'],
      ['Starts', isoDate(h.starts_at)], ['Ends', isoDate(h.ends_at)], ['Duration (minutes)', h.timeout_minutes],
      ['Teams allowed', h.num_teams], ['Max per team', h.max_per_team], ['Solve limit', h.solve_limit],
      ['Grace period (minutes)', h.grace_period_minutes], ['Results released', h.results_released === true ? 'yes' : 'no'],
      ['Points per problem', scoring.points_per_problem], ['Penalty per attempt', scoring.penalty_per_attempt],
      ['Leaderboard', features.leaderboard_visibility], ['Certificates', features.certificates === false ? 'off' : 'on'],
    ]),
    str(h.description, 8000),
    tasks.length ? `## Problems\n${tasks.map((t) => `- ${str(t.problem_title, 200) || str(t.problem_slug, 200)} (${str(t.difficulty, 20) || 'n/a'}, ${Number(t.points) || 0} points${t.required ? ', required' : ''})`).join('\n')}` : '',
    rules.length ? `## Rules\n${rules.map((r) => `### ${str(r.title, 200) || str(r.type, 40) || 'Rule'}\n${str(r.description, 3000)}`).join('\n\n')}` : '',
    rubric.length ? `## Judging rubric\n${rubric.map((c) => `- ${str(c.name, 120)}: ${Number(c.weight) || 0}%`).join('\n')}` : '',
    tracks.length ? `## Sponsor tracks\n${tracks.map((t) => `- ${str(t.name, 120)}: ${str(t.prize, 120)}${t.description ? ` — ${str(t.description, 500)}` : ''}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
  return {
    type: 'hackathon',
    source_id: id,
    tenant_id: tenantOf(h),
    visibility: eventVisibility(h, h.status === 'draft'),
    title: str(h.name, 200) || 'Hackathon',
    url: `/dashboard/admin/hackathons/${encodeURIComponent(id)}`,
    text,
    metadata: { slug: str(h.slug, 200), status: str(h.status, 20) },
  }
}

export function codeathonSource(c: Doc): ExtractedSource | null {
  const id = str(c.id, 200)
  if (!id) return null
  const problems = arr(c.problems).map(publicCodeathonProblem)
  const rules = typeof c.rules === 'string' ? str(c.rules, 6000) : arr(c.rules).map((r) => `- ${str(r.title ?? r.text, 300)}`).join('\n')
  const text = [
    fields([
      ['Status', c.status], ['Difficulty', c.difficulty], ['Topics', c.topics],
      ['Starts', isoDate(c.startDate)], ['Ends', isoDate(c.endDate)],
      ['Format', c.event_type === 'team' ? `team (${str(c.team_size_min, 3) || '1'}–${str(c.team_size_max, 3) || '1'} members)` : 'individual'],
      ['Max participants', c.maxParticipants], ['Prize pool', c.prizePool],
      ['Problem visibility', c.problem_visibility], ['Results released', c.results_released === true ? 'yes' : 'no'],
    ]),
    str(c.description, 8000),
    problems.length ? `## Problems\n${problems.map((p) => `- ${str(p.title ?? p.name, 200) || 'Problem'}${p.difficulty ? ` (${str(p.difficulty, 20)})` : ''}${p.points ? `, ${Number(p.points) || 0} points` : ''}${strList(p.topics).length ? ` — ${strList(p.topics).join(', ')}` : ''}`).join('\n')}` : '',
    rules ? `## Rules\n${rules}` : '',
  ].filter(Boolean).join('\n\n')
  return {
    type: 'codeathon',
    source_id: id,
    tenant_id: tenantOf(c),
    visibility: eventVisibility(c, c.status === 'draft'),
    title: str(c.title, 200) || 'Codeathon',
    url: `/dashboard/codeathons/${encodeURIComponent(id)}`,
    text,
    metadata: { status: str(c.status, 20) },
  }
}

export async function loadHackathon(db: Db, id: string): Promise<ExtractedSource | null> {
  const h = await db.collection('hackathons').findOne({ id })
  return h ? hackathonSource(h as Doc) : null
}

export async function loadCodeathon(db: Db, id: string): Promise<ExtractedSource | null> {
  const c = await db.collection('codeathons').findOne({ id })
  return c ? codeathonSource(c as Doc) : null
}

export async function listEventIds(db: Db, collection: 'hackathons' | 'codeathons', limit: number, tenantId?: string | null): Promise<string[]> {
  const rows = await db.collection(collection).find(tenantId ? { tenant_id: tenantId } : {}, { projection: { _id: 0, id: 1 } }).limit(limit).toArray()
  return rows.map((r) => str(r.id, 200)).filter(Boolean)
}
