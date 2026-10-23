/**
 * Hosted contests (all formats, lib/contests) as a knowledge source (RAG-022).
 *
 * Indexed: title, summary, description, format, dates, team rules, prizes, leaderboard and
 * certificate policy, judging rubric names, and task titles / points only (like the public
 * teaser before the start — briefs, datasets, flags, eval sets and hidden tests never).
 *
 * Visibility: a published, public, platform contest (no organisation) is public (copilot +
 * the public "Ask" box); unlisted or draft platform contests are platform-admin only;
 * organisation contests are tenant scoped.
 */
import type { Db } from 'mongodb'
import { FORMATS } from '@/lib/contests/formats'
import type { ContestFormat } from '@/lib/contests/types'
import type { ExtractedSource } from '../types'
import { arr, fields, isoDate, str, tenantOf, type Doc } from './util'

export function contestVisibility(c: Doc): ExtractedSource['visibility'] {
  if (tenantOf(c)) return 'tenant'
  return c.status !== 'draft' && c.visibility === 'public' ? 'public' : 'platform_admin'
}

export function contestSource(c: Doc): ExtractedSource | null {
  const id = str(c.id, 200)
  const slug = str(c.slug, 200)
  if (!id || !slug) return null
  const fmt = FORMATS[str(c.format, 40) as ContestFormat]
  const schedule = (c.schedule && typeof c.schedule === 'object' ? c.schedule : {}) as Doc
  const part = (c.participation && typeof c.participation === 'object' ? c.participation : {}) as Doc
  const board = (c.leaderboard && typeof c.leaderboard === 'object' ? c.leaderboard : {}) as Doc
  const certs = (c.certificates && typeof c.certificates === 'object' ? c.certificates : {}) as Doc
  const judging = (c.judging && typeof c.judging === 'object' ? c.judging : {}) as Doc
  const config = (c.config && typeof c.config === 'object' ? c.config : {}) as Doc
  const tasks = arr(config.tasks)
  const rubric = arr(judging.rubric)
  const team = part.mode === 'team' ? `team (${Number(part.team_min) || 1}–${Number(part.team_max) || 1} members)` : 'solo'
  const text = [
    fields([
      ['Format', fmt?.label || c.format], ['Status', c.status],
      ['Registration opens', isoDate(schedule.registration_opens_at)], ['Registration closes', isoDate(schedule.registration_closes_at)],
      ['Starts', isoDate(schedule.starts_at)], ['Ends', isoDate(schedule.ends_at)], ['Time zone', schedule.timezone],
      ['Participation', team], ['Max entries', Number(part.max_entries) > 0 ? part.max_entries : ''],
      ['Prizes', c.prize_text], ['Leaderboard', board.visibility], ['Certificates', certs.audience === 'none' ? 'none' : certs.audience === 'top_n' ? `top ${Number(certs.top_n) || 3} only` : certs.audience === 'all' ? 'every participant' : ''],
      ['Results released', c.results_released === true ? 'yes' : 'no'],
    ]),
    str(c.summary, 500),
    fmt?.description ? `## How this format works\n${fmt.description}` : '',
    str(c.description, 8000),
    tasks.length ? `## ${fmt?.task.plural || 'Tasks'}\n${tasks.slice(0, 60).map((t) => `- ${str(t.title, 200) || 'Task'}${t.category ? ` (${str(t.category, 60)})` : ''}${Number(t.points) ? `, ${Number(t.points)} points` : ''}`).join('\n')}` : '',
    rubric.length ? `## Judging rubric\n${rubric.slice(0, 20).map((r) => `- ${str(r.name ?? r.label, 120)}${Number(r.weight) ? `: ${Number(r.weight)}%` : ''}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
  return {
    type: 'contest',
    source_id: id,
    tenant_id: tenantOf(c),
    visibility: contestVisibility(c),
    title: str(c.title, 200) || 'Contest',
    url: `/contests/${encodeURIComponent(slug)}`,
    text,
    metadata: { slug, status: str(c.status, 20), format: str(c.format, 40) },
  }
}

export async function loadContest(db: Db, id: string): Promise<ExtractedSource | null> {
  const c = await db.collection('contests').findOne({ id }, { projection: { _id: 0 } })
  return c ? contestSource(c as Doc) : null
}
