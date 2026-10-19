'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Coins, Cpu, PanelLeft, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/empty-state'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Panel } from '@/components/app/page-kit'
import { cn } from '@/lib/utils'
import { useAgentChat } from './use-agent-chat'
import { ConversationList } from './conversation-list'
import { AssistantMessage, UserBubble } from './agent-message'
import { TenantPicker } from './tenant-picker'
import { UsagePanel } from './usage-panel'

export const STARTER_PROMPTS = [
  'Create a backend engineer test from this job description',
  'Set up a campus drive next month: a test, a hackathon and invites',
  'Who should we shortlist for the Backend Engineer job?',
  'Every Monday at 9:00, email me new applicants',
]

export function AgentStatusBadges({ chat }: { chat: ReturnType<typeof useAgentChat> }) {
  const model = chat.liveModel || chat.status?.model?.model
  const credits = chat.status?.credits
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chat.isSuper && (
        <TenantPicker id="copilot-scope" value={chat.scope} onChange={chat.setScope} disabled={chat.streaming} />
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="h-8 max-w-[14rem] gap-1.5 rounded-full px-3" tabIndex={0}>
            <Cpu aria-hidden />
            <span className="truncate">{model || 'Automatic model'}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {model
            ? 'Set in the platform AI settings. If it is busy, the copilot switches to a backup model.'
            : 'No model is set in the platform AI settings, so the copilot uses the first available backup model.'}
        </TooltipContent>
      </Tooltip>
      <UsagePanel isSuper={chat.isSuper} budget={chat.status?.budget ?? null} />
      {credits && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="h-8 gap-1.5 rounded-full px-3 tabular-nums" tabIndex={0}>
              <Coins aria-hidden />
              {credits.balance.toLocaleString()} credits
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {chat.status?.pricing ?? 'Each message uses AI credits.'}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

export function AgentCopilot({ chat }: { chat: ReturnType<typeof useAgentChat> }) {
  const [text, setText] = useState('')
  const [railOpen, setRailOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const stickRef = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [chat.items])

  const submit = () => {
    const t = text.trim()
    if (!t || chat.streaming) return
    setText('')
    stickRef.current = true
    void chat.send(t)
  }

  const pickStarter = (p: string) => {
    setText(p.endsWith('job description') ? `${p}:\n\n` : p)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const list = (
    <ConversationList
      conversations={chat.conversations}
      loading={chat.loadingList}
      activeId={chat.activeId}
      onOpen={(id) => { setRailOpen(false); void chat.open(id) }}
      onNew={() => { setRailOpen(false); void chat.open(null); requestAnimationFrame(() => inputRef.current?.focus()) }}
      onRename={chat.rename}
      onDelete={chat.remove}
    />
  )

  const empty = !chat.items.length && !chat.loadingConv
  const lastAssistantId = [...chat.items].reverse().find((i) => i.kind === 'assistant')?.id

  return (
    <div className="grid min-h-[calc(100dvh-13rem)] gap-4 lg:h-[calc(100dvh-13rem)] lg:grid-cols-[16rem_1fr]">
      <aside className="hidden min-h-0 lg:block">
        <Panel className="h-full p-3">{list}</Panel>
      </aside>

      <Sheet open={railOpen} onOpenChange={setRailOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-xs p-4">
          <SheetHeader className="p-0 pb-3">
            <SheetTitle>Conversations</SheetTitle>
          </SheetHeader>
          {list}
        </SheetContent>
      </Sheet>

      <Panel className="flex min-h-[60dvh] flex-col p-0 lg:min-h-0">
        <div className="flex items-center gap-2 border-b border-border/70 px-4 py-2.5 lg:hidden">
          <Button variant="ghost" size="sm" onClick={() => setRailOpen(true)}>
            <PanelLeft aria-hidden /> Conversations
          </Button>
        </div>

        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
          }}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"
          aria-live="polite"
          aria-busy={chat.streaming}
        >
          {chat.error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{chat.error}</p>}
          {chat.loadingConv && (
            <div className="space-y-4" aria-hidden>
              {[0, 1, 2].map((i) => <div key={i} className={cn('h-14 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none', i % 2 ? 'ml-auto w-2/3' : 'w-5/6')} />)}
            </div>
          )}
          {empty ? (
            <div className="mx-auto flex max-w-2xl flex-col items-center">
              <EmptyState
                illustration="ai"
                title="What can I help you set up?"
                description="Ask about your tests, candidates and events, or have me draft a change. I always show you a preview first — nothing is saved or sent until you confirm it."
                className="border-0 bg-transparent py-6 md:py-8"
              />
              <ul className="grid w-full gap-2 sm:grid-cols-2">
                {STARTER_PROMPTS.map((p) => (
                  <li key={p}>
                    <button
                      type="button"
                      onClick={() => pickStarter(p)}
                      className="h-full w-full rounded-2xl border border-border bg-background px-4 py-3 text-left text-sm text-foreground transition-[border-color,background-color] duration-200 hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      {p}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6">
              {chat.items.map((it) =>
                it.kind === 'user' ? (
                  <UserBubble key={it.id} text={it.text} />
                ) : (
                  <AssistantMessage
                    key={it.id}
                    item={it}
                    actions={chat.actions}
                    bundles={chat.bundles}
                    onConfirm={chat.confirm}
                    onCancel={chat.cancel}
                    onEdit={chat.editArgs}
                    onConfirmBundle={chat.confirmBundle}
                    onCancelBundle={chat.cancelBundle}
                    loadEditForm={chat.loadEditForm}
                    onAnswer={(t) => { stickRef.current = true; void chat.send(t) }}
                    canAnswer={!chat.streaming && it.id === lastAssistantId}
                  />
                ),
              )}
            </div>
          )}
        </div>

        <form
          className="border-t border-border/70 p-3 sm:p-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-background p-2 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-ring/30">
            <label htmlFor="copilot-input" className="sr-only">Message the AI copilot</label>
            <Textarea
              id="copilot-input"
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                }
              }}
              rows={1}
              maxLength={8000}
              placeholder="Ask the copilot… (Enter to send, Shift+Enter for a new line)"
              className="max-h-48 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            {chat.streaming ? (
              <Button type="button" size="icon-lg" variant="outline" onClick={chat.stop} aria-label="Stop generating" className="size-11 rounded-xl">
                <Square className="fill-current" aria-hidden />
              </Button>
            ) : (
              <Button type="submit" size="icon-lg" disabled={!text.trim()} aria-label="Send message" className="size-11 rounded-xl">
                <ArrowUp aria-hidden />
              </Button>
            )}
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">
            The copilot can make mistakes. Check previews before you confirm.
          </p>
        </form>
      </Panel>
    </div>
  )
}
