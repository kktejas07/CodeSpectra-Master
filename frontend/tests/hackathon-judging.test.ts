import { describe, it, expect } from 'vitest'
import {
  normalizeSubmissionStatus,
  canTransition,
  statusAfterScore,
  isReleasable,
  teamCanEdit,
  buildStatusUpdate,
} from '@/lib/hackathons/submission-state'
import { judgeTotals, computeSubmissionFinal, rankTeams, autoPercent, rubricTotal, withFinalPoints } from '@/lib/hackathons/final-scores'
import { outputsMatch, bestScoreTotals, codeathonProblemsVisible } from '@/lib/codeathon-run'

describe('submission state machine', () => {
  it('maps legacy statuses', () => {
    expect(normalizeSubmissionStatus('pending')).toBe('submitted')
    expect(normalizeSubmissionStatus('review_completed')).toBe('scored')
    expect(normalizeSubmissionStatus('accepted')).toBe('scored')
    expect(normalizeSubmissionStatus(undefined)).toBe('submitted')
    expect(normalizeSubmissionStatus('released')).toBe('released')
  })

  it('allows the forward path and blocks manual release', () => {
    expect(canTransition('submitted', 'under_review')).toBe(true)
    expect(canTransition('pending', 'under_review')).toBe(true)
    expect(canTransition('under_review', 'scored')).toBe(true)
    expect(canTransition('scored', 'released')).toBe(false)
    expect(canTransition('under_review', 'released')).toBe(false)
  })

  it('lets rejected be reinstated, nothing leaves released', () => {
    expect(canTransition('scored', 'rejected')).toBe(true)
    expect(canTransition('rejected', 'under_review')).toBe(true)
    expect(canTransition('rejected', 'scored')).toBe(false)
    for (const to of ['submitted', 'under_review', 'scored', 'rejected']) {
      expect(canTransition('released', to)).toBe(false)
    }
    expect(canTransition('submitted', 'bogus')).toBe(false)
  })

  it('scoring moves to scored, but not from released/rejected', () => {
    expect(statusAfterScore('pending')).toBe('scored')
    expect(statusAfterScore('under_review')).toBe('scored')
    expect(statusAfterScore('scored')).toBe('scored')
    expect(statusAfterScore('released')).toBeNull()
    expect(statusAfterScore('rejected')).toBeNull()
  })

  it('release takes every scored, non-rejected submission', () => {
    expect(isReleasable('under_review', true)).toBe(true)
    expect(isReleasable('accepted', true)).toBe(true)
    expect(isReleasable('pending', true)).toBe(true)
    expect(isReleasable('submitted', false)).toBe(false)
    expect(isReleasable('rejected', true)).toBe(false)
    expect(isReleasable('released', true)).toBe(false)
  })

  it('team edits stop at released/rejected', () => {
    expect(teamCanEdit('submitted')).toBe(true)
    expect(teamCanEdit('scored')).toBe(true)
    expect(teamCanEdit('released')).toBe(false)
    expect(teamCanEdit('rejected')).toBe(false)
  })

  it('builds $push beside $set, never inside', () => {
    const u = buildStatusUpdate('rejected', 'j1', '2026-01-01T00:00:00Z', { rejection_reason: 'x' }, 'x')
    expect(Object.keys(u).sort()).toEqual(['$push', '$set'])
    expect(Object.keys(u.$set).some((k) => k.startsWith('$'))).toBe(false)
    expect(u.$set.status).toBe('rejected')
    expect(u.$push.status_history).toMatchObject({ status: 'rejected', changed_by: 'j1', reason: 'x' })
  })
})

describe('final scores', () => {
  const cfg = { aiWeight: 0, dropHighLow: false }

  it('keeps one total per judge, rubric wins, later replaces earlier', () => {
    const t = judgeTotals({
      scores: [{ judge_id: 'a', score: 10 }, { judge_id: 'a', score: 60 }, { judge_id: 'b', score: 80 }],
      rubric_scores: [{ judge_id: 'b', total_score: 90 }],
    })
    expect(t.sort()).toEqual([60, 90])
  })

  it('averages judges instead of taking the last one', () => {
    const f = computeSubmissionFinal({ scores: [{ judge_id: 'a', score: 60 }, { judge_id: 'b', score: 80 }], max_score: 100 }, null, cfg)
    expect(f.final_score).toBe(70)
    expect(f.human_count).toBe(2)
  })

  it('applies dropHighLow and aiWeight', () => {
    const sub = { scores: [{ judge_id: 'a', score: 10 }, { judge_id: 'b', score: 50 }, { judge_id: 'c', score: 100 }], max_score: 100 }
    expect(computeSubmissionFinal(sub, null, { aiWeight: 0, dropHighLow: true }).final_score).toBe(50)
    expect(computeSubmissionFinal(sub, 80, { aiWeight: 0.5, dropHighLow: true }).final_score).toBe(65)
  })

  it('falls back to the auto-grade percentage and scales to task points', () => {
    expect(autoPercent({ score: 50, max_score: 200 })).toBe(25)
    const f = computeSubmissionFinal({ auto_graded: true, auto_score: 150, max_score: 200 }, null, cfg)
    expect(f.final_score).toBe(75)
    expect(f.final_points).toBe(150)
  })

  it('gives no score when nothing scored it', () => {
    expect(computeSubmissionFinal({ max_score: 100 }, null, cfg).final_score).toBeNull()
  })
})

describe('rankTeams', () => {
  it('ranks on best points per problem, not on duplicates or XP', () => {
    const rows = rankTeams(
      ['t1', 't2', 't3'],
      [
        { team_id: 't1', problem_slug: 'p1', status: 'released', final_points: 50 },
        { team_id: 't1', problem_slug: 'p1', status: 'released', final_points: 40 },
        { team_id: 't2', problem_slug: 'p1', status: 'released', final_points: 30 },
        { team_id: 't2', problem_slug: 'p2', status: 'released', final_points: 30 },
        { team_id: 't3', problem_slug: 'p1', status: 'rejected', final_points: 99 },
      ],
      { advanceTopN: 1 },
    )
    expect(rows.map((r) => [r.team_id, r.total, r.rank])).toEqual([
      ['t2', 60, 1],
      ['t1', 50, 2],
      ['t3', null, null],
    ])
    expect(rows[0].advancing).toBe(true)
    expect(rows[1].advancing).toBe(false)
  })

  it('shares ranks on ties and advances every tied team', () => {
    const rows = rankTeams(
      ['a', 'b', 'c'],
      [
        { team_id: 'a', problem_slug: 'p', final_points: 10 },
        { team_id: 'b', problem_slug: 'p', final_points: 10 },
        { team_id: 'c', problem_slug: 'p', final_points: 5 },
      ],
      { advanceTopN: 1 },
    )
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3])
    expect(rows.filter((r) => r.advancing).length).toBe(2)
    expect(rows[0].tied).toBe(true)
  })
})

describe('rubricTotal', () => {
  const criteria = [{ name: 'A', weight: 30 }, { name: 'B', weight: 20 }]
  it('clamps to each weight, ignores unknown names, rescales to 100', () => {
    expect(rubricTotal([{ name: 'A', score: 99 }, { name: 'B', score: 10 }, { name: 'X', score: 50 }], criteria)).toBe(80)
  })
  it('is null without a rubric', () => {
    expect(rubricTotal([{ name: 'A', score: 1 }], [])).toBeNull()
  })
})

describe('withFinalPoints', () => {
  it('derives points for legacy released docs and keeps stored ones', () => {
    const out = withFinalPoints([
      { id: 'a', final_points: 7 },
      { id: 'b', scores: [{ judge_id: 'j', score: 50 }], max_score: 200 },
    ], { aiWeight: 0.4, dropHighLow: false })
    expect(out.map((s) => s.final_points)).toEqual([7, 100])
  })
})

describe('codeathon helpers', () => {
  it('compares output ignoring surrounding whitespace and CRLF', () => {
    expect(outputsMatch('42\n', '42')).toBe(true)
    expect(outputsMatch('a\r\nb', 'a\nb\n')).toBe(true)
    expect(outputsMatch('41', '42')).toBe(false)
  })
  it('sums the best score per problem so resubmits never inflate', () => {
    expect(bestScoreTotals([
      { problem_id: 'p1', score: 100, status: 'accepted' },
      { problem_id: 'p1', score: 100, status: 'accepted' },
      { problem_id: 'p2', score: 30, status: 'wrong_answer' },
    ])).toEqual({ total: 130, solved: 1 })
  })
  it('hides problems before start by default', () => {
    const future = new Date(Date.now() + 3600_000).toISOString()
    expect(codeathonProblemsVisible({ startDate: future, status: 'upcoming' })).toBe(false)
    expect(codeathonProblemsVisible({ startDate: future, problem_visibility: 'always' })).toBe(true)
  })
})
