/**
 * axe-core over the test runner's answer controls (jsdom: structure / names / roles;
 * colour contrast is checked in the browser by the QA crawl, scripts/qa/crawl.mjs --axe).
 * Every rendered question type must have labelled controls and no serious / critical issue,
 * and the pointer-only types (hotspot, ordering, matching) must be answerable by keyboard.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { QuestionAnswerInput, type AnswerQuestion } from '@/components/assessment/QuestionAnswerInput'

async function seriousViolations(container: HTMLElement): Promise<string[]> {
  const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}

const QUESTIONS: AnswerQuestion[] = [
  { id: 'mcq', type: 'mcq', options: ['One', 'Two', 'Three'] },
  { id: 'multi', type: 'multiple_response', options: ['A', 'B', 'C'] },
  { id: 'tf', type: 'true_false' },
  { id: 'num', type: 'numeric' },
  { id: 'short', type: 'short_answer' },
  { id: 'blanks', type: 'fill_blanks', prompt: 'x ___ y ___', options: [] },
  { id: 'order', type: 'ordering', options: ['First', 'Second', 'Third'] },
  { id: 'match', type: 'matching', pairs: [{ left: 'HTTP', right: '80' }, { left: 'SSH', right: '22' }] },
  { id: 'dd', type: 'drag_drop', pairs: [{ left: 'CPU', right: 'Processor' }, { left: 'RAM', right: 'Memory' }] },
  { id: 'matrix', type: 'matrix', matrix: { rows: ['r1', 'r2'], columns: ['True', 'False'] } },
  { id: 'table', type: 'table_fill', table: { columns: ['Value'], rows: ['a', 'b'] } },
  { id: 'hot', type: 'hotspot', image_url: '/x.png', regions: [{ id: 'r1', x: 0, y: 0, w: 10, h: 10, label: 'Top left' }, { id: 'r2', x: 50, y: 50, w: 10, h: 10 }] },
  { id: 'likert', type: 'likert', scale: { min: 1, max: 5 } },
]

describe('answer inputs: axe-core', () => {
  for (const q of QUESTIONS) {
    it(`${q.type}: no serious or critical violations`, async () => {
      const { container } = render(<main><QuestionAnswerInput question={q} value={undefined} onChange={() => {}} /></main>)
      expect(await seriousViolations(container)).toEqual([])
    })
  }
})

describe('keyboard-only alternatives', () => {
  it('hotspot can be answered from the region list', async () => {
    const user = userEvent.setup()
    let value: unknown = null
    render(<QuestionAnswerInput question={QUESTIONS.find((q) => q.id === 'hot')!} value={undefined} onChange={(v) => { value = v }} />)
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(2)
    radios[1].focus()
    await user.keyboard(' ')
    expect(value).toBe('r2')
  })
  it('ordering buttons name the item and its position', () => {
    render(<QuestionAnswerInput question={QUESTIONS.find((q) => q.id === 'order')!} value={undefined} onChange={() => {}} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getAllByRole('button').some((b) => /Second/.test(b.getAttribute('aria-label') || ''))).toBe(true)
  })
  it('single choice is a labelled radio group', () => {
    render(<QuestionAnswerInput question={QUESTIONS[0]} value={undefined} onChange={() => {}} />)
    expect(screen.getByRole('radiogroup')).toHaveAccessibleName()
  })
})
