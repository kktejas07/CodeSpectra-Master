import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { proctorSession } from './fixtures/mock-data'

vi.mock('@/lib/i18n/client', () => ({
  useT: () => ({ t: (k: string) => k, locale: 'en' }),
}))

import { ProctoringPanel } from '@/components/admin/analytics/proctoring-panel'

const proctoringData = {
  events: [
    {
      event_type: 'alt_tab_detected',
      count: 3,
      exams: [
        { exam_id: proctorSession.examId, exam_title: 'Senior SWE — DSA Round', count: 2 },
        { exam_id: 'asmnt_002', exam_title: 'SQL Basics', count: 1 },
      ],
    },
  ],
  total_flags: 3,
  events_by_type: { alt_tab_detected: 3 },
}

function mockFetch(ok: boolean) {
  const spy = vi.fn(async () => (ok ? { ok: true, json: async () => proctoringData } : { ok: false, json: async () => ({}) }))
  global.fetch = spy as unknown as typeof fetch
  return spy
}

// ponytail: the panel polls every 10s (POLL_INTERVAL); fake timers keep the
// suite from waiting, and microtasks are flushed explicitly with act.
function flush() {
  return act(async () => {})
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  cleanup()
  ;(globalThis as unknown as { fetch?: unknown }).fetch = undefined
})

describe('ProctoringPanel', () => {
  it('shows the spinner before data lands', () => {
    mockFetch(true)
    const { container } = render(React.createElement(ProctoringPanel))
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders KPIs and the flagged-assessments list from data', async () => {
    mockFetch(true)
    render(React.createElement(ProctoringPanel))
    await flush()
    expect(screen.getByText('Most-flagged assessments')).toBeInTheDocument()
    expect(screen.getByText('Senior SWE — DSA Round')).toBeInTheDocument()
    expect(screen.getByText('SQL Basics')).toBeInTheDocument()
    expect(screen.getByText('alt_tab_detected')).toBeInTheDocument()
  })

  it('shows the load-error empty state when the endpoint fails', async () => {
    mockFetch(false)
    render(React.createElement(ProctoringPanel))
    await flush()
    expect(screen.getByText("Couldn't load proctoring analytics")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('stops polling when auto-refresh is turned off', async () => {
    const fetchSpy = mockFetch(true)
    render(React.createElement(ProctoringPanel))
    await flush()
    vi.advanceTimersByTime(30_000) // 3 poll ticks
    const polls = vi.mocked(fetchSpy).mock.calls.length
    expect(polls).toBeGreaterThan(1)
    fireEvent.click(screen.getByLabelText('Auto-refresh'))
    vi.advanceTimersByTime(60_000)
    expect(vi.mocked(fetchSpy).mock.calls.length).toBe(polls)
  })
})
