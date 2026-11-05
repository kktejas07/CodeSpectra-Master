import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/i18n/client', () => ({
  useT: () => ({ t: (k: string) => k, locale: 'en' }),
}))

import { ScoresPanel } from '@/components/admin/analytics/scores-panel'

// ponytail: endpoint shape documented in scores-panel.tsx — no shared fixture needed.
const scoresData = {
  distribution: [
    { bucket: '40-60', count: 2 },
    { bucket: '60-80', count: 5 },
  ],
  total_submissions: 7,
  average_score: 58.3,
}

function mockFetch(ok: boolean) {
  const spy = vi.fn(async () =>
    ok ? { ok: true, json: async () => scoresData } : { ok: false, json: async () => ({}) },
  )
  global.fetch = spy as unknown as typeof fetch
  return spy
}

function flush() {
  return act(async () => {})
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  cleanup()
  ;(globalThis as unknown as { fetch?: unknown }).fetch = undefined
})

describe('ScoresPanel', () => {
  it('renders KPIs and the distribution table from data', async () => {
    mockFetch(true)
    render(React.createElement(ScoresPanel))
    await flush()
    expect(screen.getByText('Score analytics')).toBeInTheDocument()
    expect(screen.getByText('58.3%')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(screen.getByText('Breakdown by score range')).toBeInTheDocument()
    // Bucket label appears in both the bar row and the breakdown table cell.
    expect(screen.getAllByText('60-80%')).toHaveLength(2)
    expect(table.textContent).toContain('Good')
  })

  it('shows the empty distribution state when no submissions exist', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ distribution: [], total_submissions: 0, average_score: 0 }) })) as unknown as typeof fetch
    render(React.createElement(ScoresPanel))
    await flush()
    expect(screen.getByText('No scores yet')).toBeInTheDocument()
  })

  it('shows the load-error empty state when the endpoint fails', async () => {
    mockFetch(false)
    render(React.createElement(ScoresPanel))
    await flush()
    expect(screen.getByText("Couldn't load score analytics")).toBeInTheDocument()
  })
})
