'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Shield, AlertTriangle, Eye, EyeOff, Search, LogOut, RotateCcw, Copy, ClipboardPaste, Bell } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'

interface ProctorEvent {
  id: string; user_id: string; session_kind: string; session_id: string
  event_type: string; meta: Record<string, unknown>; created_at: string
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
  tab_blur: <LogOut className="w-4 h-4" />, tab_focus: <RotateCcw className="w-4 h-4" />, copy: <Copy className="w-4 h-4" />, paste: <ClipboardPaste className="w-4 h-4" />,
  right_click: '🖱️', fullscreen_exit: '🖥️', idle_60s: '💤',
  camera_capture: '📷', camera_denied: '🚫',
  multi_face: '👥', no_face: '😶',
}

const EVENT_SEVERITY: Record<string, string> = {
  tab_blur: 'warning', fullscreen_exit: 'critical', idle_60s: 'warning',
  copy: 'info', paste: 'info', right_click: 'info',
  multi_face: 'critical', no_face: 'warning',
}

export default function AdminProctorPage() {
  const gate = usePageGuard('superadmin')
  const [events, setEvents] = useState<ProctorEvent[]>([])
  const [violations, setViolations] = useState<Record<string, number>>({})
  const [flagged, setFlagged] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async (sessionId = '') => {
    setLoading(true)
    try {
      const url = `/api/admin/proctor${sessionId ? `?session_id=${sessionId}` : ''}`
      const res = await fetch(url, { cache: 'no-store' })
      if (res.ok) {
        const j = await res.json()
        setEvents(j.events || [])
        setViolations(j.violations || {})
        setFlagged(j.flagged_sessions || [])
      }
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  const filtered = search
    ? events.filter((e) =>
        e.session_id.includes(search) || e.user_id.includes(search) || e.event_type.includes(search)
      )
    : events

  const countViolations = events.filter((e) => EVENT_SEVERITY[e.event_type] === 'critical').length
  const countWarnings = events.filter((e) => EVENT_SEVERITY[e.event_type] === 'warning').length

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="h-7 w-7 text-primary" /> Proctor Dashboard
        </h1>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-2xl font-bold">{events.length}</p>
          <p className="text-xs text-muted-foreground">Total Events</p>
        </Card>
        <Card className="p-4 border-destructive/30">
          <p className="text-2xl font-bold text-destructive">{countViolations}</p>
          <p className="text-xs text-muted-foreground">Critical Violations</p>
        </Card>
        <Card className="p-4 border-yellow-500/30">
          <p className="text-2xl font-bold text-yellow-500">{countWarnings}</p>
          <p className="text-xs text-muted-foreground">Warnings</p>
        </Card>
      </div>

      {flagged.length > 0 && (
        <Card className="p-4 border-destructive/40 bg-destructive/5">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Flagged Sessions ({flagged.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {flagged.map((s) => (
              <Badge key={s} variant="outline" className="cursor-pointer" onClick={() => setSearch(s)}>
                {s.slice(0, 16)}…
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <div className="flex gap-2">
        <Input placeholder="Search by session ID, user ID, or event type…" value={search}
          onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
        <Button variant="outline" onClick={() => load(search)}>
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <Card className="flex h-32 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading events…
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No proctor events found.</Card>
      ) : (
        <Card className="divide-y divide-border/60 overflow-hidden">
          {filtered.map((e) => (
            <div key={e.id}>
              <div
                className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 ${
                  EVENT_SEVERITY[e.event_type] === 'critical' ? 'bg-destructive/5' : ''
                }`}
                onClick={() => setExpanded(expanded === e.id ? null : e.id)}
              >
                <span className="text-lg">{EVENT_ICONS[e.event_type] || <Bell className="w-4 h-4" />}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{e.event_type}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {e.session_id.slice(0, 24)}… · {new Date(e.created_at).toLocaleTimeString()}
                  </p>
                </div>
                <Badge variant={EVENT_SEVERITY[e.event_type] === 'critical' ? 'destructive' : 'secondary'} className="text-[10px]">
                  {EVENT_SEVERITY[e.event_type] || 'info'}
                </Badge>
                <span className="text-xs text-muted-foreground">{e.session_kind}</span>
              </div>
              {expanded === e.id && (
                <div className="px-12 pb-3 text-xs text-muted-foreground space-y-1 bg-muted/20">
                  <p>ID: {e.id}</p>
                  <p>User: {e.user_id}</p>
                  <p>Session: {e.session_id}</p>
                  <p>Time: {new Date(e.created_at).toLocaleString()}</p>
                  {Object.keys(e.meta).length > 0 && (
                    <pre className="text-[10px] mt-1">{JSON.stringify(e.meta, null, 2)}</pre>
                  )}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
