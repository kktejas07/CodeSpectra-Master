'use client'

import { useState } from 'react'
import { Check, MessageSquare, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useConfirm } from '@/lib/confirm-context'
import { cn } from '@/lib/utils'
import type { ConversationSummary } from './types'

export function ConversationList({
  conversations,
  loading,
  activeId,
  onOpen,
  onNew,
  onRename,
  onDelete,
}: {
  conversations: ConversationSummary[]
  loading: boolean
  activeId: string | null
  onOpen: (id: string) => void
  onNew: () => void
  onRename: (id: string, title: string) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
}) {
  const confirm = useConfirm()
  const [editing, setEditing] = useState<string | null>(null)
  const [title, setTitle] = useState('')

  const save = async () => {
    if (editing && title.trim()) await onRename(editing, title)
    setEditing(null)
  }

  return (
    <nav aria-label="Conversations" className="flex h-full min-h-0 flex-col">
      <Button onClick={onNew} className="mb-3 w-full justify-start" variant="outline">
        <Plus aria-hidden /> New conversation
      </Button>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <ul className="space-y-2" aria-hidden>
            {[0, 1, 2].map((i) => <li key={i} className="h-9 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />)}
          </ul>
        ) : conversations.length === 0 ? (
          <p className="px-2 py-4 text-sm text-muted-foreground">Your conversations will show up here.</p>
        ) : (
          <ul className="space-y-0.5">
            {conversations.map((c) => (
              <li key={c.id}>
                {editing === c.id ? (
                  <form
                    className="flex items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void save()
                    }}
                  >
                    <label htmlFor={`rename-${c.id}`} className="sr-only">Conversation name</label>
                    <Input id={`rename-${c.id}`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus className="h-8" />
                    <Button type="submit" size="icon-sm" variant="ghost" aria-label="Save name"><Check aria-hidden /></Button>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancel rename" onClick={() => setEditing(null)}><X aria-hidden /></Button>
                  </form>
                ) : (
                  <div
                    className={cn(
                      'group flex items-center rounded-lg transition-colors',
                      activeId === c.id ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(c.id)}
                      aria-current={activeId === c.id ? 'page' : undefined}
                      className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                      <span className="truncate">{c.title}</span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon-sm" variant="ghost" aria-label={`Options for ${c.title}`} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100">
                          <MoreHorizontal aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => { setTitle(c.title); setEditing(c.id) }}>
                          <Pencil aria-hidden /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={async () => {
                            const ok = await confirm({
                              title: 'Delete this conversation?',
                              description: 'Its messages are removed and any proposals still waiting for confirmation are cancelled.',
                              confirmText: 'Delete',
                              destructive: true,
                            })
                            if (ok) await onDelete(c.id)
                          }}
                        >
                          <Trash2 aria-hidden /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  )
}
