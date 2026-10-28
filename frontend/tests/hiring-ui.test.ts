/**
 * Pure helpers behind the recruiter UI (components/hiring/lib): pipeline
 * builder reducer + validation, board filtering / optimistic moves, CSV
 * preview and the application timeline.
 */
import { describe, expect, it } from 'vitest'
import {
  PIPELINE_TEMPLATES, buildPipeline, makeStage, movableRange, pipelineReducer, stageIdFor, validatePipeline,
} from '@/components/hiring/lib/pipeline-builder'
import { csvToCandidates, filterBoard, groupByStage, isOverdue, latestResult, moveOnBoard, parseCsv, sortApplications } from '@/components/hiring/lib/board'
import { buildTimeline } from '@/components/hiring/lib/timeline'
import { daysSince, formatSalary, scoreTone } from '@/components/hiring/lib/labels'
import type { BoardApplication } from '@/components/hiring/lib/types'

const base = () => buildPipeline(['applied', 'screening', 'assessment', 'offer', 'hired', 'rejected'])

function app(id: string, stage: string, extra: Partial<BoardApplication> = {}): BoardApplication {
  return {
    id,
    stage_id: stage,
    stage_entered_at: '2026-10-01T00:00:00.000Z',
    status: 'active',
    source: 'apply_page',
    match: null,
    pending_move: null,
    created_at: '2026-10-01T00:00:00.000Z',
    last_result: null,
    candidate: { id: `c_${id}`, name: `Person ${id}`, email: `${id}@x.dev`, phone: null, skills: [], titles: [], tags: [] },
    ...extra,
  }
}

describe('pipeline builder', () => {
  it('gives unique, server-valid stage ids', () => {
    const p = base()
    expect(new Set(p.map((s) => s.id)).size).toBe(p.length)
    expect(stageIdFor('assessment', p)).toBe('s_assessment_2')
    for (const s of p) expect(s.id).toMatch(/^[A-Za-z0-9_-]{1,40}$/)
  })

  it('adds new stages before hired/rejected and never adds fixed types', () => {
    let p = base()
    p = pipelineReducer(p, { type: 'add', stageType: 'bot_screen' })
    expect(p.map((s) => s.type).slice(-3)).toEqual(['bot_screen', 'hired', 'rejected'])
    expect(pipelineReducer(p, { type: 'add', stageType: 'hired' })).toBe(p)
  })

  it('moves only within the movable range and keeps fixed stages in place', () => {
    const p = base()
    const [lo, hi] = movableRange(p)
    expect([lo, hi]).toEqual([1, 3])
    const moved = pipelineReducer(p, { type: 'move', id: 's_offer', to: 0 })
    expect(moved[0].type).toBe('applied')
    expect(moved[1].id).toBe('s_offer')
    expect(pipelineReducer(p, { type: 'move', id: 's_hired', to: 1 })).toBe(p)
    expect(pipelineReducer(p, { type: 'shift', id: 's_offer', delta: 1 })).toBe(p)
    expect(pipelineReducer(p, { type: 'shift', id: 's_assessment', delta: -1 }).map((s) => s.id).slice(1, 3)).toEqual(['s_assessment', 's_screening'])
  })

  it('removes, renames and patches config without changing id or type', () => {
    let p = base()
    p = pipelineReducer(p, { type: 'remove', id: 's_applied' })
    expect(p[0].type).toBe('applied')
    p = pipelineReducer(p, { type: 'remove', id: 's_screening' })
    expect(p.some((s) => s.id === 's_screening')).toBe(false)
    p = pipelineReducer(p, { type: 'update', id: 's_assessment', patch: { name: 'Coding test', id: 'hack' as string, type: 'offer' } })
    const a = p.find((s) => s.id === 's_assessment')!
    expect(a.name).toBe('Coding test')
    expect(a.type).toBe('assessment')
    p = pipelineReducer(p, { type: 'config', id: 's_assessment', patch: { exam_id: 'exam_1' } })
    expect(p.find((s) => s.id === 's_assessment')!.config).toMatchObject({ kind: 'assessment', exam_id: 'exam_1', pass_score: 60 })
  })

  it('validates what the server will reject', () => {
    const p = base()
    expect(validatePipeline(p)).toContain('"Assessment": pick a test.')
    const fixed = pipelineReducer(p, { type: 'config', id: 's_assessment', patch: { exam_id: 'e1' } })
    expect(validatePipeline(fixed)).toEqual([])
    expect(validatePipeline(fixed.filter((s) => s.type !== 'hired'))).toContain('The pipeline needs a "Hired" stage.')
    const f2f = [...fixed.slice(0, 2), makeStage('f2f_interview', fixed), ...fixed.slice(2)]
    expect(validatePipeline(f2f).some((e) => e.includes('location'))).toBe(true)
  })

  it('templates start with applied and end with hired then rejected', () => {
    for (const t of PIPELINE_TEMPLATES) {
      const p = t.build()
      expect(p[0].type).toBe('applied')
      expect(p.slice(-2).map((s) => s.type)).toEqual(['hired', 'rejected'])
    }
    expect(PIPELINE_TEMPLATES.find((t) => t.id === 'staffing')!.build().some((s) => s.type === 'client_review')).toBe(true)
  })
})

describe('board helpers', () => {
  const stages = base()

  it('groups apps by stage and keeps orphans visible', () => {
    const cols = groupByStage(stages, [app('a', 's_screening'), app('b', 'gone')])
    expect(cols.find((c) => c.stage.id === 's_screening')!.applications).toHaveLength(1)
    expect(cols[0].applications.map((a) => a.id)).toEqual(['b'])
  })

  it('filters by text, score and pending, and sorts pending then score', () => {
    const apps = [
      app('a', 's_screening', { match: { score: 40, breakdown: {}, missing_must: [], reasons: [] } }),
      app('b', 's_screening', { match: { score: 90, breakdown: {}, missing_must: [], reasons: [] } }),
      app('c', 's_screening', { pending_move: { to: 's_assessment', reason: 'passed', suggested_at: '2026-10-02T00:00:00Z' } }),
      app('d', 's_screening', { candidate: null }),
    ]
    expect(sortApplications(apps).map((a) => a.id).slice(0, 3)).toEqual(['c', 'b', 'a'])
    const cols = groupByStage(stages, apps)
    expect(filterBoard(cols, { minScore: 50 })[1].applications.map((a) => a.id)).toEqual(['b'])
    expect(filterBoard(cols, { pendingOnly: true })[1].applications.map((a) => a.id)).toEqual(['c'])
    expect(filterBoard(cols, { q: 'person a' })[1].applications.map((a) => a.id)).toEqual(['a'])
  })

  it('moves optimistically and marks terminal statuses', () => {
    const cols = groupByStage(stages, [app('a', 's_screening', { pending_move: { to: 's_assessment', reason: '', suggested_at: '' } })])
    const moved = moveOnBoard(cols, 'a', 's_rejected', '2026-10-05T00:00:00.000Z')
    const rej = moved.find((c) => c.stage.id === 's_rejected')!.applications[0]
    expect(rej).toMatchObject({ stage_id: 's_rejected', status: 'rejected', pending_move: null, stage_entered_at: '2026-10-05T00:00:00.000Z' })
    expect(moved.find((c) => c.stage.id === 's_screening')!.applications).toHaveLength(0)
    expect(moveOnBoard(cols, 'a', 'nope')).toBe(cols)
    expect(moveOnBoard(cols, 'missing', 's_offer')).toBe(cols)
  })

  it('reads the latest result and SLA', () => {
    expect(latestResult({ stage_id: 's', last_result: { stage_id: 's', outcome: 'skipped', at: '' } })).toBeNull()
    expect(latestResult({
      stage_id: 's2',
      results: [
        { stage_id: 's1', outcome: 'pass', at: '2026-10-03T00:00:00Z' },
        { stage_id: 's2', outcome: 'fail', at: '2026-10-02T00:00:00Z' },
      ],
    })?.stage_id).toBe('s2')
    const now = new Date('2026-10-10T00:00:00Z').getTime()
    expect(isOverdue({ stage_entered_at: '2026-10-01T00:00:00Z', status: 'active' }, { sla_days: 7 }, now)).toBe(true)
    expect(isOverdue({ stage_entered_at: '2026-10-01T00:00:00Z', status: 'on_hold' }, { sla_days: 7 }, now)).toBe(false)
    expect(isOverdue({ stage_entered_at: '2026-10-01T00:00:00Z', status: 'active' }, { sla_days: null }, now)).toBe(false)
  })
})

describe('csv preview', () => {
  it('parses quoted fields and maps loose headers', () => {
    const rows = parseCsv('﻿Full name,E-mail,Mobile,Country\r\n"Rao, Asha",asha@x.dev,+919876543210,IN\nNo Contact,,,\n"Bad",not-an-email,,\n')
    expect(rows[1][0]).toBe('Rao, Asha')
    const { valid, invalid } = csvToCandidates(rows)
    expect(valid).toEqual([{ name: 'Rao, Asha', email: 'asha@x.dev', phone: '+919876543210', country: 'IN' }])
    expect(invalid).toBe(2)
  })
})

describe('timeline + labels', () => {
  it('merges history, results and comments newest first', () => {
    const t = buildTimeline(
      {
        history: [
          { from: null, to: 's_applied', at: '2026-10-01T00:00:00Z', by: 'system', auto: true },
          { from: 's_applied', to: 's_screening', at: '2026-10-02T00:00:00Z', by: 'u1', auto: false, reason: 'Looks good' },
        ],
        results: [
          { stage_id: 's_screening', outcome: 'pass', score: 82, at: '2026-10-03T00:00:00Z' },
          { stage_id: 's_screening', outcome: 'skipped', at: '2026-10-04T00:00:00Z' },
        ],
      },
      base(),
      [{ by: 'u2', by_name: 'Kiran', text: 'Call tomorrow', at: '2026-10-05T00:00:00Z' }],
    )
    expect(t.map((x) => x.kind)).toEqual(['comment', 'result', 'move', 'move'])
    expect(t[1].title).toBe('Passed Résumé screening')
    expect(t[2]).toMatchObject({ title: 'Moved from Applied to Résumé screening', detail: 'Looks good', by: 'A teammate' })
    expect(t[3]).toMatchObject({ title: 'Added to Applied', by: 'Automatic' })
  })

  it('formats salary, days and score tones', () => {
    expect(formatSalary({ min: 1200000, max: 1800000, currency: 'INR', period: 'year' })).toBe('₹12L – ₹18L / year')
    expect(formatSalary({ min: 90000, currency: 'USD' })).toBe('$90k')
    expect(formatSalary(null)).toBeNull()
    expect(daysSince('2026-10-01T00:00:00Z', new Date('2026-10-04T12:00:00Z').getTime())).toBe(3)
    expect(daysSince('garbage')).toBe(0)
    expect(scoreTone(80)).toContain('green')
    expect(scoreTone(null)).toContain('muted')
  })
})
