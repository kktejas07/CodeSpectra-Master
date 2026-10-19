/**
 * Pipeline board helpers: filtering, sorting, optimistic moves, and the
 * "latest result" shown on a card. Pure — unit tested in tests/hiring-ui.test.ts.
 */
import type { AtsApplication, PipelineStage, StageResult } from '@/lib/ats/contract'
import type { BoardApplication, BoardResponse } from './types'
import { daysSince } from './labels'

export type BoardColumn = BoardResponse['stages'][number]

export interface BoardFilter {
  q?: string
  minScore?: number | null
  pendingOnly?: boolean
  status?: AtsApplication['status'] | 'all'
}

export function matchesFilter(app: BoardApplication, f: BoardFilter): boolean {
  if (f.status && f.status !== 'all' && app.status !== f.status) return false
  if (f.pendingOnly && !app.pending_move) return false
  if (f.minScore != null && (app.match?.score ?? -1) < f.minScore) return false
  const q = f.q?.trim().toLowerCase()
  if (q) {
    const c = app.candidate
    if (!c) return false
    const hay = [c.name, c.email, c.phone, c.location, ...(c.tags ?? []), ...(c.skills ?? []), ...(c.titles ?? [])].filter(Boolean).join(' ').toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

/** Pending approvals first, then highest match, then longest waiting. */
export function sortApplications(apps: BoardApplication[]): BoardApplication[] {
  return apps.slice().sort((a, b) => {
    const p = Number(!!b.pending_move) - Number(!!a.pending_move)
    if (p) return p
    const s = (b.match?.score ?? -1) - (a.match?.score ?? -1)
    if (s) return s
    return new Date(a.stage_entered_at).getTime() - new Date(b.stage_entered_at).getTime()
  })
}

export function filterBoard(cols: BoardColumn[], f: BoardFilter): BoardColumn[] {
  return cols.map((c) => ({ ...c, applications: sortApplications(c.applications.filter((a) => matchesFilter(a, f))) }))
}

/**
 * Group a flat application list into the job's stage columns. Applications
 * whose stage no longer exists land in the first column so nothing disappears.
 */
export function groupByStage(stages: PipelineStage[], apps: BoardApplication[]): BoardColumn[] {
  const cols: BoardColumn[] = stages.map((stage) => ({ stage, applications: [] }))
  const byId = new Map(cols.map((c) => [c.stage.id, c]))
  for (const a of apps) (byId.get(a.stage_id) ?? cols[0])?.applications.push(a)
  return cols
}

/** Optimistically move one application between columns (returns new columns). */
export function moveOnBoard(cols: BoardColumn[], appId: string, toStageId: string, now = new Date().toISOString()): BoardColumn[] {
  let moving: BoardApplication | undefined
  const without = cols.map((c) => {
    const i = c.applications.findIndex((a) => a.id === appId)
    if (i < 0) return c
    moving = c.applications[i]
    return { ...c, applications: c.applications.filter((a) => a.id !== appId) }
  })
  if (!moving || moving.stage_id === toStageId) return cols
  const target = without.find((c) => c.stage.id === toStageId)
  if (!target) return cols
  const terminal = target.stage.type === 'rejected' ? 'rejected' : target.stage.type === 'hired' ? 'hired' : moving.status
  const moved: BoardApplication = { ...moving, stage_id: toStageId, stage_entered_at: now, pending_move: null, status: terminal, last_result: null }
  return without.map((c) => (c.stage.id === toStageId ? { ...c, applications: [moved, ...c.applications] } : c))
}

/** The most recent non-skipped result: the board's `last_result`, else from `results` (current stage first). */
export function latestResult(app: { stage_id: string; last_result?: StageResult | null; results?: StageResult[] }): StageResult | null {
  if (app.last_result !== undefined) return app.last_result && app.last_result.outcome !== 'skipped' ? app.last_result : null
  const rs = (app.results ?? []).filter((r) => r.outcome !== 'skipped')
  if (!rs.length) return null
  const sorted = rs.slice().sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return sorted.find((r) => r.stage_id === app.stage_id) ?? sorted[0]
}

/** Is the application overdue against its stage SLA? */
export function isOverdue(app: Pick<AtsApplication, 'stage_entered_at' | 'status'>, stage: Pick<PipelineStage, 'sla_days'>, now = Date.now()): boolean {
  if (app.status !== 'active' || !stage.sla_days) return false
  return daysSince(app.stage_entered_at, now) > stage.sla_days
}

export function boardTotals(cols: BoardColumn[]) {
  let total = 0
  let pending = 0
  for (const c of cols) {
    total += c.applications.length
    pending += c.applications.filter((a) => a.pending_move).length
  }
  return { total, pending }
}

/** Minimal CSV parser (quoted fields, commas, CRLF) for the import preview. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((c) => c.trim())) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim())) rows.push(row)
  return rows.map((r) => r.map((c) => c.trim()))
}

export interface CsvCandidate { name: string; email: string; phone: string; country: string }

/**
 * Preview of a candidate CSV (header row; columns name, email, phone,
 * country, resume_url — matched loosely). The server parses the CSV again.
 */
export function csvToCandidates(rows: string[][]): { valid: CsvCandidate[]; invalid: number } {
  if (rows.length < 2) return { valid: [], invalid: 0 }
  const head = rows[0].map((h) => h.toLowerCase())
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)))
  const iName = col('name')
  const iEmail = col('email', 'e-mail')
  const iPhone = col('phone', 'mobile', 'whatsapp')
  const iCountry = col('country')
  const valid: CsvCandidate[] = []
  let invalid = 0
  for (const r of rows.slice(1)) {
    const email = iEmail >= 0 ? r[iEmail] ?? '' : ''
    const name = iName >= 0 ? r[iName] ?? '' : ''
    const phone = iPhone >= 0 ? r[iPhone] ?? '' : ''
    const okEmail = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (!name || !okEmail || (!email && !phone)) { invalid++; continue }
    valid.push({ name, email, phone, country: iCountry >= 0 ? r[iCountry] ?? '' : '' })
  }
  return { valid, invalid }
}
