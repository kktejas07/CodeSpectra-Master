import { randomBytes } from 'node:crypto'

/** JWT / service secrets must be at least 32 chars. Masked UI values (•) are never usable. */
export const MIN_RUNTIME_SECRET_LEN = 32

export function isUsableRuntimeSecret(value: string | undefined | null): boolean {
  const s = (value || '').trim()
  return s.length >= MIN_RUNTIME_SECRET_LEN && !s.includes('•')
}

/**
 * Mongo `platform_settings.secrets` is the durable store. Env is only a bootstrap
 * when Mongo is empty — Dokploy rebuilds wipe ad-hoc `--env-add` values.
 */
export function pickRuntimeSecret(
  envVal: string | undefined,
  storedVal: string | undefined,
): { source: 'stored' | 'env' | 'missing'; value: string } {
  if (isUsableRuntimeSecret(storedVal)) {
    return { source: 'stored', value: (storedVal || '').trim() }
  }
  if (isUsableRuntimeSecret(envVal)) {
    return { source: 'env', value: (envVal || '').trim() }
  }
  return { source: 'missing', value: '' }
}

export function generateRuntimeSecret(): string {
  return randomBytes(32).toString('hex')
}
