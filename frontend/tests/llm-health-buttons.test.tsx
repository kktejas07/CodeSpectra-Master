/**
 * Health tab button wiring regression test.
 * 2026-09-22 prod bug: "Test all providers" and "Reload" did nothing —
 * onClick handlers evaluated `void loadHealth` / `void runHealthTest`
 * (function references, never invoked). This test clicks both and asserts
 * the backing /api/admin/llm-health requests actually fire.
 * Run: npx vitest run tests/llm-health-buttons.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/toast-context', () => ({
  useToast: () => vi.fn(),
}))

import { LlmSettingsTabs } from '@/components/dashboard/settings/llm-settings-tabs'

function mockFetch() {
  const calls: { url: string; method: string }[] = []
  global.fetch = vi.fn(async (url: any, init: any = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET' })
    return {
      ok: true,
      json: async () => ({ checkedAt: new Date().toISOString(), results: [] }),
    }
  }) as any
  return calls
}

describe('LLM health tab buttons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  // ponytail: 30s budget — jsdom + user-event runs slow under load and the
  // default 5s flakes (proven 2026-09-22: green at 43s on a loaded box).
  it('Test all providers fires POST /api/admin/llm-health', { timeout: 30000 }, async () => {
    const user = userEvent.setup()
    const calls = mockFetch()
    render(<LlmSettingsTabs />)
    await user.click(await screen.findByRole('tab', { name: /health/i }))
    await user.click(screen.getByRole('button', { name: /test all providers/i }))
    await waitFor(() => {
      expect(calls.some((c) => c.url === '/api/admin/llm-health' && c.method === 'POST')).toBe(true)
    })
  })

  it('Reload fires GET /api/admin/llm-health', { timeout: 30000 }, async () => {
    const user = userEvent.setup()
    const calls = mockFetch()
    render(<LlmSettingsTabs />)
    await user.click(await screen.findByRole('tab', { name: /health/i }))
    // Initial mount already GETs once; clear and click Reload for a fresh one.
    calls.length = 0
    await user.click(screen.getByRole('button', { name: /^reload$/i }))
    await waitFor(() => {
      expect(calls.some((c) => c.url === '/api/admin/llm-health' && c.method === 'GET')).toBe(true)
    })
  })
})
