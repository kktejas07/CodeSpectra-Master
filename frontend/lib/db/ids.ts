/** Shared ID + timestamp helpers (single copy — was copy-pasted across ~15 lib/db/*.ts). */
import { randomUUID } from 'node:crypto'

export function newId(): string {
  return randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}
