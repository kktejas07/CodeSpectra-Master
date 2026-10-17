'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type FilterState = {
  status?: string[]
  category?: string[]
  experience?: string[]
  payment?: string[]
  teamSize?: string[]
}

const DEFAULT_STATUS = ['Live', 'Upcoming', 'Closed', 'Recent']
const DEFAULT_PAYMENT = ['Free', 'Paid']
const DEFAULT_TEAM = ['Individual', 'Team']

type CategoryKey = keyof FilterState

const NAV: { key: CategoryKey; label: string }[] = [
  { key: 'status', label: 'Status' },
  { key: 'category', label: 'Category' },
  { key: 'experience', label: 'Work Experience' },
  { key: 'payment', label: 'Payment' },
  { key: 'teamSize', label: 'Team Size' },
]

function toggle(list: string[] | undefined, value: string): string[] {
  const cur = list || []
  return cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
}

export function AllFiltersDialog({
  open,
  onOpenChange,
  value,
  onApply,
  categories = ['Tech', 'Data', 'Hackathon', 'Quiz'],
  experienceLevels = ['Entry-level', 'Mid-level', 'Advanced'],
  statuses = DEFAULT_STATUS,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  value: FilterState
  onApply: (next: FilterState) => void
  categories?: string[]
  experienceLevels?: string[]
  statuses?: string[]
}) {
  const [draft, setDraft] = useState<FilterState>(value)
  const [tab, setTab] = useState<CategoryKey>('status')

  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])

  const options: Record<CategoryKey, string[]> = {
    status: statuses,
    category: categories,
    experience: experienceLevels,
    payment: DEFAULT_PAYMENT,
    teamSize: DEFAULT_TEAM,
  }

  const activeCount = (key: CategoryKey) => draft[key]?.length || 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>All Filters</DialogTitle>
        </DialogHeader>
        <div className="grid min-h-70 grid-cols-[120px_1fr] sm:grid-cols-[160px_1fr]">
          <nav className="border-r bg-muted/20 py-2">
            {NAV.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={cn(
                  'flex w-full items-center justify-between px-4 py-2.5 text-left text-sm',
                  tab === item.key ? 'border-l-2 border-primary bg-background font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/40',
                )}
              >
                <span>{item.label}</span>
                {activeCount(item.key) ? (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold tabular-nums text-primary-foreground">
                    {activeCount(item.key)}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{NAV.find((n) => n.key === tab)?.label}</p>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setDraft((d) => ({ ...d, [tab]: [] }))}
              >
                Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {options[tab].map((opt) => {
                const on = (draft[tab] || []).includes(opt)
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, [tab]: toggle(d[tab], opt) }))}
                    aria-pressed={on}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm transition-colors duration-200',
                      on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:bg-muted',
                    )}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 border-t px-5 py-3 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              setDraft({})
              onApply({})
              onOpenChange(false)
            }}
          >
            Clear All
          </Button>
          <Button
            type="button"
            onClick={() => {
              onApply(draft)
              onOpenChange(false)
            }}
          >
            Show Results
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
