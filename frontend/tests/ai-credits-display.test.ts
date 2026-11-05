/**
 * Regression for the profile page printing 9007199254740992 (Number.MAX_SAFE_INTEGER
 * is the superadmin sentinel) and being labelled "Free plan" (2026-11-02).
 */
import { describe, expect, it } from 'vitest'
import { creditBalanceLabel } from '@/lib/ai-credits-display'

describe('AI credit display', () => {
  it('renders the superadmin sentinel as ∞, never the number', () => {
    expect(creditBalanceLabel({ balance: Number.MAX_SAFE_INTEGER, unlimited: true })).toBe('∞')
  })

  it('renders real balances as plain digits', () => {
    expect(creditBalanceLabel({ balance: 250 })).toBe('250')
    expect(creditBalanceLabel({ balance: 0 })).toBe('0')
  })

  it('shows an ellipsis until the balance is loaded', () => {
    expect(creditBalanceLabel({ balance: null })).toBe('…')
  })
})
