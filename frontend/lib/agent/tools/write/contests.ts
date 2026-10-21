/**
 * Write tools for hosted contests (lib/contests): create a draft in any
 * format, publish it, release results. execute() calls the same
 * lib/contests/service functions as /api/contests*, so validation, tenant
 * scope, XP, certificates and notifications are identical.
 */
import { ToolInputError, type AgentCaller } from '@/lib/agent/contract'
import { CONTEST_FORMATS, type ContestDoc, type ContestFormat } from '@/lib/contests/types'
import { FORMATS } from '@/lib/contests/formats'
import { contestPhase, isValidTimeZone, sanitizeCommon, splitConfig } from '@/lib/contests/config'
import { createContest, findContest, previewContestRelease, releaseContestResults, setContestStatus } from '@/lib/contests/service'
import { writeTool } from '../define'
import { argsObject, optEnum, optInt, optObject, optString, reqDateArg, reqString, optDate } from '../args'
import { assertCanManage, friendlyServiceError, serviceUser, unwrap } from '../scope'
import { clip } from '../output'

const MIN = 60_000
const contestLink = (id: string) => `/dashboard/admin/contests/${id}`

async function loadContest(caller: AgentCaller, idOrSlug: string): Promise<ContestDoc> {
  const c = await findContest(idOrSlug)
  assertCanManage(caller, c, 'Contest')
  return c as ContestDoc
}

// ─── create_contest ──────────────────────────────────────────────────────────

export interface CreateContestArgs {
  title: string
  format: ContestFormat
  starts_at: string
  duration_minutes: number
  timezone?: string
  summary?: string
  description?: string
  mode?: 'solo' | 'team'
  team_max?: number
  visibility?: 'public' | 'unlisted'
  config?: Record<string, unknown>
}

const KEYS = ['title', 'format', 'starts_at', 'duration_minutes', 'ends_at', 'timezone', 'summary', 'description', 'mode', 'team_max', 'visibility', 'config']

function bodyOf(a: CreateContestArgs): Record<string, unknown> {
  return {
    title: a.title, format: a.format, summary: a.summary, description: a.description, visibility: a.visibility,
    schedule: { starts_at: a.starts_at, ends_at: new Date(Date.parse(a.starts_at) + a.duration_minutes * MIN).toISOString(), timezone: a.timezone || 'UTC' },
    participation: { ...(a.mode ? { mode: a.mode } : {}), ...(a.team_max ? { team_max: a.team_max } : {}) },
    config: a.config ?? {},
  }
}

export const createContestTool = writeTool<CreateContestArgs>({
  name: 'create_contest',
  risk: 'create',
  description:
    `Create a hosted contest as a DRAFT in one of these formats: ${CONTEST_FORMATS.join(', ')}. ` +
    'Give title, format, start time and duration (or ends_at); optionally solo/team, time zone and the format `config` ' +
    '(e.g. { tasks: [...] } with hidden tests, CTF flags, eval cases). Missing setup is listed in the preview and can be finished in the admin editor before publishing.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', maxLength: 120 },
      format: { type: 'string', enum: [...CONTEST_FORMATS] },
      starts_at: { type: 'string', description: 'ISO date/time.' },
      duration_minutes: { type: 'integer', minimum: 15, maximum: 86400 },
      ends_at: { type: 'string', description: 'Alternative to duration_minutes.' },
      timezone: { type: 'string', description: 'IANA zone for display, e.g. Asia/Kolkata.' },
      summary: { type: 'string', maxLength: 240 },
      description: { type: 'string', maxLength: 20000 },
      mode: { type: 'string', enum: ['solo', 'team'] },
      team_max: { type: 'integer', minimum: 1, maximum: 20 },
      visibility: { type: 'string', enum: ['public', 'unlisted'] },
      config: { type: 'object', description: 'Format settings; tasks under `tasks`.' },
    },
    required: ['title', 'format', 'starts_at'],
  },
  parse(raw) {
    const r = argsObject(raw, KEYS)
    const format = optEnum(r, 'format', CONTEST_FORMATS)
    if (!format) throw new ToolInputError(`\`format\` is required: one of ${CONTEST_FORMATS.join(', ')}.`)
    const starts = reqDateArg(r, 'starts_at')
    const ends = optDate(r, 'ends_at')
    let duration = optInt(r, 'duration_minutes', 15, 86400)
    if (ends) {
      duration = Math.round((Date.parse(ends) - Date.parse(starts)) / MIN)
      if (duration < 15) throw new ToolInputError('`ends_at` must be at least 15 minutes after `starts_at`.')
    }
    const a: CreateContestArgs = { title: reqString(r, 'title', { min: 3, max: 120 }), format, starts_at: starts, duration_minutes: duration ?? 180 }
    const tz = optString(r, 'timezone', { max: 64 })
    if (tz) {
      if (!isValidTimeZone(tz)) throw new ToolInputError(`Unknown time zone "${tz}".`)
      a.timezone = tz
    }
    const summary = optString(r, 'summary', { max: 240 })
    if (summary) a.summary = summary
    const description = optString(r, 'description', { max: 20000 })
    if (description) a.description = description
    const mode = optEnum(r, 'mode', ['solo', 'team'] as const)
    if (mode) a.mode = mode
    const tm = optInt(r, 'team_max', 1, 20)
    if (tm) a.team_max = tm
    const vis = optEnum(r, 'visibility', ['public', 'unlisted'] as const)
    if (vis) a.visibility = vis
    const config = optObject(r, 'config')
    if (config) {
      if (JSON.stringify(config).length > 400_000) throw new ToolInputError('`config` is too large.')
      a.config = config
    }
    return a
  },
  async propose(a, ctx) {
    if (ctx.caller.role === 'tenant_admin' && !ctx.caller.tenantId) throw new ToolInputError('Your account is not linked to an organisation.')
    const body = bodyOf(a)
    const common = sanitizeCommon(body, a.format)
    if (!common.ok) throw new ToolInputError(common.error)
    // Dry run of the format config (no writes) so the preview lists what's missing.
    const split = splitConfig(a.format, a.config ?? {}, null, () => 'preview')
    const meta = FORMATS[a.format]
    const warnings = [...split.errors.slice(0, 8)]
    if (Date.parse(a.starts_at) < Date.now()) warnings.push('The start time is in the past.')
    return {
      title: `Create ${meta.label.toLowerCase()} “${clip(a.title, 80)}” (draft)`,
      preview: {
        fields: {
          Title: a.title, Format: meta.label, Entries: common.value.participation.mode === 'team' ? `Teams up to ${common.value.participation.team_max}` : 'Solo',
          Visibility: common.value.visibility, 'Time zone': common.value.schedule.timezone, Status: 'Draft',
          ...(meta.task ? { [meta.task.plural]: split.config.tasks.length } : {}),
        },
        timeline: [{ label: 'Starts', at: common.value.schedule.starts_at }, { label: 'Ends', at: common.value.schedule.ends_at }],
        warnings,
        notes: ['Hidden tests, flags and labels are stored apart from the contest and never shown to entrants.', 'Publish it with publish_contest once the setup is complete.'],
      },
    }
  },
  async execute(a, ctx) {
    const r = await createContest(serviceUser(ctx.caller), bodyOf(a))
    if (!r.ok) return { ok: false, message: friendlyServiceError(r) }
    const left = r.data.config_errors.length
    return {
      ok: true,
      message: `Created draft “${r.data.title}” (${FORMATS[r.data.format].label}).${left ? ` ${left} setup item${left === 1 ? '' : 's'} left before it can be published.` : ' Ready to publish.'}`,
      link: contestLink(r.data.id),
      data: { id: r.data.id, slug: r.data.slug, status: r.data.status, setup_left: r.data.config_errors.slice(0, 5) },
    }
  },
})

// ─── publish_contest ─────────────────────────────────────────────────────────

export const publishContestTool = writeTool<{ contest_id: string }>({
  name: 'publish_contest',
  risk: 'publish',
  description: 'Publish a draft contest: it appears on /contests and in the events feed (when public) and registration opens on its schedule.',
  parameters: { type: 'object', properties: { contest_id: { type: 'string', description: 'Contest id or slug.' } }, required: ['contest_id'] },
  parse(raw) {
    return { contest_id: reqString(argsObject(raw, ['contest_id']), 'contest_id', { max: 80 }) }
  },
  async propose(a, ctx) {
    const c = await loadContest(ctx.caller, a.contest_id)
    if (c.status !== 'draft') throw new ToolInputError(`This contest is already ${c.status}.`)
    if (c.config_errors.length) throw new ToolInputError(`Finish the setup first: ${c.config_errors.slice(0, 5).join(' ')}`)
    if (Date.parse(c.schedule.ends_at) <= Date.now()) throw new ToolInputError('The end date has passed. Move the dates first.')
    return {
      title: `Publish “${clip(c.title, 80)}”`,
      preview: {
        fields: { Format: FORMATS[c.format].label, Visibility: c.visibility, Entries: c.participation.mode === 'team' ? `Teams up to ${c.participation.team_max}` : 'Solo' },
        timeline: [{ label: 'Registration opens', at: c.schedule.registration_opens_at || 'On publish' }, { label: 'Starts', at: c.schedule.starts_at }, { label: 'Ends', at: c.schedule.ends_at }],
        notes: c.visibility === 'public' ? ['Listed on /contests and in the events feed.'] : ['Unlisted: only people with the link can find it.'],
      },
    }
  },
  async execute(a, ctx) {
    const c = await loadContest(ctx.caller, a.contest_id)
    const r = await setContestStatus(serviceUser(ctx.caller), c.id, 'publish')
    if (!r.ok) return { ok: false, message: friendlyServiceError(r) }
    return { ok: true, message: `Published “${c.title}”.`, link: `/contests/${c.slug}`, data: { id: c.id, status: r.data.status, phase: contestPhase(r.data) } }
  },
})

// ─── release_contest_results ─────────────────────────────────────────────────

export const releaseContestResultsTool = writeTool<{ contest_id: string }>({
  name: 'release_contest_results',
  risk: 'publish',
  description: 'Release a contest’s results: freezes the final board (datathons use the private split), awards XP, issues certificates and notifies every entrant. Cannot be undone.',
  parameters: { type: 'object', properties: { contest_id: { type: 'string', description: 'Contest id or slug.' } }, required: ['contest_id'] },
  parse(raw) {
    return { contest_id: reqString(argsObject(raw, ['contest_id']), 'contest_id', { max: 80 }) }
  },
  async propose(a, ctx) {
    const c = await loadContest(ctx.caller, a.contest_id)
    const p = unwrap(await previewContestRelease(serviceUser(ctx.caller), c.id))
    if (p.already_released) throw new ToolInputError('Results are already released.')
    if (c.status === 'draft') throw new ToolInputError('Publish the contest before releasing results.')
    return {
      title: `Release results for “${clip(c.title, 80)}”`,
      preview: {
        fields: { Entries: p.entries, Ranked: p.ranked, 'Waiting for judges': p.pending_review, 'Contest ended': p.ended ? 'Yes' : 'No' },
        warnings: p.reasons,
        notes: ['Every entrant is notified in-app and by email; certificates follow the contest’s certificate rule. This cannot be undone.'],
      },
    }
  },
  async execute(a, ctx) {
    const c = await loadContest(ctx.caller, a.contest_id)
    // The admin confirmed the preview (including its warnings).
    const r = await releaseContestResults(serviceUser(ctx.caller), c.id, { force: true })
    if (!r.ok) return { ok: false, message: friendlyServiceError(r) }
    const d = r.data as Record<string, unknown>
    return { ok: true, message: `Released results: ${d.ranked} ranked, ${d.certificates_issued} certificates, ${d.notified} notified.`, link: contestLink(c.id), data: d }
  },
})
