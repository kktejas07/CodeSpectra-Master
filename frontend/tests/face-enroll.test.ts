/**
 * Face enrollment user-id lookup.
 * Signup stores `_id` as a UUID string. Wrapping it with `new ObjectId()` throws
 * and was the 500 on POST /api/auth/face-enroll.
 *
 * Run: npx vitest run tests/face-enroll.test.ts
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ObjectId } from 'mongodb'
import { describe, expect, it } from 'vitest'

const uuid = '550e8400-e29b-41d4-a716-446655440000'

describe('face-enroll user id', () => {
  it('signup UUID ids are not ObjectIds', () => {
    expect(ObjectId.isValid(uuid)).toBe(false)
    expect(() => new ObjectId(uuid)).toThrow()
  })

  it('looks up the user by getUserById, not new ObjectId(user.id)', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../app/api/auth/face-enroll/route.ts'),
      'utf8',
    )
    expect(src).toContain('getUserById')
    expect(src).not.toMatch(/new ObjectId\(\s*user\.id\s*\)/)
  })
})
