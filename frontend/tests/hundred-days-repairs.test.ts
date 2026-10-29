/**
 * 100-Days repairs: every replacement problem must be solvable exactly as
 * stated. Each reference solution below is test-only (never shipped) and
 * implements the description literally; if an example drifts from it, this
 * fails — the same guard that caught real bugs in the arena content.
 */
import { describe, expect, it } from 'vitest'
import { HUNDRED_DAYS } from '@/lib/100-days-data'

const SOLUTIONS: Record<string, string> = {
  d86p1: `
    const lines = require('fs').readFileSync(0,'utf8').trim().split('\\n')
    const n = Number(lines[0]); let counter = 0
    const byKey = new Map()
    const out = []
    for (const line of lines.slice(1, 1 + n)) {
      const [cmd, arg] = line.split(' ')
      if (cmd === 'encode') { counter++; const key = counter.toString(36); byKey.set(key, arg); out.push(key) }
      else out.push(byKey.get(arg) ?? 'NOT_FOUND')
    }
    console.log(out.join('\\n'))`,

  d86p2: `
    const lines = require('fs').readFileSync(0,'utf8').trim().split('\\n')
    const n = Number(lines[0]); let counter = 0
    const byKey = new Map(); const hits = new Map(); const out = []
    for (const line of lines.slice(1, 1 + n)) {
      const parts = line.split(' '); const cmd = parts[0]
      if (cmd === 'encode') { counter++; const key = counter.toString(36); byKey.set(key, parts[1]); out.push(key) }
      else if (cmd === 'decode') {
        const url = byKey.get(parts[1])
        if (url === undefined) out.push('NOT_FOUND')
        else { hits.set(parts[1], (hits.get(parts[1]) || 0) + 1); out.push(url) }
      } else {
        if (!byKey.has(parts[1])) out.push('NOT_FOUND'); else out.push(String(hits.get(parts[1]) || 0))
      }
    }
    console.log(out.join('\\n'))`,

  d88p1: `
    const lines = require('fs').readFileSync(0,'utf8').trim().split('\\n')
    const n = Number(lines[0])
    const items = lines.slice(1, 1 + n).map(l => l.split(' ').map(Number))
    items.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    console.log(items.map(i => i[1]).join(' '))`,

  d96p1: `
    const lines = require('fs').readFileSync(0,'utf8').trim().split('\\n')
    const n = Number(lines[0]); const out = []
    for (const line of lines.slice(1, 1 + n)) {
      const [method, path] = line.split(' ')
      const known = path === '/items' || /^\\/items\\/[^/]+$/.test(path)
      const single = /^\\/items\\/[^/]+$/.test(path)
      if (!known) out.push('404')
      else if (method === 'POST' && path === '/items') out.push('201')
      else if (method === 'GET') out.push('200')
      else if (method === 'DELETE' && single) out.push('204')
      else out.push('405')
    }
    console.log(out.join('\\n'))`,

  d98p1: `
    const lines = require('fs').readFileSync(0,'utf8').split('\\n')
    const payload = lines[0].trim(); const secret = lines[1].trim()
    const all = payload + secret
    let sum = 0; for (const ch of all) sum += ch.charCodeAt(0)
    console.log(payload + '.' + (sum % 1000))`,

  d98p2: `
    const lines = require('fs').readFileSync(0,'utf8').split('\\n')
    const password = lines[0].trim(); const salt = lines[1].trim()
    let h = 0x811c9dc5
    for (const ch of Buffer.from(salt + password, 'utf8')) {
      h ^= ch
      h = Math.imul(h, 0x01000193) >>> 0
    }
    console.log(h.toString(16).padStart(8, '0'))`,

  d99p1: `
    const lines = require('fs').readFileSync(0,'utf8').trim().split('\\n')
    const n = Number(lines[0]); let nextId = 0
    const items = []; const out = []
    for (const line of lines.slice(1, 1 + n)) {
      const parts = line.split(' '); const cmd = parts[0]
      if (cmd === 'add') { nextId++; items.push({ id: nextId, done: false, text: parts[1] }); out.push(String(nextId)) }
      else if (cmd === 'complete') {
        const item = items.find(i => i.id === Number(parts[1]))
        if (!item) out.push('MISSING'); else { item.done = true; out.push('OK') }
      } else {
        for (const i of items) out.push(i.id + ':' + (i.done ? 'done' : 'open') + ':' + i.text)
      }
    }
    console.log(out.join('\\n'))`,

  d100p1: `
    const lines = require('fs').readFileSync(0,'utf8').trim().split('\\n')
    const d = Number(lines[0]); const docs = lines.slice(1, 1 + d)
    let at = 1 + d
    const q = Number(lines[at]); at++
    const out = []
    for (const term of lines.slice(at, at + q)) {
      const needle = term.toLowerCase()
      const scored = []
      docs.forEach((doc, i) => {
        const words = doc.toLowerCase().split(/[^a-z0-9]+/)
        const count = words.filter(w => w === needle).length
        if (count > 0) scored.push({ id: i + 1, count })
      })
      scored.sort((a, b) => b.count - a.count || a.id - b.id)
      out.push(scored.length ? scored.map(s => s.id).join(' ') : '-')
    }
    console.log(out.join('\\n'))`,

  d100p2: `
    const lines = require('fs').readFileSync(0,'utf8').trim().split('\\n')
    const n = Number(lines[0]); const store = new Map(); const out = []
    for (const line of lines.slice(1, 1 + n)) {
      const parts = line.split(' '); const cmd = parts[0]; const key = parts[1]
      let sum = 0; for (const ch of key) sum += ch.charCodeAt(0)
      const node = sum % 3
      if (cmd === 'put') { store.set(key, parts[2]); out.push('node' + node) }
      else out.push(store.get(key) ?? 'MISSING')
    }
    console.log(out.join('\\n'))`,

  d100p3: `
    const nums = require('fs').readFileSync(0,'utf8').trim().split('\\n')[1].split(' ').map(Number)
    const out = []
    for (let i = 1; i < nums.length; i++) {
      const value = nums[i]
      let j = i - 1
      while (j >= 0 && nums[j] > value) { nums[j + 1] = nums[j]; j-- }
      nums[j + 1] = value
      out.push(nums.join(' '))
    }
    console.log(out.length ? out.join('\\n') : nums.join(' '))`,
}

function run(solution: string, stdin: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
  return execFileSync(process.execPath, ['-e', solution], { input: stdin, encoding: 'utf8', timeout: 10_000 }).trim()
}

const ALL = HUNDRED_DAYS.flatMap(d => d.problems)
const REPAIRED_IDS = Object.keys(SOLUTIONS)

describe('100-Days repairs', () => {
  it('every repaired problem exists in the curriculum', () => {
    const ids = new Set(ALL.map(p => p.id))
    expect(REPAIRED_IDS.filter(id => !ids.has(id))).toEqual([])
  })

  it.each(REPAIRED_IDS)('%s: reference solution reproduces every example', (id) => {
    const problem = ALL.find(p => p.id === id)!
    expect(problem.examples.length).toBeGreaterThan(0)
    for (const ex of problem.examples) {
      const actual = run(SOLUTIONS[id], ex.input)
      expect(actual, `input=${JSON.stringify(ex.input)}`).toBe(ex.output.trim())
    }
  })

  it('no problem anywhere still carries a placeholder expected output', () => {
    const PLACEHOLDER = /eyJhbGciOiJIUzI1NiJ9|a1b2c3d4e5f6|\.\.\.signature|abc123|example\.com/i
    const bad = ALL.filter(p => p.examples.some(e => PLACEHOLDER.test(e.output))).map(p => p.id)
    expect(bad).toEqual([])
  })

  it('repaired problems state real constraints', () => {
    const bad = REPAIRED_IDS.filter(id => {
      const p = ALL.find(x => x.id === id)!
      return !p.constraints || p.constraints.trim() === 'N/A'
    })
    expect(bad).toEqual([])
  })
})
