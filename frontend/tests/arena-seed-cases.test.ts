/**
 * Arena challenges are graded by feeding the case's stdin to a whole program
 * and comparing stdout. The seeds used to violate that: they carried
 * LeetCode-style prose (`nums = [2,7,11,15], target = 9`) as the "input" and a
 * `function twoSum(nums, target)` starter, so no submission could ever match.
 *
 * This runs every seed's reference solution against its own cases. If a seed's
 * cases and expected output drift apart, arena becomes unsolvable again and
 * this test fails.
 */
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { ARENA_CHALLENGES } from '@/lib/arena-challenges'

function runSolution(solution: string, stdin: string): string {
  return execFileSync(process.execPath, ['-e', solution], {
    input: stdin,
    encoding: 'utf8',
    timeout: 10_000,
  }).trim()
}

describe('arena seed challenges', () => {
  const graded = ARENA_CHALLENGES.filter(c => c.solutionCode)

  it('has a reference solution for every seed', () => {
    expect(graded).toHaveLength(ARENA_CHALLENGES.length)
  })

  it.each(graded.map(c => [c.id, c.title, c] as const))(
    'challenge %s (%s): reference solution matches every expected output',
    (_id, _title, challenge) => {
      const cases = [
        ...(challenge.examples ?? []).map(ex => ({ stdin: ex.input, expected: ex.output })),
        ...(challenge.testCases ?? []).map(tc => ({ stdin: tc.stdin, expected: tc.expected_stdout })),
      ]

      expect(cases.length, 'a challenge needs at least one graded case').toBeGreaterThan(0)

      for (const c of cases) {
        const actual = runSolution(challenge.solutionCode!, c.stdin)
        expect(actual, `stdin=${JSON.stringify(c.stdin)}`).toBe(c.expected.trim())
      }
    },
  )
})
