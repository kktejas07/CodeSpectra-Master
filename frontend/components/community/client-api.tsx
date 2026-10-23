'use client'

/**
 * Client helpers for the cohort / community / connected-apps screens:
 * JSON calls through csrfFetch that keep the error body, and a hook that
 * shows an error in the user's language (feature codes from the `community`
 * catalog's err_<code>, shared codes from apiErrors, else the server text).
 */
import { useCallback } from 'react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import { cn } from '@/lib/utils'

export class ApiFailure extends Error {
  constructor(public body: { error?: string; code?: string; params?: Record<string, string | number> } | null, public status: number) {
    super(body?.error || `Request failed (${status})`)
  }
}

export async function call<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await csrfFetch(path, {
    method: init.method || (init.body !== undefined || init.form ? 'POST' : 'GET'),
    headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiFailure(data, res.status)
  return data as T
}

export function useErrorText(): (e: unknown) => string {
  const { td } = useT()
  const apiError = useApiError()
  return useCallback((e: unknown) => {
    const body = e instanceof ApiFailure ? e.body : null
    const fallback = apiError(body ?? { error: e instanceof Error ? e.message : undefined })
    if (body?.code) return td(`community.err_${body.code}`, fallback, body.params)
    return fallback
  }, [td, apiError])
}

export const fieldClass = 'h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40'
export const areaClass = 'min-h-[120px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40'

export function Field({ id, label, hint, children, className }: { id: string; label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-3xl bg-muted motion-reduce:animate-none', className || 'h-40')} />
}

export function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null
  return <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{text}</p>
}
