'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { csrfFetch } from '@/lib/csrf-fetch'
import type { ProposalBundle, ProposedAction } from '@/lib/agent/contract'
import type { AgentLoopEvent } from '@/lib/agent/run'
import { applyEvent, itemsFromMessages } from './transcript'
import { useAdminT } from '@/lib/i18n/admin'
import { useApiError } from '@/lib/i18n/use-api-error'
import type { ActionMap, AgentStatus, BundleMap, ConversationSummary, StoredMessage, UiItem } from './types'

type StreamEvent =
  | AgentLoopEvent
  | { type: 'conversation'; id: string; title: string; created: boolean; tenantId?: string | null }
  | { type: 'model'; provider: string; model: string }

type ApiErr = (body: unknown, fallback?: string) => string

/** SEO-044: API errors go through useApiError (code + params → the admin's language). */
async function errorOf(res: Response, apiError: ApiErr, fallback: string): Promise<string> {
  try {
    return apiError(await res.json(), fallback)
  } catch {
    return fallback
  }
}

export function useAgentChat() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [items, setItems] = useState<UiItem[]>([])
  const [actions, setActions] = useState<ActionMap>({})
  const [bundles, setBundles] = useState<BundleMap>({})
  const [loadingConv, setLoadingConv] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [liveModel, setLiveModel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Superadmin tenant picker (null = whole platform). Ignored for tenant admins. */
  const [scope, setScope] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const activeRef = useRef<string | null>(null)
  activeRef.current = activeId
  const isSuper = status?.role === 'superadmin'
  const { t } = useAdminT()
  const apiError = useApiError()
  // Refs so the callbacks below keep stable identities when the language catalog loads.
  const i18n = useRef({ t, apiError })
  i18n.current = { t, apiError }

  const refreshList = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/agent/conversations', { credentials: 'include', cache: 'no-store' })
      if (r.ok) setConversations(((await r.json()) as { conversations: ConversationSummary[] }).conversations ?? [])
    } finally {
      setLoadingList(false)
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/agent/status', { credentials: 'include', cache: 'no-store' })
      if (r.ok) setStatus((await r.json()) as AgentStatus)
    } catch { /* indicator only */ }
  }, [])

  useEffect(() => {
    void refreshList()
    void refreshStatus()
  }, [refreshList, refreshStatus])

  const open = useCallback(async (id: string | null) => {
    abortRef.current?.abort()
    setError(null)
    setActiveId(id)
    setItems([])
    setActions({})
    setBundles({})
    if (!id) return
    setLoadingConv(true)
    try {
      const r = await fetch(`/api/admin/agent/conversations/${encodeURIComponent(id)}`, { credentials: 'include', cache: 'no-store' })
      if (!r.ok) {
        setError(await errorOf(r, i18n.current.apiError, i18n.current.t('copilot.requestFailed')))
        return
      }
      const d = (await r.json()) as { conversation?: { tenant_id?: string | null }; messages: StoredMessage[]; actions: ProposedAction[]; bundles?: ProposalBundle[] }
      if (activeRef.current !== id) return
      if (d.conversation && 'tenant_id' in d.conversation) setScope(d.conversation.tenant_id ?? null)
      setItems(itemsFromMessages(d.messages ?? []))
      setActions(Object.fromEntries((d.actions ?? []).map((a) => [a.id, a])))
      setBundles(Object.fromEntries((d.bundles ?? []).map((b) => [b.id, b])))
    } catch {
      setError(i18n.current.t('copilot.loadConvFailed'))
    } finally {
      setLoadingConv(false)
    }
  }, [])

  const send = useCallback(async (text: string) => {
    const message = text.trim()
    if (!message || streaming) return
    setError(null)
    const ac = new AbortController()
    abortRef.current = ac
    const userId = `u-${Date.now()}`
    const asstId = `a-${Date.now()}`
    setItems((prev) => [...prev, { kind: 'user', id: userId, text: message }, { kind: 'assistant', id: asstId, parts: [], streaming: true }])
    setStreaming(true)

    const update = (fn: (it: Extract<UiItem, { kind: 'assistant' }>) => Extract<UiItem, { kind: 'assistant' }>) =>
      setItems((prev) => prev.map((it) => (it.id === asstId && it.kind === 'assistant' ? fn(it) : it)))

    try {
      const res = await csrfFetch('/api/admin/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversationId: activeRef.current, ...(isSuper ? { tenantId: scope ?? 'platform' } : {}) }),
        signal: ac.signal,
      })
      if (!res.ok || !res.body) {
        const msg = res.status === 402 ? i18n.current.t('copilot.outOfCredits') : await errorOf(res, i18n.current.apiError, i18n.current.t('copilot.requestFailed'))
        // 429 carries the budget / rate-limit reason from the server.
        update((it) => ({ ...it, streaming: false, error: msg }))
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          let ev: StreamEvent
          try {
            ev = JSON.parse(line) as StreamEvent
          } catch {
            continue
          }
          if (ev.type === 'conversation') {
            activeRef.current = ev.id
            setActiveId(ev.id)
            if (ev.created) setConversations((prev) => [{ id: ev.id, title: ev.title, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...(ev.tenantId !== undefined ? { tenant_id: ev.tenantId } : {}) }, ...prev])
          } else if (ev.type === 'model') {
            setLiveModel(ev.model)
          } else {
            if (ev.type === 'proposal') setActions((prev) => ({ ...prev, [ev.action.id]: ev.action }))
            if (ev.type === 'subagent_event' && ev.event.type === 'proposal') {
              const a = ev.event.action
              setActions((prev) => ({ ...prev, [a.id]: a }))
            }
            if (ev.type === 'bundle') setBundles((prev) => ({ ...prev, [ev.bundle.id]: ev.bundle }))
            const e = ev
            update((it) => applyEvent(it, e))
          }
        }
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') update((it) => ({ ...it, error: i18n.current.t('copilot.connectionDropped') }))
    } finally {
      update((it) => ({ ...it, streaming: false }))
      setStreaming(false)
      abortRef.current = null
      void refreshStatus()
      void refreshList()
    }
  }, [streaming, refreshList, refreshStatus, isSuper, scope])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const actOn = useCallback(async (id: string, verb: 'confirm' | 'cancel'): Promise<string | null> => {
    const r = await csrfFetch(`/api/admin/agent/actions/${encodeURIComponent(id)}/${verb}`, { method: 'POST' })
    const d = (await r.json().catch(() => ({}))) as { action?: ProposedAction; error?: string }
    if (d.action) setActions((prev) => ({ ...prev, [id]: d.action! }))
    return r.ok ? null : i18n.current.apiError(d, i18n.current.t('copilot.requestFailed'))
  }, [])

  /** Confirm / cancel a whole bundle: steps run in order and stop at the first failure. */
  const actOnBundle = useCallback(async (id: string, verb: 'confirm' | 'cancel'): Promise<string | null> => {
    const r = await csrfFetch(`/api/admin/agent/bundles/${encodeURIComponent(id)}/${verb}`, { method: 'POST' })
    const d = (await r.json().catch(() => ({}))) as { bundle?: ProposalBundle; actions?: ProposedAction[]; error?: string }
    if (d.bundle) setBundles((prev) => ({ ...prev, [id]: d.bundle! }))
    if (d.actions?.length) setActions((prev) => ({ ...prev, ...Object.fromEntries(d.actions!.map((a) => [a.id, a])) }))
    if (verb === 'confirm') void refreshStatus()
    return r.ok ? null : i18n.current.apiError(d, i18n.current.t('copilot.requestFailed'))
  }, [refreshStatus])

  /** The tool's parameter schema + editable args of a pending proposal (AGT-005 form editor). */
  const loadEditForm = useCallback(async (id: string): Promise<{ schema: Record<string, unknown> | null; args: Record<string, unknown> } | string> => {
    const r = await fetch(`/api/admin/agent/actions/${encodeURIComponent(id)}`, { credentials: 'include', cache: 'no-store' })
    const d = (await r.json().catch(() => ({}))) as { schema?: Record<string, unknown> | null; editable_args?: Record<string, unknown>; error?: string }
    if (!r.ok) return i18n.current.apiError(d, i18n.current.t('copilot.requestFailed'))
    return { schema: d.schema ?? null, args: d.editable_args ?? {} }
  }, [])

  const editArgs = useCallback(async (id: string, args: Record<string, unknown>): Promise<string | null> => {
    const r = await csrfFetch(`/api/admin/agent/actions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args }),
    })
    const d = (await r.json().catch(() => ({}))) as { action?: ProposedAction; error?: string }
    if (d.action) setActions((prev) => ({ ...prev, [id]: d.action! }))
    void refreshStatus()
    return r.ok ? null : i18n.current.apiError(d, i18n.current.t('copilot.requestFailed'))
  }, [refreshStatus])

  const rename = useCallback(async (id: string, title: string) => {
    const r = await csrfFetch(`/api/admin/agent/conversations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    if (r.ok) setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: title.trim() } : c)))
    return r.ok
  }, [])

  const remove = useCallback(async (id: string) => {
    const r = await csrfFetch(`/api/admin/agent/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (r.ok) {
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeRef.current === id) void open(null)
    }
    return r.ok
  }, [open])

  return {
    conversations, loadingList, activeId, items, actions, bundles, loadingConv, streaming, status, liveModel, error,
    isSuper, scope, setScope,
    open, send, stop, confirm: (id: string) => actOn(id, 'confirm'), cancel: (id: string) => actOn(id, 'cancel'),
    confirmBundle: (id: string) => actOnBundle(id, 'confirm'), cancelBundle: (id: string) => actOnBundle(id, 'cancel'),
    loadEditForm, editArgs, rename, remove, refreshStatus,
  }
}
