import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/i18n/client', () => ({
  useT: () => ({ t: (k: string) => k, locale: 'en' }),
}))
vi.mock('@/components/kyc/AnonAadhaarVerify', () => ({
  AnonAadhaarVerify: () => React.createElement('div', null, 'anon-aadhaar-panel'),
}))

import { AnonAadhaarProfileCard } from '@/components/kyc/AnonAadhaarProfileCard'

const RESPONSES: Record<string, unknown> = {
  '/api/kyc/purposes': {
    profile_aadhaar: 'anon_aadhaar',
    identity_kyc: 'off',
    anon_aadhaar_test_mode: true,
    anon_aadhaar_nullifier_seed: 'seed-123',
  },
  '/api/kyc/anon-aadhaar': { verified: true },
}

function mockFetch() {
  const spy = vi.fn(async (url: unknown) => {
    const key = String(url)
    return {
      ok: true,
      json: async () => RESPONSES[key],
    }
  })
  global.fetch = spy as unknown as typeof fetch
  return spy
}

describe('AnonAadhaarProfileCard', () => {
  it('renders the aadhaar panel when profile_aadhaar=anon_aadhaar and unverified', async () => {
    const fetchSpy = mockFetch()
    RESPONSES['/api/kyc/anon-aadhaar'] = { verified: false }
    render(React.createElement(AnonAadhaarProfileCard))
    await screen.findByText('anon-aadhaar-panel')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('omits the panel when already verified', async () => {
    mockFetch()
    RESPONSES['/api/kyc/anon-aadhaar'] = { verified: true }
    render(React.createElement(AnonAadhaarProfileCard))
    await waitFor(() => expect(screen.queryByText('anon-aadhaar-panel')).toBeNull())
    expect(screen.getByText('exam.statusVerified')).toBeInTheDocument()
  })

  it('shows the fallback card when profile_aadhaar is not anon_aadhaar', async () => {
    mockFetch()
    const original = RESPONSES['/api/kyc/purposes']
    RESPONSES['/api/kyc/purposes'] = { ...(original as object), profile_aadhaar: 'off' }
    try {
      render(React.createElement(AnonAadhaarProfileCard))
      await waitFor(() => expect(screen.queryByText('anon-aadhaar-panel')).toBeNull())
      expect(screen.getByRole('link', { name: 'exam.identityVerification' })).toBeInTheDocument()
    } finally {
      RESPONSES['/api/kyc/purposes'] = original
    }
  })
})
