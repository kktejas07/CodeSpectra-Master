/**
 * Pure helpers for the copilot UI: stored messages → chat items, stream
 * events → item updates, and human labels for tool steps. Loop v2 adds the
 * plan checklist, clarifying questions, sub-agent (specialist) steps, bundles,
 * retries and the self-check revision.
 */
import type { KnowledgeHit } from '@/lib/agent/contract'
import type { AgentLoopEvent } from '@/lib/agent/run'
import type { StoredMessage, UiItem, UiPart, UiStep } from './types'

type Assistant = Extract<UiItem, { kind: 'assistant' }>

/** Control tools never show as steps (the plan, question and bundle have their own UI). */
const HIDDEN_STEP_TOOLS = new Set(['plan_steps', 'ask_clarifying_question'])

const SPECIALIST_LABEL: Record<string, string> = {
  hiring: 'Hiring specialist', assessments: 'Assessments specialist', events: 'Events specialist', marketplace: 'Marketplace specialist',
  content: 'Content specialist', automations: 'Automations specialist', analytics: 'Analytics specialist',
}

/** Rebuild chat items from stored messages (assistant + tool messages fold into one item per turn). */
export function itemsFromMessages(messages: StoredMessage[]): UiItem[] {
  const items: UiItem[] = []
  let current: Assistant | null = null
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
      if (m.plan?.length) current.plan = m.plan
      if (m.clarify) current.parts.push({ type: 'clarify', id: m.id, question: m.clarify.question, ...(m.clarify.options ? { options: m.clarify.options } : {}) })
      else if (m.content) appendText(current.parts, m.content, true)
      for (const c of m.tool_calls ?? []) {
        if (HIDDEN_STEP_TOOLS.has(c.tool)) continue
        current.parts.push({ type: 'step', id: c.id, tool: c.tool, args: c.args, status: 'error', summary: 'Stopped', ...(c.tool === 'delegate_to_specialist' ? { agent: agentOf(c.args) } : {}) })
      }
    } else {
      const step = current.parts.find((p): p is UiStep => p.type === 'step' && p.id === m.tool_call_id)
      if (step) {
        step.status = m.ok === false ? 'error' : 'ok'
        step.summary = m.summary || (m.ok === false ? 'Failed' : 'Done')
        step.citations = m.citations?.length ? m.citations : undefined
        step.actionId = m.action_id
        if (m.action_ids?.length) step.actionIds = m.action_ids
        if (m.bundle_id) step.bundleId = m.bundle_id
      }
    }
  }
  return items
}

function agentOf(args: unknown): UiStep['agent'] {
  const a = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>
  const id = typeof a.specialist === 'string' ? a.specialist : 'specialist'
  return { id, label: SPECIALIST_LABEL[id] ?? 'Specialist', ...(typeof a.task === 'string' ? { task: a.task.slice(0, 200) } : {}) }
}

function appendText(parts: UiPart[], text: string, newBlock = false) {
  const last = parts[parts.length - 1]
  if (!newBlock && last?.type === 'text') last.text += text
  else if (newBlock && last?.type === 'text') last.text += `\n\n${text}`
  else parts.push({ type: 'text', text })
}

function cloneParts(parts: UiPart[]): UiPart[] {
  return parts.map((p) => (p.type === 'step' ? { ...p, ...(p.children ? { children: p.children.map((c) => ({ ...c })) } : {}) } : { ...p })) as UiPart[]
}

/** Apply a step-level event to a list of steps (shared by the main item and sub-agent children). */
function applyStepEvent(steps: UiStep[], e: AgentLoopEvent): boolean {
  switch (e.type) {
    case 'tool_call':
      if (HIDDEN_STEP_TOOLS.has(e.tool)) return true
      steps.push({ type: 'step', id: e.id, tool: e.tool, args: e.args, status: 'running', ...(e.tool === 'delegate_to_specialist' ? { agent: agentOf(e.args), children: [] } : {}) })
      return true
    case 'tool_result': {
      const s = steps.find((p) => p.id === e.id)
      if (s) {
        s.status = e.ok ? 'ok' : 'error'
        s.summary = e.summary
        s.citations = e.citations?.length ? e.citations : undefined
      }
      return true
    }
    case 'proposal': {
      const s = [...steps].reverse().find((p) => p.tool === e.action.tool && !p.actionId && p.status !== 'error')
      if (s && !e.action.bundle_id) s.actionId = e.action.id
      return true
    }
    case 'retry': {
      if (e.what === 'tool') {
        const s = [...steps].reverse().find((p) => p.tool === e.tool && p.status === 'running')
        if (s) s.retries = e.attempt
      }
      return true
    }
    default:
      return false
  }
}

/** Apply one stream event to the streaming assistant item (returns a new item). */
export function applyEvent(item: Assistant, e: AgentLoopEvent): Assistant {
  const parts = cloneParts(item.parts)
  const steps = () => parts.filter((p): p is UiStep => p.type === 'step')
  switch (e.type) {
    case 'text':
      appendText(parts, e.delta)
      break
    case 'tool_call': {
      if (HIDDEN_STEP_TOOLS.has(e.tool)) break
      parts.push({ type: 'step', id: e.id, tool: e.tool, args: e.args, status: 'running', ...(e.tool === 'delegate_to_specialist' ? { agent: agentOf(e.args), children: [] } : {}) })
      break
    }
    case 'tool_result':
    case 'retry': {
      const all = steps()
      applyStepEvent(all, e)
      break
    }
    case 'proposal': {
      if (e.action.bundle_id) {
        // Bundled drafts render inside their bundle card.
        const s = [...steps()].reverse().find((p) => p.tool === 'propose_bundle')
        if (s) s.actionIds = [...new Set([...(s.actionIds ?? []), e.action.id])]
        break
      }
      applyStepEvent(steps(), e)
      break
    }
    case 'bundle': {
      const s = [...steps()].reverse().find((p) => p.tool === 'propose_bundle' && !p.bundleId)
      if (s) {
        s.bundleId = e.bundle.id
        s.actionIds = e.bundle.action_ids
      }
      break
    }
    case 'subagent_event': {
      const parent = steps().find((p) => p.id === e.parent)
      if (!parent) break
      const children = parent.children ?? (parent.children = [])
      const inner = e.event
      if (inner.type === 'proposal') {
        parent.actionIds = [...new Set([...(parent.actionIds ?? []), inner.action.id])]
      }
      applyStepEvent(children, inner)
      break
    }
    case 'subagent':
      break
    case 'plan':
      return { ...item, parts, plan: e.steps.map((s) => ({ ...s })) }
    case 'clarify':
      parts.push({ type: 'clarify', id: e.id, question: e.question, ...(e.options ? { options: e.options } : {}) })
      break
    case 'revise': {
      // Self-check: drop the answer text streamed since the last step; the corrected answer follows.
      while (parts.length && parts[parts.length - 1].type === 'text') parts.pop()
      return { ...item, parts, revised: true }
    }
    case 'self_check':
      break
    case 'error':
      return { ...item, parts, error: e.message }
    case 'done':
      return { ...item, parts, streaming: false }
  }
  return { ...item, parts }
}

/** Unique citations across an assistant item's steps (incl. sub-agent steps). */
export function citationsOf(parts: UiPart[]): KnowledgeHit[] {
  const seen = new Set<string>()
  const out: KnowledgeHit[] = []
  const visit = (s: UiStep) => {
    for (const c of s.citations ?? []) {
      const key = `${c.source_type}:${c.source_id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(c)
    }
    for (const ch of s.children ?? []) visit(ch)
  }
  for (const p of parts) if (p.type === 'step') visit(p)
  return out
}

/** Every proposal id referenced by an item's steps, in order (own, sub-agent, bundle). */
export function actionIdsOf(steps: UiStep[]): string[] {
  const out: string[] = []
  for (const s of steps) {
    if (s.actionId) out.push(s.actionId)
    if (!s.bundleId) for (const id of s.actionIds ?? []) out.push(id)
  }
  return [...new Set(out)]
}

const humanize = (s: string) => s.replace(/[_-]+/g, ' ').trim()

function argText(args: unknown): string {
  if (!args || typeof args !== 'object') return ''
  const a = args as Record<string, unknown>
  for (const k of ['query', 'q', 'search', 'title', 'name', 'email', 'task', 'test_id', 'job_id', 'application_id', 'id']) {
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
  if (tool === 'delegate_to_specialist') {
    const a = agentOf(args)
    return `${running ? 'Asking' : 'Asked'} the ${a?.label.toLowerCase() ?? 'specialist'}`
  }
  if (tool === 'propose_bundle') return `${running ? 'Drafting' : 'Drafted'} a bundle${quoted}`
  if (/^search_knowledge$|^search_docs$|knowledge/.test(tool)) {
    return `${running ? 'Searching' : 'Searched'} knowledge${q ? ` for “${q}”` : ''}`
  }
  const m = tool.match(/^(get|lookup|find|search|list|count|summari[sz]e|draft|create|update|send|publish|release|delete|invite|schedule|remind|shortlist|record|revoke|assign|move|reject|start|set|moderate|decide|generate|rerun)_(.+)$/)
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
