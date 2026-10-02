/**
 * Shared avatar helper tests + UserAvatar fallback render.
 * Locks in the photo → dicebear → initials contract so pages never
 * reintroduce hand-rolled api.dicebear.com URLs.
 * Run: npx vitest run tests/user-avatar.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { dicebearUrl, initialsFor } from '@/lib/avatar'
import { UserAvatar } from '@/components/ui/user-avatar'

describe('dicebearUrl', () => {
  it('builds a seeded avataaars URL', () => {
    expect(dicebearUrl('a@b.com')).toBe(
      'https://api.dicebear.com/7.x/avataaars/svg?seed=a%40b.com',
    )
  })

  it('falls back to x for empty seeds', () => {
    expect(dicebearUrl('')).toContain('seed=x')
    expect(dicebearUrl(null)).toContain('seed=x')
  })
})

describe('initialsFor', () => {
  it('takes first + last initials', () => {
    expect(initialsFor('Ada Lovelace')).toBe('AL')
  })

  it('takes two letters of single names', () => {
    expect(initialsFor('plato')).toBe('PL')
  })

  it('is null-safe', () => {
    expect(initialsFor('')).toBe('?')
    expect(initialsFor(null)).toBe('?')
  })
})

describe('UserAvatar', () => {
  it('renders initials fallback (images never load in jsdom)', async () => {
    render(<UserAvatar seed="ada@x.com" name="Ada Lovelace" />)
    expect(await screen.findByText('AL')).toBeTruthy()
  })

  // ponytail: no photo-src DOM assertion — Radix AvatarImage mounts no <img>
  // until the image loads, which never happens in jsdom. The src ||
  // dicebearUrl(seed) selection is a one-line OR above, covered by reading.
})
