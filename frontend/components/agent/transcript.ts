/**
 * Pure helpers for the copilot UI: stored messages → chat items, stream
 * events → item updates, and human labels for tool steps.
 */
import type { AgentEvent, KnowledgeHit } from '@/lib/agent/contract'
import type { StoredMessage, UiItem, UiPart } from './types'

/** Rebuild chat items from stored messages (assistant + tool messages fold into one item per turn). */
export function itemsFromMessages(messages: StoredMessage[]): UiItem[] {
  const items: UiItem[] = []
  let current: Extract<UiItem, { kind: 'assistant' }> | null = null
  for (const m of messages) {
    if (m.role === 'user') {
      current = null
      items.push({ kind: 'user', id: m.id, text: m.content })
      continue
    }
    if (!current) {
      current = { kind: 'assistant', id: m.id, parts: [] }
      items.push(current)
    }
    if (m.role === 'assistant') {
      if (m.content) appendText(current.parts, m.content, true)
      for (const c of m.tool_calls ?? []) current.parts.push({ type: 'step', id: c.id, tool: c.tool, args: c.args, status: 'error', summary: 'Stopped' })
    } else {
      const step = current.parts.find((p): p is Extract<UiPart, { type: 'step' }> => p.type === 'step' && p.id === m.tool_call_id)
      if (step) {
        step.status = m.ok === false ? 'error' : 'ok'
        step.summary = m.summary || (m.ok === false ? 'Failed' : 'Done')
        step.citations = m.citations?.length ? m.citations : undefined
        step.actionId = m.action_id
      }
    }
  }
  return items
}

function appendText(parts: UiPart[], text: string, newBlock = false) {
  const last = parts[parts.length - 1]
  if (!newBlock && last?.type === 'text') last.text += text
  else if (newBlock && last?.type === 'text') last.text += `\n\n${text}`
  else parts.push({ type: 'text', text })
}

/** Apply one stream event to the streaming assistant item (returns a new item). */
export function applyEvent(item: Extract<UiItem, { kind: 'assistant' }>, e: AgentEvent): Extract<UiItem, { kind: 'assistant' }> {
  const parts = item.parts.map((p) => ({ ...p })) as UiPart[]
  switch (e.type) {
    case 'text':
      appendText(parts, e.delta)
      break
    case 'tool_call':
      parts.push({ type: 'step', id: e.id, tool: e.tool, args: e.args, status: 'running' })
      break
    case 'tool_result': {
      const s = parts.find((p): p is Extract<UiPart, { type: 'step' }> => p.type === 'step' && p.id === e.id)
      if (s) {
        s.status = e.ok ? 'ok' : 'error'
        s.summary = e.summary
        s.citations = e.citations?.length ? e.citations : undefined
      }
      break
    }
    case 'proposal': {
      const s = [...parts].reverse().find((p): p is Extract<UiPart, { type: 'step' }> => p.type === 'step' && p.tool === e.action.tool && !p.actionId)
      if (s) s.actionId = e.action.id
      break
    }
    case 'error':
      return { ...item, parts, error: e.message }
    case 'done':
      return { ...item, parts, streaming: false }
  }
  return { ...item, parts }
}

/** Unique citations across an assistant item's steps. */
export function citationsOf(parts: UiPart[]): KnowledgeHit[] {
  const seen = new Set<string>()
  const out: KnowledgeHit[] = []
  for (const p of parts) {
    if (p.type !== 'step') continue
    for (const c of p.citations ?? []) {
      const key = `${c.source_type}:${c.source_id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(c)
    }
  }
  return out
}

const humanize = (s: string) => s.replace(/[_-]+/g, ' ').trim()

function argText(args: unknown): string {
  if (!args || typeof args !== 'object') return ''
  const a = args as Record<string, unknown>
  for (const k of ['query', 'q', 'search', 'title', 'name', 'email', 'test_id', 'id']) {
    if (typeof a[k] === 'string' && a[k]) {
      const v = (a[k] as string).trim()
      return v.length > 60 ? `${v.slice(0, 57)}…` : v
    }
  }
  return ''
}

/** "Searched knowledge for “java”", "Looked up test", "Drafted create test". */
export function stepLabel(tool: string, args: unknown, running: boolean): string {
  const q = argText(args)
  const quoted = q ? ` “${q}”` : ''
  if (/^search_knowledge$|^search_docs$|knowledge/.test(tool)) {
    return `${running ? 'Searching' : 'Searched'} knowledge${q ? ` for “${q}”` : ''}`
  }
  const m = tool.match(/^(get|lookup|find|search|list|count|summari[sz]e|draft|create|update|send|publish|release|delete|invite|schedule|remind|shortlist|record|revoke|assign)_(.+)$/)
  if (!m) return `${running ? 'Running' : 'Ran'} ${humanize(tool)}${quoted}`
  const [, verb, rest] = m
  const object = humanize(rest)
  const map: Record<string, [string, string]> = {
    get: ['Looking up', 'Looked up'],
    lookup: ['Looking up', 'Looked up'],
    find: ['Finding', 'Found'],
    search: ['Searching', 'Searched'],
    list: ['Listing', 'Listed'],
    count: ['Counting', 'Counted'],
    summarise: ['Summarising', 'Summarised'],
    summarize: ['Summarising', 'Summarised'],
  }
  if (map[verb]) return `${map[verb][running ? 0 : 1]} ${object}${quoted}`
  // Write tools only ever draft.
  return `${running ? 'Drafting' : 'Drafted'}: ${humanize(verb)} ${object}${quoted}`
}
