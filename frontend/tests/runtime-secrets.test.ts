import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  generateRuntimeSecret,
  isUsableRuntimeSecret,
  pickRuntimeSecret,
} from '../lib/runtime-secrets'

describe('runtime secrets', () => {
  it('rejects short, empty, and masked values', () => {
    expect(isUsableRuntimeSecret('')).toBe(false)
    expect(isUsableRuntimeSecret('short')).toBe(false)
    expect(isUsableRuntimeSecret('••••masked-looking-value-32chars••')).toBe(false)
    expect(isUsableRuntimeSecret('a'.repeat(32))).toBe(true)
  })

  it('prefers Mongo over env so Dokploy env wipes cannot replace the signing key', () => {
    const stored = 's'.repeat(32)
    const env = 'e'.repeat(32)
    expect(pickRuntimeSecret(env, stored)).toEqual({ source: 'stored', value: stored })
    expect(pickRuntimeSecret(env, '')).toEqual({ source: 'env', value: env })
    expect(pickRuntimeSecret('', '')).toEqual({ source: 'missing', value: '' })
  })

  it('generates a 64-char hex secret', () => {
    const a = generateRuntimeSecret()
    const b = generateRuntimeSecret()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })

  it('container entrypoint hydrates secrets from Mongo before next start', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    const entry = readFileSync(join(root, 'scripts/docker-entrypoint.sh'), 'utf8')
    const hydrate = readFileSync(join(root, 'scripts/hydrate-runtime-secrets.mjs'), 'utf8')
    expect(entry).toContain('hydrate-runtime-secrets.mjs')
    expect(hydrate).toContain('session_secret')
    expect(hydrate).toContain('internal_backend_secret')
    expect(hydrate).not.toContain('console.log(value')
  })
})
