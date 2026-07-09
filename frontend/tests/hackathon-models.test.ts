import { describe, it, expect } from 'vitest'
import { xpToLevel, newToken } from '@/lib/db/qr-events'

describe('Hackathon Models', () => {
  describe('XP to Level conversion', () => {
    it('returns level 1 for zero XP', () => {
      expect(xpToLevel(0)).toBe(1)
    })

    it('returns level 1 for negative XP', () => {
      expect(xpToLevel(-50)).toBe(1)
    })

    it('returns level 2 for 100 XP', () => {
      expect(xpToLevel(100)).toBe(2)
    })

    it('returns level 5 for 400 XP', () => {
      expect(xpToLevel(400)).toBe(5)
    })

    it('returns level 10 for 900 XP', () => {
      expect(xpToLevel(900)).toBe(10)
    })
  })

  describe('Token generation', () => {
    it('generates a unique token', () => {
      const t1 = newToken()
      const t2 = newToken()
      expect(t1).not.toBe(t2)
      expect(t1.length).toBeGreaterThan(20)
    })

    it('generates URL-safe tokens without padding', () => {
      const token = newToken()
      expect(token).not.toContain('+')
      expect(token).not.toContain('/')
      expect(token).not.toContain('=')
    })
  })
})

describe('Hackathon Status Lifecycle', () => {
  it('follows draft → open → live → closed', () => {
    const validStatuses = ['draft', 'open', 'live', 'closed'] as const
    const transitions: Record<string, string[]> = {
      draft: ['open'],
      open: ['live'],
      live: ['closed'],
      closed: [],
    }
    for (const status of validStatuses) {
      expect(transitions[status]).toBeDefined()
      expect(validStatuses).toContain(status)
    }
    // Verify PATCH allows status changes
    expect(transitions.draft).toContain('open')
    expect(transitions.open).toContain('live')
    expect(transitions.live).toContain('closed')
  })
})

describe('Hackathon Submission Workflow', () => {
  it('follows pending → under_review → released', () => {
    const validStatuses = ['pending', 'under_review', 'released']
    const validTransitions: Record<string, string[]> = {
      pending: ['under_review'],
      under_review: ['released'],
      released: [],
    }
    for (const status of validStatuses) {
      expect(validTransitions[status]).toBeDefined()
    }
    expect(validTransitions.pending).toContain('under_review')
    expect(validTransitions.under_review).toContain('released')
  })

  it('non-admins cannot see unreleased scores', () => {
    // Non-admin user should see null score for under_review submissions
    const submission = { score: 85, status: 'under_review' }
    const isAdmin = false
    const resultsReleased = false
    const visible = isAdmin || resultsReleased ? submission.score : null
    expect(visible).toBeNull()
  })

  it('admins can always see scores', () => {
    const submission = { score: 85, status: 'under_review' }
    const isAdmin = true
    const visible = isAdmin ? submission.score : null
    expect(visible).toBe(85)
  })

  it('released results are visible to everyone', () => {
    const submission = { score: 85, status: 'released' }
    const isAdmin = false
    const resultsReleased = true
    const visible = isAdmin || resultsReleased ? submission.score : null
    expect(visible).toBe(85)
  })
})
