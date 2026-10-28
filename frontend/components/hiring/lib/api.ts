'use client'

/**
 * Tiny client for /api/ats: a GET hook with loading/error/reload and a
 * mutation helper on csrfFetch. Responses may wrap the payload under a named
 * key or `data`; `unwrap` accepts either so pages stay simple.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { csrfFetch } from '@/lib/csrf-fetch'

export class AtsError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function unwrap<T>(json: unknown, key?: string): T {
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    if (key && key in o) return o[key] as T
    if ('data' in o && !(key && key in o)) return o.data as T
  }
  return json as T
}

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string; message?: string }
    if (j.error || j.message) return String(j.error || j.message)
  } catch { /* not json */ }
  if (res.status === 401) return 'Your session has ended. Sign in again.'
  if (res.status === 403) return "You don't have access to this."
  if (res.status === 404) return "We couldn't find that."
  if (res.status === 429) return 'Too many requests. Wait a moment and try again.'
  return 'Something went wrong. Try again.'
}

export async function atsGet<T>(url: string, key?: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { credentials: 'include', cache: 'no-store', signal })
  if (!res.ok) throw new AtsError(await readError(res), res.status)
  return unwrap<T>(await res.json(), key)
}

/** POST/PATCH/DELETE with JSON (or FormData) through csrfFetch. */
export async function atsSend<T = unknown>(
  url: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
  key?: string,
): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  const res = await csrfFetch(url, {
    method,
    headers: isForm || body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  })
  if (!res.ok) throw new AtsError(await readError(res), res.status)
  const text = await res.text()
  if (!text) return undefined as T
  try {
    return unwrap<T>(JSON.parse(text), key)
  } catch {
    return undefined as T
  }
}

export interface AtsQuery<T> {
  data: T | null
  error: AtsError | null
  loading: boolean
  reload: () => void
  setData: (updater: (prev: T | null) => T | null) => void
}

/** GET hook; pass `null` to skip. Keeps the last data while reloading. */
export function useAts<T>(url: string | null, key?: string): AtsQuery<T> {
  const [data, setDataState] = useState<T | null>(null)
  const [error, setError] = useState<AtsError | null>(null)
  const [loading, setLoading] = useState<boolean>(!!url)
  const [tick, setTick] = useState(0)
  const keyRef = useRef(key)
  keyRef.current = key

  useEffect(() => {
    if (!url) { setLoading(false); return }
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    atsGet<T>(url, keyRef.current, ctrl.signal)
      .then((d) => setDataState(d))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return
        setError(e instanceof AtsError ? e : new AtsError('Check your connection and try again.', 0))
      })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [url, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  const setData = useCallback((u: (prev: T | null) => T | null) => setDataState((p) => u(p)), [])
  return { data, error, loading, reload, setData }
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong. Try again.'
}
