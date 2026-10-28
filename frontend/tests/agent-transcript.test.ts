/** Copilot UI transcript helpers: stored messages → items, stream events, step labels. */
import { describe, it, expect } from 'vitest'
import { applyEvent, citationsOf, itemsFromMessages, stepLabel } from '@/components/agent/transcript'
import type { StoredMessage, UiItem } from '@/components/agent/types'

const hit = { chunk_id: 'c', source_type: 'doc' as const, source_id: 'd1', title: 'Help', url: '/docs/x', snippet: 's', score: 1 }

describe('transcript', () => {
  it('folds assistant + tool messages into one item per turn', () => {
    const msgs: StoredMessage[] = [
      { id: '1', role: 'user', content: 'hi', created_at: '' },
      { id: '2', role: 'assistant', content: 'Looking', tool_calls: [{ id: 't1', tool: 'search_knowledge', args: { query: 'java' } }, { id: 't2', tool: 'create_test', args: {} }], created_at: '' },
      { id: '3', role: 'tool', content: '', tool_call_id: 't1', ok: true, summary: '3 results', citations: [hit], created_at: '' },
      { id: '4', role: 'tool', content: '', tool_call_id: 't2', ok: true, summary: 'Draft ready', action_id: 'a1', created_at: '' },
      { id: '5', role: 'assistant', content: 'Done.', created_at: '' },
      { id: '6', role: 'user', content: 'thanks', created_at: '' },
    ]
    const items = itemsFromMessages(msgs)
    expect(items.map((i) => i.kind)).toEqual(['user', 'assistant', 'user'])
    const a = items[1] as Extract<UiItem, { kind: 'assistant' }>
    expect(a.parts.map((p) => p.type)).toEqual(['text', 'step', 'step', 'text'])
    expect(a.parts[2]).toMatchObject({ status: 'ok', actionId: 'a1' })
    expect(citationsOf(a.parts)).toEqual([hit])
  })

  it('applies stream events', () => {
    let it0: Extract<UiItem, { kind: 'assistant' }> = { kind: 'assistant', id: 'x', parts: [], streaming: true }
    it0 = applyEvent(it0, { type: 'text', delta: 'Hel' })
    it0 = applyEvent(it0, { type: 'text', delta: 'lo' })
    it0 = applyEvent(it0, { type: 'tool_call', id: 't', tool: 'list_tests', args: {} })
    it0 = applyEvent(it0, { type: 'tool_result', id: 't', tool: 'list_tests', ok: false, summary: 'Not allowed' })
    it0 = applyEvent(it0, { type: 'done' })
    expect(it0.parts).toEqual([
      { type: 'text', text: 'Hello' },
      { type: 'step', id: 't', tool: 'list_tests', args: {}, status: 'error', summary: 'Not allowed', citations: undefined },
    ])
    expect(it0.streaming).toBe(false)
  })

  it('labels steps in plain words', () => {
    expect(stepLabel('search_knowledge', { query: 'java' }, false)).toBe('Searched knowledge for “java”')
    expect(stepLabel('search_knowledge', { query: 'java' }, true)).toBe('Searching knowledge for “java”')
    expect(stepLabel('get_test', { test_id: 'abc' }, false)).toBe('Looked up test “abc”')
    expect(stepLabel('create_hackathon', {}, false)).toBe('Drafted: create hackathon')
    expect(stepLabel('whoami', {}, false)).toBe('Ran whoami')
  })
})
