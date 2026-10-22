/**
 * Candidate answer-input renderer (components/assessment/QuestionAnswerInput).
 * Guards that each new question type renders a usable control and reports the
 * value encoding the graders expect (CSV / JSON map / string).
 * Run: npx vitest run tests/question-answer-input.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QuestionAnswerInput } from '@/components/assessment/QuestionAnswerInput'

describe('QuestionAnswerInput', () => {
  it('multiple_response toggles into a string[] value', () => {
    const onChange = vi.fn()
    render(<QuestionAnswerInput question={{ id: 'q1', type: 'multiple_response', options: ['A', 'B'] }} value={[]} onChange={onChange} />)
    fireEvent.click(screen.getByText('A'))
    expect(onChange).toHaveBeenCalledWith(['A'])
  })

  it('yes_no renders Yes/No and selects one', () => {
    const onChange = vi.fn()
    render(<QuestionAnswerInput question={{ id: 'q1', type: 'yes_no' }} value={undefined} onChange={onChange} />)
    fireEvent.click(screen.getByText('Yes'))
    expect(onChange).toHaveBeenCalledWith('Yes')
  })

  it('numeric accepts a typed value', () => {
    const onChange = vi.fn()
    render(<QuestionAnswerInput question={{ id: 'q1', type: 'numeric' }} value={undefined} onChange={onChange} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. 42'), { target: { value: '42' } })
    expect(onChange).toHaveBeenCalledWith('42')
  })

  it('ordering reorders with the down button into CSV', () => {
    const onChange = vi.fn()
    render(<QuestionAnswerInput question={{ id: 'q1', type: 'ordering', options: ['X', 'Y', 'Z'] }} value={undefined} onChange={onChange} />)
    fireEvent.click(screen.getAllByLabelText(/^Move “X” down/)[0])
    expect(onChange).toHaveBeenCalledWith('Y, X, Z')
  })

  it('matching reports a JSON map', () => {
    const onChange = vi.fn()
    render(
      <QuestionAnswerInput
        question={{ id: 'q1', type: 'matching', pairs: [{ left: 'A', right: '1' }, { left: 'B', right: '2' }] }}
        value={undefined}
        onChange={onChange}
      />
    )
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '1' } })
    expect(onChange).toHaveBeenCalledWith(JSON.stringify({ A: '1' }))
  })

  it('matrix reports one column per row as CSV', () => {
    const onChange = vi.fn()
    render(
      <QuestionAnswerInput
        question={{ id: 'q1', type: 'matrix', matrix: { rows: ['r1', 'r2'], columns: ['T', 'F'] } }}
        value={undefined}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getAllByRole('radio')[0])
    expect(onChange).toHaveBeenCalledWith('T')
  })

  it('likert renders the scale and selects a value', () => {
    const onChange = vi.fn()
    render(<QuestionAnswerInput question={{ id: 'q1', type: 'likert', scale: { min: 1, max: 5 } }} value={undefined} onChange={onChange} />)
    fireEvent.click(screen.getByText('4'))
    expect(onChange).toHaveBeenCalledWith('4')
  })

  it('hotspot selects a region id', () => {
    const onChange = vi.fn()
    render(
      <QuestionAnswerInput
        question={{ id: 'q1', type: 'hotspot', image_url: 'https://x/y.png', regions: [{ id: 'r1', x: 0, y: 0, w: 10, h: 10, label: 'left' }] }}
        value={undefined}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByTitle('left'))
    expect(onChange).toHaveBeenCalledWith('r1')
  })
})
