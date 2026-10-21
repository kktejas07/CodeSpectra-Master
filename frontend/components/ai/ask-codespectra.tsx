'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Sparkles, Send, X, Loader2, MessageSquarePlus, Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useT } from '@/lib/i18n/client'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  pending?: boolean
}

type ContextMode = 'none' | 'rag'

/**
 * Ask CodeSpectra — floating AI assistant sidebar. Streams responses from
 * `/api/ai/chat` (SSE). Persists chat history server-side in MongoDB.
 */
export function AskCodeSpectra() {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [contextMode, setContextMode] = useState<ContextMode>('rag')
  const sidebarRef = useRef<HTMLElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (
        sidebarRef.current &&
        !sidebarRef.current.contains(target) &&
        !target.closest('[data-testid="ask-codespectra-launcher"]')
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, open])

  const newChat = useCallback(() => {
    setMessages([])
    setSessionId(null)
  }, [])

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text }
    const placeholder: ChatMessage = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: '',
      pending: true,
    }
    setMessages((m) => [...m, userMsg, placeholder])
    setBusy(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await csrfFetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: text, context_mode: contextMode }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({ error: 'request failed' }))
        throw new Error(j.error || (res.status === 429 ? t('dash.tooManyRequestsWaitAMoment928') : t('dash.somethingWentWrongStatusPleaseTryb1e', { status: res.status })))
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let acc = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const events = buf.split('\n\n')
        buf = events.pop() || ''
        for (const ev of events) {
          const line = ev.trim()
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') continue
          try {
            const parsed = JSON.parse(payload) as {
              delta?: string
              session_id?: string
              error?: string
            }
            if (parsed.session_id && !sessionId) setSessionId(parsed.session_id)
            if (parsed.error) {
              acc += `\n\n[error] ${parsed.error}`
            } else if (parsed.delta) {
              acc += parsed.delta
            }
            setMessages((all) =>
              all.map((m) =>
                m.id === placeholder.id ? { ...m, content: acc, pending: false } : m,
              ),
            )
          } catch {
            /* ignore malformed SSE chunk */
          }
        }
      }
    } catch (e) {
      const errText = e instanceof Error ? e.message : String(e)
      setMessages((all) =>
        all.map((m) =>
          m.id === placeholder.id
            ? { ...m, content: `Sorry — ${errText}`, pending: false }
            : m,
        ),
      )
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  return (
    <>
      {/* Floating launcher */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="ask-codespectra-launcher"
        className={cn(
          'fixed bottom-5 right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full',
          'bg-linear-to-br from-primary to-primary/70 text-primary-foreground shadow-lg',
          'transition-transform hover:scale-105 active:scale-95',
          open && 'translate-x-20 opacity-0 pointer-events-none',
        )}
        aria-label={t('dash.openAskCodespectra')}
      >
        <Sparkles className="h-5 w-5" />
      </button>

      {/* Slide-out sidebar */}
      <aside
        ref={sidebarRef}
        className={cn(
          'fixed right-0 top-0 z-40 flex flex-col h-dvh w-full max-w-md border-l border-border bg-card/95 backdrop-blur-md shadow-2xl',
          'transition-transform duration-200',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!open}
        data-testid="ask-codespectra-panel"
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">{t('dash.askCodespectra')}</div>
              <div className="text-xs font-medium text-muted-foreground">{t('dash.aiCodeAssistantAnswersFromYour080')}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={newChat}
              title={t('dash.newChat')}
              aria-label={t('dash.newChat')}
              data-testid="chat-new"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              title={t('common.close')}
              aria-label={t('dash.closeChat')}
              data-testid="chat-close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Context toggle */}
        <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2 text-xs">
          <Database className="h-3.5 w-3.5 text-muted-foreground" />
          <button
            type="button"
            onClick={() => setContextMode('rag')}
            data-testid="ctx-rag"
            className={cn(
              'rounded px-2 py-0.5 transition',
              contextMode === 'rag'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >{t('dash.useMyRecentScans')}</button>
          <button
            type="button"
            onClick={() => setContextMode('none')}
            data-testid="ctx-none"
            className={cn(
              'rounded px-2 py-0.5 transition',
              contextMode === 'none'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >{t('dash.generic')}</button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4"
          data-testid="chat-messages"
        >
          {messages.length === 0 && (
            <EmptyState onPick={(prompt) => setInput(prompt)} />
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
          className="border-t border-border bg-card/95 px-3 py-3"
        >
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder={t('dash.askAnythingDebugExplainRefactor')}
              rows={2}
              className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              data-testid="chat-input"
              disabled={busy}
            />
            <Button
              type="submit"
              size="icon"
              disabled={busy || !input.trim()}
              aria-label={busy ? t('dash.sending') : t('dash.sendMessage')}
              data-testid="chat-send"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </form>
      </aside>
    </>
  )
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  const { t } = useT()
  const examples = [
    'Explain my most recent code scan in plain English',
    'Refactor this for readability: paste code…',
    'What edge cases am I missing in my last submission?',
    'Generate a unit-test suite for the snippet above',
  ]
  return (
    <div className="space-y-3 text-center pt-6">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="h-5 w-5" />
      </div>
      <p className="text-sm text-foreground">{t('dash.hiHowCanIHelpWithedb')}</p>
      <p className="text-xs text-muted-foreground">{t('dash.tryOneOfTheseStartersOr2b9')}</p>
      <div className="space-y-2 pt-2">
        {examples.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="block w-full rounded-md border border-border bg-background/50 px-3 py-2 text-left text-xs hover:border-primary/40 hover:bg-primary/5"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const { t } = useT()
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap wrap-break-word',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted/60 text-foreground border border-border/60',
        )}
        data-testid={isUser ? 'msg-user' : 'msg-assistant'}
      >
        {message.content || (message.pending ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />{' '}{t('dash.thinking')}</span>
        ) : null)}
      </div>
    </div>
  )
}
