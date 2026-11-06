'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useT } from '@/lib/i18n/client'
import { Send, X, Loader2, MessageSquarePlus, Globe, Database, Zap, Shield, Bug, Search, Bot, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useBrowserVoice, speakableText } from '@/components/voice/use-browser-voice'
import { VoiceInputButton, VoiceListeningBar } from '@/components/voice/voice-input-button'

interface AttachedFile {
  id: string
  name: string
  size: number
  content: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  pending?: boolean
  sources?: Array<{ title: string; url: string }>
  files?: Array<{ name: string; size: number }>
}

/* Text-based files we can inline into the prompt (anything binary is rejected). */
const TEXT_EXT = new Set(['js','jsx','ts','tsx','mjs','cjs','py','ipynb','java','c','cpp','cc','h','hpp','cs','go','rs','rb','php','kt','scala','swift','sh','bash','zsh','ps1','sql','html','htm','css','scss','less','vue','svelte','json','jsonc','yaml','yml','toml','xml','csv','tsv','md','mdx','txt','ini','conf','cfg','env','log'])
const MAX_ATTACH = 4
const MAX_FILE_BYTES = 200 * 1024

function isAttachable(f: File): boolean {
  const ext = (f.name.toLowerCase().split('.').pop() || '')
  if (TEXT_EXT.has(ext)) return true
  // Unknown extension: accept obvious text types the OS flagged.
  return /^text\/.+$/.test(f.type) || f.type === 'application/json' || f.type === 'application/xml'
}

function newFileId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

type ContextMode = 'auto' | 'rag' | 'google' | 'none'

/**
 * GO EDITH — Iron Man E.D.I.T.H. style AI assistant.
 * Multi-source: LLM (brocode.live) + RAG (scan history) + Google Search.
 * Streams via /api/ai/edith (SSE).
 */
export function GoEdith() {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [contextMode, setContextMode] = useState<ContextMode>('auto')
  const [attachments, setAttachments] = useState<AttachedFile[]>([])
  const [readAloud, setReadAloud] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Voice: browser speech recognition in the interface language (nothing is
  // recorded or stored — the mic only opens on explicit press).
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const voice = useBrowserVoice({
    onFinal: (heard) => {
      setInput((prev) => (prev.trim() ? `${prev.trim()} ${heard}` : heard))
      requestAnimationFrame(() => inputRef.current?.focus())
    },
  })

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (
        sidebarRef.current &&
        !sidebarRef.current.contains(target) &&
        !target.closest('[data-testid="go-edith-launcher"]')
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
    setAttachments([])
    voice.stopSpeaking()
  }, [voice])

  // Read the newest finished reply aloud (opt-in), once per message — mirrors
  // the agent copilot. Strips markdown so the synthesiser doesn't read "```.
  const spokenRef = useRef<string | null>(null)
  useEffect(() => {
    if (!readAloud || !voice.tts) return
    const last = [...messages].reverse().find((m) => m.role === 'assistant')
    if (!last || last.pending || spokenRef.current === last.id) return
    spokenRef.current = last.id
    const said = speakableText(last.content)
    if (said) voice.speak(said)
  }, [messages, readAloud, voice])

  /* ── File attachments ─────────────────────────────── */
  async function addFiles(list: FileList | File[] | null) {
    if (!list || !list.length) return
    const picked = Array.from(list)
    for (const f of picked) {
      // Enforce the caps, but keep the ones that fit.
      if (!isAttachable(f) || f.size > MAX_FILE_BYTES || attachments.length + 1 > MAX_ATTACH) continue
      try {
        const content = await f.text()
        setAttachments((prev) =>
          prev.length >= MAX_ATTACH ? prev : [...prev, { id: newFileId(), name: f.name, size: f.size, content }],
        )
      } catch {
        setAttachments((prev) =>
          prev.length >= MAX_ATTACH
            ? prev
            : [...prev, { id: newFileId(), name: f.name, size: f.size, content: `(couldn't read ${f.name})` }],
        )
      }
    }
    // Clear the input so re-selecting the same file works.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  /** Inline the attached files into the prompt so EDITH can read them. */
  function filesBlock(files: AttachedFile[]): string {
    if (!files.length) return ''
    return (
      '\n\n' +
      files
        .map((f) => `── FILE: ${f.name} ──\n${f.content}\n── END ${f.name} ──`)
        .join('\n\n')
    )
  }

  async function send() {
    const text = input.trim()
    const files = attachments
    if ((!text && !files.length) || busy) return
    setInput('')
    setAttachments([])
    // Keep the transcript text even if the user attached files with no words.
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text || '(files attached)',
      files: files.length ? files.map((f) => ({ name: f.name, size: f.size })) : undefined,
    }
    const placeholder: ChatMessage = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: '',
      pending: true,
    }
    setMessages((m) => [...m, userMsg, placeholder])
    setBusy(true)
    const fullMessage = (text || 'Analyze the attached files.') + filesBlock(files)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await csrfFetch('/api/ai/edith', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          message: fullMessage,
          context_mode: contextMode,
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(
          j.error ||
            (res.status === 429 ? 'Too many requests — wait a moment.' : `Error ${res.status}`)
        )
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let acc = ''
      const collectedSources: Array<{ title: string; url: string }> = []

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
              sources?: Array<{ title: string; url: string }>
            }
            if (parsed.session_id && !sessionId) setSessionId(parsed.session_id)
            if (parsed.sources) {
              collectedSources.push(...parsed.sources)
            }
            if (parsed.error) {
              acc += `\n\n${parsed.error}`
            } else if (parsed.delta) {
              acc += parsed.delta
            }
            setMessages((all) =>
              all.map((m) =>
                m.id === placeholder.id
                  ? { ...m, content: acc, pending: false, sources: collectedSources.length ? [...collectedSources] : undefined }
                  : m
              )
            )
          } catch {
            /* ignore malformed SSE chunk */
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      const errText = e instanceof Error ? e.message : String(e)
      setMessages((all) =>
        all.map((m) =>
          m.id === placeholder.id
            ? { ...m, content: `Sorry — ${errText}`, pending: false }
            : m
        )
      )
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const modeLabel: Record<ContextMode, string> = {
    auto: 'Auto',
    rag: 'My Scans',
    google: 'Web',
    none: 'General',
  }

  return (
    <>
      {/* ── Floating launcher ── */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="go-edith-launcher"
        title={t('dashboard.edithPanelTitle')}
        aria-label={t('dashboard.edithOpen')}
        className={cn(
          'fixed bottom-5 right-5 z-30 flex flex-col items-center justify-center gap-0.5',
          'h-14 w-14 rounded-2xl shadow-xl',
          'bg-gradient-to-br from-yellow-400 via-amber-500 to-orange-600',
          'text-black border border-yellow-300/50',
          'transition-all duration-200 hover:scale-105 hover:shadow-amber-500/40 hover:shadow-2xl active:scale-95',
          open && 'translate-x-20 opacity-0 pointer-events-none',
        )}
      >
        <Shield className="h-5 w-5" />
        <span className="text-[9px] font-black tracking-widest leading-none">{t('dashboard.edithBadge')}</span>
      </button>

      {/* ── Slide-out panel ── */}
      <aside
        ref={sidebarRef}
        className={cn(
          'fixed right-0 top-0 z-40 flex flex-col h-dvh w-full max-w-md',
          'border-l border-amber-500/20 bg-[#0a0a0f]/95 backdrop-blur-xl shadow-2xl shadow-amber-500/5',
          'transition-transform duration-200',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!open}
        data-testid="go-edith-panel"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-amber-500/20 px-4 py-3 bg-gradient-to-r from-amber-950/40 to-transparent">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 text-black shadow-lg shadow-amber-500/30">
              <Shield className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-amber-300 tracking-wide">{t('dashboard.edithBrand')}</span>
                <span className="inline-flex h-4 items-center rounded px-1 bg-amber-500/20 text-amber-400 text-[9px] font-bold tracking-widest">AI</span>
              </div>
              <div className="text-[10px] text-amber-600/80 font-medium">{t('dashboard.edithTagline')}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={newChat}
              title={t('dashboard.edithNewConversation')}
              aria-label={t('dashboard.edithNewConversation')}
              className="h-8 w-8 text-amber-500/60 hover:text-amber-400 hover:bg-amber-500/10"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              title={t('dashboard.edithClose')}
              aria-label={t('dashboard.edithCloseAssistant')}
              className="h-8 w-8 text-amber-500/60 hover:text-amber-400 hover:bg-amber-500/10"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Source mode toggle */}
        <div className="flex items-center gap-1.5 border-b border-amber-500/10 px-4 py-2 bg-black/20">
          <Zap className="h-3 w-3 text-amber-500/50 shrink-0" />
          <span className="text-[10px] text-amber-600/60 mr-1">Mode:</span>
          {(['auto', 'rag', 'google', 'none'] as ContextMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setContextMode(mode)}
              className={cn(
                'rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide transition-all',
                contextMode === mode
                  ? 'bg-amber-500/25 text-amber-300 border border-amber-500/30'
                  : 'text-amber-700/60 hover:text-amber-500/80 hover:bg-amber-500/10',
              )}
            >
              {mode === 'google' && <Globe className="inline h-2.5 w-2.5 mr-0.5 -mt-0.5" />}
              {mode === 'rag' && <Database className="inline h-2.5 w-2.5 mr-0.5 -mt-0.5" />}
              {modeLabel[mode]}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4"
          data-testid="edith-messages"
        >
          {messages.length === 0 && <EdithEmptyState onPick={(p) => setInput(p)} />}
          {messages.map((m) => (
            <EdithMessageBubble key={m.id} message={m} />
          ))}
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
          className="border-t border-amber-500/20 bg-black/40 px-3 py-3"
        >
          <VoiceListeningBar voice={voice} />
          {/* Attached files — removable chips above the input */}
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5" data-testid="edith-attachments">
              {attachments.map((f) => (
                <span
                  key={f.id}
                  className={cn(
                    'inline-flex max-w-full items-center gap-1 rounded-lg border border-amber-500/20 bg-amber-950/30 px-2 py-1 text-[11px] text-amber-300/90',
                  )}
                >
                  <Paperclip className="h-3 w-3 shrink-0 text-amber-500/70" aria-hidden />
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(f.id)}
                    aria-label={`Remove ${f.name}`}
                    className="ml-0.5 rounded p-0.5 text-amber-500/50 hover:bg-amber-500/10 hover:text-amber-300"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder={t('dashboard.edithPlaceholder')}
              rows={2}
              className={cn(
                'flex-1 resize-none rounded-xl border bg-black/60 px-3 py-2 text-sm',
                'border-amber-500/20 text-amber-100 placeholder:text-amber-800/60',
                'focus:outline-none focus:ring-1 focus:ring-amber-500/50',
              )}
              data-testid="edith-input"
              disabled={busy}
            />
            <Button
              type="button"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              aria-label={t('dashboard.edithAttachFiles')}
              title={t('dashboard.edithAttachFiles')}
              data-testid="edith-attach"
              disabled={busy}
              className="h-10 w-10 rounded-xl border border-amber-500/30 bg-amber-950/30 text-amber-400/80 hover:bg-amber-500/10 hover:text-amber-300 disabled:opacity-40 shrink-0"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <VoiceInputButton
              voice={voice}
              disabled={busy}
              className="h-10 w-10 rounded-xl border border-amber-500/30 bg-amber-950/30 text-amber-400/80 hover:bg-amber-500/10 hover:text-amber-300 disabled:opacity-40"
            />
            <Button
              type="submit"
              size="icon"
              disabled={busy || (!input.trim() && !attachments.length)}
              aria-label={busy ? 'Sending…' : 'Send to EDITH'}
              data-testid="edith-send"
              className="h-10 w-10 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 text-black hover:opacity-90 disabled:opacity-40 shrink-0"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => void addFiles(e.target.files)}
            data-testid="edith-file-input"
          />
          {/* Read replies aloud (opt-in) */}
          {voice.tts && (
            <label className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-amber-600/70">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-amber-500"
                checked={readAloud}
                onChange={(e) => {
                  setReadAloud(e.target.checked)
                  if (!e.target.checked) voice.stopSpeaking()
                }}
              />
              {t('dashboard.readRepliesAloud')}
            </label>
          )}
        </form>
      </aside>
    </>
  )
}

/* ── Empty state ── */
function EdithEmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  const { t } = useT()
  // Icons, not emoji: an emoji prefix also used to be stripped with a regex
  // before sending, which would have eaten the first word once removed.
  const examples: { icon: typeof Bug; prompt: string }[] = [
    { icon: Bug, prompt: 'Summarize my last code scan — what issues were found?' },
    { icon: Zap, prompt: 'How do I add my own API key to skip credits?' },
    { icon: Search, prompt: 'What does Big-O notation mean and why does it matter?' },
    { icon: Bot, prompt: 'What can the AI Agent do that regular chat cannot?' },
  ]
  return (
    <div className="space-y-4 text-center pt-8">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-400/20 to-orange-500/10 border border-amber-500/20">
        <Shield className="h-7 w-7 text-amber-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-amber-300">{t('dashboard.edithOnline')}</p>
        <p className="text-xs text-amber-700/80 mt-0.5">
          {t('dashboard.edithCapabilities')}
        </p>
      </div>
      <div className="space-y-2 pt-1">
        {examples.map(({ icon: Icon, prompt }) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPick(prompt)}
            className={cn(
              'flex w-full items-start gap-2 rounded-xl border border-amber-500/10 bg-amber-950/20 px-3 py-2.5',
              'text-left text-xs text-amber-400/80 hover:border-amber-500/30 hover:bg-amber-950/40 hover:text-amber-300',
              'transition-all',
            )}
          >
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/70" aria-hidden />
            <span>{prompt}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Message bubble ── */
function EdithMessageBubble({ message }: { message: ChatMessage }) {
  const { t } = useT()
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap wrap-break-word',
          isUser
            ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-black font-medium'
            : 'bg-[#111118] text-amber-100/90 border border-amber-500/10',
        )}
        data-testid={isUser ? 'edith-msg-user' : 'edith-msg-assistant'}
      >
        {message.content || (message.pending ? (
          <span className="inline-flex items-center gap-1.5 text-amber-500/60 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('dashboard.edithProcessing')}
          </span>
        ) : null)}
      </div>
      {/* Attached-file chips (user messages) */}
      {isUser && message.files && message.files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 max-w-[90%]">
          {message.files.map((f, i) => (
            <span
              key={i}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg border border-amber-500/20 bg-amber-950/30',
                'px-2 py-1 text-[10px] text-amber-500/80',
              )}
            >
              <Paperclip className="h-2.5 w-2.5 shrink-0" aria-hidden />
              <span className="truncate max-w-[110px]">{f.name}</span>
            </span>
          ))}
        </div>
      )}
      {/* Source cards */}
      {!isUser && message.sources && message.sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5 max-w-[90%]">
          {message.sources.slice(0, 3).map((s, i) => (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex items-center gap-1 rounded-lg border border-amber-500/15 bg-amber-950/20',
                'px-2 py-1 text-[10px] text-amber-500/70 hover:text-amber-400 hover:border-amber-500/30 transition-colors',
              )}
            >
              <Globe className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate max-w-[120px]">{s.title}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
