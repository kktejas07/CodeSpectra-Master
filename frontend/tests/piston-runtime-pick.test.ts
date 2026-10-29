/**
 * Piston ships two `javascript` runtimes — Deno 1.32.3 first, Node 18.15.0
 * second. `resolveLanguageVersion` took the first match, so every JS/TS
 * submission ran on Deno, where `process` and `require` do not exist and stdin
 * cannot be read: no arena/problem starter could ever run. This pins the
 * preference for Node.
 */
import { describe, expect, it } from 'vitest'
import { pickRuntime } from '@/lib/piston'

const RUNTIMES = [
  { language: 'typescript', version: '1.32.3', aliases: ['deno', 'deno-ts'] },
  { language: 'javascript', version: '1.32.3', aliases: ['deno-js'] },
  { language: 'javascript', version: '18.15.0', aliases: ['node-javascript', 'node-js', 'javascript', 'js'] },
  { language: 'typescript', version: '5.0.3', aliases: ['ts', 'node-ts', 'tsc'] },
  { language: 'python', version: '3.10.0', aliases: ['py', 'python3'] },
]

describe('pickRuntime', () => {
  it('prefers Node over Deno for javascript (the bug that made stdin unreadable)', () => {
    expect(pickRuntime(RUNTIMES, 'javascript')?.version).toBe('18.15.0')
  })

  it('prefers the Node typescript runtime over Deno', () => {
    expect(pickRuntime(RUNTIMES, 'typescript')?.version).toBe('5.0.3')
  })

  it('is unaffected for single-runtime languages', () => {
    expect(pickRuntime(RUNTIMES, 'python')?.version).toBe('3.10.0')
    expect(pickRuntime(RUNTIMES, 'python3')?.version).toBe('3.10.0')
  })

  it('returns undefined for a language Piston does not have', () => {
    expect(pickRuntime(RUNTIMES, 'brainfuck')).toBeUndefined()
  })
})
