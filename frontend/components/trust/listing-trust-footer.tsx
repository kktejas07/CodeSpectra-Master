'use client'

import { useState } from 'react'
import { Flag, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { csrfFetch } from '@/lib/csrf-fetch'

type Kind = 'complaint' | 'issue'

export function ListingTrustFooter({
  entityType,
  entityId,
  entityTitle,
  organizerName,
  updatedAt,
}: {
  entityType: 'blog' | 'hackathon' | 'event' | 'course' | 'quiz' | 'resource'
  entityId: string
  entityTitle: string
  organizerName?: string | null
  updatedAt?: string | null
}) {
  const [open, setOpen] = useState<Kind | null>(null)
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const updatedLabel = (() => {
    if (!updatedAt) return null
    try {
      return new Date(updatedAt).toLocaleString(undefined, {
        day: '2-digit',
        month: 'short',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    } catch {
      return updatedAt
    }
  })()

  const org = (organizerName || '').trim() || 'the organizer'

  async function submit() {
    setBusy(true)
    setError('')
    try {
      const res = await csrfFetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: open,
          entityType,
          entityId,
          entityTitle,
          message: message.trim(),
          contactEmail: email.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not submit')
      setDone(true)
      setMessage('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not submit')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-12 space-y-3 border-t border-border/60 pt-6 text-xs text-muted-foreground">
      {updatedLabel ? (
        <p>
          <span className="font-medium text-foreground/80">Updated On:</span> {updatedLabel}
        </p>
      ) : null}
      <p>The data on this page gets updated every 15 minutes.</p>
      <p>
        This opportunity has been listed by <span className="font-medium text-foreground/80">{org}</span>.
        CodeSpectra is not liable for any content mentioned in this opportunity or the process followed
        by the organizers. However, please raise a complaint if you want CodeSpectra to look into the
        matter.
      </p>
      <div className="flex flex-wrap gap-3 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs text-sky-600 hover:text-sky-700"
          onClick={() => {
            setDone(false)
            setOpen('complaint')
          }}
        >
          <Search className="h-3.5 w-3.5" />
          Raise a Complaint
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs text-red-600 hover:text-red-700"
          onClick={() => {
            setDone(false)
            setOpen('issue')
          }}
        >
          <Flag className="h-3.5 w-3.5" />
          Report An Issue
        </Button>
      </div>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {open === 'complaint' ? 'Raise a Complaint' : 'Report an Issue'}
            </DialogTitle>
            <DialogDescription>
              Tell us what looks wrong with “{entityTitle}”. Our team will review it.
            </DialogDescription>
          </DialogHeader>
          {done ? (
            <p className="text-sm text-emerald-600">Thanks — your report was submitted.</p>
          ) : (
            <div className="space-y-3">
              <div>
                <Label htmlFor="report-msg">Details</Label>
                <Textarea
                  id="report-msg"
                  className="mt-1.5"
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What should we look into?"
                />
              </div>
              <div>
                <Label htmlFor="report-email">Contact email (optional)</Label>
                <Input
                  id="report-email"
                  className="mt-1.5"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(null)}>
              Close
            </Button>
            {!done ? (
              <Button type="button" disabled={busy || message.trim().length < 8} onClick={() => void submit()}>
                {busy ? 'Sending…' : 'Submit'}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
