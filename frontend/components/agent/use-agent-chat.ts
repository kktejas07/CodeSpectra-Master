'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { csrfFetch } from '@/lib/csrf-fetch'
import type { AgentEvent, ProposedAction } from '@/lib/agent/contract'
import { applyEvent, itemsFromMessages } from './transcript'
import type { ActionMap, AgentStatus, ConversationSummary, StoredMessage, UiItem } from './types'

type StreamEvent =
  | AgentEvent
  | { type: 'conversation'; id: string; title: string; created: boolean }
  | { type: 'model'; provider: string; model: string }

async function errorOf(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string }
    return j.error || `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

export function useAgentChat() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [items, setItems] = useState<UiItem[]>([])
  const [actions, setActions] = useState<ActionMap>({})
  const [loadingConv, setLoadingConv] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [liveModel, setLiveModel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const activeRef = useRef<string | null>(null)
  activeRef.current = activeId

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
    if (!id) return
    setLoadingConv(true)
    try {
      const r = await fetch(`/api/admin/agent/conversations/${encodeURIComponent(id)}`, { credentials: 'include', cache: 'no-store' })
      if (!r.ok) {
        setError(await errorOf(r))
        return
      }
      const d = (await r.json()) as { messages: StoredMessage[]; actions: ProposedAction[] }
      if (activeRef.current !== id) return
      setItems(itemsFromMessages(d.messages ?? []))
      setActions(Object.fromEntries((d.actions ?? []).map((a) => [a.id, a])))
    } catch {
      setError('Could not load this conversation.')
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
        body: JSON.stringify({ message, conversationId: activeRef.current }),
        signal: ac.signal,
      })
      if (!res.ok || !res.body) {
        const msg = res.status === 402 ? 'You are out of AI credits. They refresh with your plan each month.' : await errorOf(res)
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
            if (ev.created) setConversations((prev) => [{ id: ev.id, title: ev.title, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...prev])
          } else if (ev.type === 'model') {
            setLiveModel(ev.model)
          } else {
            if (ev.type === 'proposal') setActions((prev) => ({ ...prev, [ev.action.id]: ev.action }))
            const e = ev
            update((it) => applyEvent(it, e))
          }
        }
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') update((it) => ({ ...it, error: 'The connection dropped. Try again.' }))
    } finally {
      update((it) => ({ ...it, streaming: false }))
      setStreaming(false)
      abortRef.current = null
      void refreshStatus()
      void refreshList()
    }
  }, [streaming, refreshList, refreshStatus])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const actOn = useCallback(async (id: string, verb: 'confirm' | 'cancel'): Promise<string | null> => {
    const r = await csrfFetch(`/api/admin/agent/actions/${encodeURIComponent(id)}/${verb}`, { method: 'POST' })
    const d = (await r.json().catch(() => ({}))) as { action?: ProposedAction; error?: string }
    if (d.action) setActions((prev) => ({ ...prev, [id]: d.action! }))
    return r.ok ? null : d.error || `Request failed (${r.status})`
  }, [])

  const editArgs = useCallback(async (id: string, args: Record<string, unknown>): Promise<string | null> => {
    const r = await csrfFetch(`/api/admin/agent/actions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args }),
    })
    const d = (await r.json().catch(() => ({}))) as { action?: ProposedAction; error?: string }
    if (d.action) setActions((prev) => ({ ...prev, [id]: d.action! }))
    return r.ok ? null : d.error || `Request failed (${r.status})`
  }, [])

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
    conversations, loadingList, activeId, items, actions, loadingConv, streaming, status, liveModel, error,
    open, send, stop, confirm: (id: string) => actOn(id, 'confirm'), cancel: (id: string) => actOn(id, 'cancel'),
    editArgs, rename, remove,
  }
}
