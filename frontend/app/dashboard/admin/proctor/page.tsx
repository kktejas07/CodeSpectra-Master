'use client'
import { formatDateTime, formatTime } from '@/lib/format-datetime'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Shield, AlertTriangle, Eye, EyeOff, Search, LogOut, RotateCcw, Copy, ClipboardPaste, Bell, Monitor, Usb, Mic, Video, Globe, Keyboard, Mouse, Maximize, Move, Users, UserX, Moon, Activity } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { SkeletonStats, SkeletonList } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'

interface ProctorEvent {
  id: string; user_id: string; session_kind: string; session_id: string
  event_type: string; meta: Record<string, unknown>; created_at: string
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
  // Focus & Navigation
  tab_blur: <LogOut className="w-4 h-4" />, tab_focus: <RotateCcw className="w-4 h-4" />,
  alt_tab_detected: <LogOut className="w-4 h-4" />,
  navigate_away_attempt: <LogOut className="w-4 h-4" />,
  fullscreen_exit: <Maximize className="w-4 h-4" />,
  fullscreen_unavailable: <Maximize className="w-4 h-4" />,
  window_blur: <LogOut className="w-4 h-4" />, window_focus: <RotateCcw className="w-4 h-4" />,
  tab_switched: <LogOut className="w-4 h-4" />, tab_returned: <RotateCcw className="w-4 h-4" />,
  os_focus_lost: <LogOut className="w-4 h-4" />, os_focus_returned: <RotateCcw className="w-4 h-4" />,
  new_tab_opened: <Monitor className="w-4 h-4" />,

  // Clipboard
  copy: <Copy className="w-4 h-4" />, paste: <ClipboardPaste className="w-4 h-4" />,
  clipboard_copy: <Copy className="w-4 h-4" />, clipboard_paste: <ClipboardPaste className="w-4 h-4" />,
  copy_paste_attempt: <Copy className="w-4 h-4" />,
  large_copy: <Copy className="w-4 h-4" />, large_paste: <ClipboardPaste className="w-4 h-4" />,

  // Screen & Display
  screen_share_started: <Monitor className="w-4 h-4" />,
  screen_share_ended: <Monitor className="w-4 h-4" />,
  screen_capture_detected: <Monitor className="w-4 h-4" />,
  rapid_window_resize: <Move className="w-4 h-4" />,
  viewport_shrunk: <Move className="w-4 h-4" />, viewport_restored: <Move className="w-4 h-4" />,

  // USB & Hardware
  usb_device_plugged: <Usb className="w-4 h-4" />,
  usb_device_unplugged: <Usb className="w-4 h-4" />,
  usb_device_inserted: <Usb className="w-4 h-4" />,
  usb_device_removed: <Usb className="w-4 h-4" />,
  hardware_port_anomaly: <Usb className="w-4 h-4" />,
  hardware_port_audit: <Usb className="w-4 h-4" />,

  // Audio
  secondary_voice_detected: <Mic className="w-4 h-4" />,
  volume_anomaly_detected: <Mic className="w-4 h-4" />,

  // Applications & Proxy
  prohibited_app_detected: <Globe className="w-4 h-4" />,
  remote_desktop_detected: <Globe className="w-4 h-4" />,

  // Input
  keyboard_shortcut_blocked: <Keyboard className="w-4 h-4" />,
  right_click_blocked: <Mouse className="w-4 h-4" />,
  right_click: <Mouse className="w-4 h-4" />,

  // Camera & Identity
  camera_capture: <Video className="w-4 h-4" />,
  camera_denied: <Video className="w-4 h-4" />,
  multi_face: <Users className="w-4 h-4" />, no_face: <UserX className="w-4 h-4" />,

  // Idle & Session
  idle_60s: <Moon className="w-4 h-4" />,
  session_kickout: <Shield className="w-4 h-4" />,
}

const EVENT_SEVERITY: Record<string, string> = {
  // Critical
  screen_share_started: 'critical', screen_capture_detected: 'critical',
  prohibited_app_detected: 'critical', remote_desktop_detected: 'critical',
  usb_device_plugged: 'critical', usb_device_inserted: 'critical',
  multi_face: 'critical', session_kickout: 'critical',
  hardware_port_anomaly: 'critical',
  // Warning
  tab_blur: 'warning', fullscreen_exit: 'warning', idle_60s: 'warning',
  secondary_voice_detected: 'warning', volume_anomaly_detected: 'warning',
  alt_tab_detected: 'warning', navigate_away_attempt: 'warning',
  no_face: 'warning', rapid_window_resize: 'warning',
  window_blur: 'warning', viewport_shrunk: 'warning',
  large_copy: 'warning', large_paste: 'warning', fullscreen_unavailable: 'warning',
  tab_switched: 'warning', os_focus_lost: 'warning', new_tab_opened: 'warning',
  // Info
  copy: 'info', paste: 'info', right_click: 'info',
  clipboard_copy: 'info', clipboard_paste: 'info', copy_paste_attempt: 'info',
  keyboard_shortcut_blocked: 'info', right_click_blocked: 'info',
  usb_device_unplugged: 'info', usb_device_removed: 'info',
  screen_share_ended: 'info', hardware_port_audit: 'info',
  window_focus: 'info', viewport_restored: 'info',
  tab_returned: 'info', os_focus_returned: 'info',
}

export default function AdminProctorPage() {
  const gate = usePageGuard('superadmin')
  const [events, setEvents] = useState<ProctorEvent[]>([])
  const [violations, setViolations] = useState<Record<string, number>>({})
  const [flagged, setFlagged] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [userMap, setUserMap] = useState<Record<string, { name: string; email: string }>>({})

  // Event category mapping
  const EVENT_CATEGORIES: Record<string, string> = {
    tab_blur: 'focus', tab_focus: 'focus', alt_tab_detected: 'focus',
    navigate_away_attempt: 'focus', fullscreen_exit: 'focus',
    fullscreen_unavailable: 'focus', window_blur: 'focus', window_focus: 'focus',
    tab_switched: 'focus', tab_returned: 'focus', os_focus_lost: 'focus',
    os_focus_returned: 'focus', new_tab_opened: 'focus',
    copy: 'clipboard', paste: 'clipboard', clipboard_copy: 'clipboard',
    clipboard_paste: 'clipboard', copy_paste_attempt: 'clipboard',
    large_copy: 'clipboard', large_paste: 'clipboard',
    screen_share_started: 'screen', screen_share_ended: 'screen',
    screen_capture_detected: 'screen', rapid_window_resize: 'screen',
    viewport_shrunk: 'screen', viewport_restored: 'screen',
    usb_device_plugged: 'hardware', usb_device_unplugged: 'hardware',
    usb_device_inserted: 'hardware', usb_device_removed: 'hardware',
    hardware_port_anomaly: 'hardware', hardware_port_audit: 'hardware',
    secondary_voice_detected: 'audio', volume_anomaly_detected: 'audio',
    prohibited_app_detected: 'applications', remote_desktop_detected: 'applications',
    keyboard_shortcut_blocked: 'input', right_click_blocked: 'input', right_click: 'input',
    camera_capture: 'identity', camera_denied: 'identity',
    multi_face: 'identity', no_face: 'identity',
    idle_60s: 'session', session_kickout: 'session',
  }

  const CATEGORIES = [
    { id: 'all', label: 'All events' },
    { id: 'critical', label: 'Critical only' },
    { id: 'focus', label: 'Focus and navigation' },
    { id: 'clipboard', label: 'Clipboard' },
    { id: 'screen', label: 'Screen and display' },
    { id: 'hardware', label: 'USB and hardware' },
    { id: 'audio', label: 'Audio' },
    { id: 'applications', label: 'Apps and remote access' },
    { id: 'input', label: 'Input' },
    { id: 'identity', label: 'Identity' },
    { id: 'session', label: 'Session' },
  ]

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

  useEffect(() => {
    if (!gate.ready) return
    fetch('/api/admin/users', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const users = Array.isArray(data) ? data : data.users || []
        const map: Record<string, { name: string; email: string }> = {}
        for (const u of users) {
          if (u.id || u._id) map[u.id || u._id] = { name: u.name || u.email || 'Unknown', email: u.email || '' }
        }
        setUserMap(map)
      })
      .catch(() => {})
  }, [gate.ready])

  const filtered = events.filter((e) => {
    // Search filter
    const matchesSearch = !search ||
      e.session_id.includes(search) ||
      e.user_id.includes(search) ||
      e.event_type.includes(search)

    // Category filter
    let matchesCategory = true
    if (categoryFilter === 'critical') {
      matchesCategory = EVENT_SEVERITY[e.event_type] === 'critical'
    } else if (categoryFilter !== 'all') {
      matchesCategory = EVENT_CATEGORIES[e.event_type] === categoryFilter
    }

    return matchesSearch && matchesCategory
  })

  const countViolations = events.filter((e) => EVENT_SEVERITY[e.event_type] === 'critical').length
  const countWarnings = events.filter((e) => EVENT_SEVERITY[e.event_type] === 'warning').length

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <PageHeader
        illustration="proctoring"
        title="Proctoring events"
        description="Everything proctoring recorded during tests, newest first. A flag is evidence for a reviewer, not an automatic fail."
        icon={<Shield />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="All events" value={events.length} icon={<Activity />} />
        <StatCard label="Critical" value={<span className="text-destructive">{countViolations}</span>} icon={<AlertTriangle />} className="border-destructive/30" />
        <StatCard label="Warnings" value={<span className="text-amber-600 dark:text-amber-400">{countWarnings}</span>} icon={<Eye />} className="border-amber-500/30" />
      </div>

      {flagged.length > 0 && (
        <Panel className="border-destructive/40 bg-destructive/5 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden /> Flagged sessions (<span className="tabular-nums">{flagged.length}</span>)
          </h3>
          <div className="flex flex-wrap gap-2">
            {flagged.map((s) => (
              <button key={s} type="button" onClick={() => setSearch(s)} className="rounded-full focus-visible:outline-2 focus-visible:outline-primary" title="Filter by this session">
                <Badge variant="outline" className="cursor-pointer font-mono hover:border-primary/50">
                  {s.slice(0, 16)}…
                </Badge>
              </button>
            ))}
          </div>
        </Panel>
      )}

      <div className="flex gap-2 flex-wrap">
        <Input placeholder="Search by session ID, user ID, or event type…" value={search}
          aria-label="Search proctoring events"
          className="min-w-[240px] flex-1"
          onChange={(e) => setSearch(e.target.value)} />
        <select
          value={categoryFilter}
          aria-label="Event category"
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.label}</option>
          ))}
        </select>
        <Button variant="outline" onClick={() => load(search)} aria-label="Search by session">
          <Search className="h-4 w-4" />
        </Button>
        {categoryFilter !== 'all' && (
          <Button variant="ghost" size="sm" onClick={() => setCategoryFilter('all')}>
            Clear filter
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-6">
          <SkeletonStats />
          <SkeletonList count={5} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState variant="search" title="No proctoring events match" description="Try another category or clear the search." />
      ) : (
        <Panel className="divide-y divide-border/60 overflow-hidden p-0">
          {filtered.map((e) => (
            <div key={e.id}>
              <div
                role="button"
                tabIndex={0}
                aria-expanded={expanded === e.id}
                className={`flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/30 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${
                  EVENT_SEVERITY[e.event_type] === 'critical' ? 'bg-destructive/5' : ''
                }`}
                onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setExpanded(expanded === e.id ? null : e.id) } }}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  EVENT_SEVERITY[e.event_type] === 'critical' ? 'bg-destructive/10 text-destructive' :
                  EVENT_SEVERITY[e.event_type] === 'warning' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                  'bg-muted text-muted-foreground'
                }`} aria-hidden>{EVENT_ICONS[e.event_type] || <Bell className="w-4 h-4" />}</span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-foreground first-letter:uppercase">{e.event_type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {userMap[e.user_id]?.name || e.user_id.slice(0, 16)} · {e.session_id.slice(0, 24)}… · {formatTime(e.created_at)}
                  </p>
                </div>
                <Badge variant={EVENT_SEVERITY[e.event_type] === 'critical' ? 'destructive' : 'secondary'} className="text-[11px] capitalize">
                  {EVENT_SEVERITY[e.event_type] || 'info'}
                </Badge>
                <span className="text-xs text-muted-foreground">{e.session_kind}</span>
              </div>
              {expanded === e.id && (
                <div className="space-y-1 bg-muted/20 px-14 py-3 text-xs text-muted-foreground">
                  <p>ID: <span className="font-mono">{e.id}</span></p>
                  <p>User: {userMap[e.user_id]?.name || e.user_id}{userMap[e.user_id]?.email ? ` (${userMap[e.user_id].email})` : ''}</p>
                  <p>Session: <span className="font-mono">{e.session_id}</span></p>
                  <p>Time: {formatDateTime(e.created_at)}</p>
                  {Object.keys(e.meta).length > 0 && (
                    <pre className="mt-1 overflow-x-auto rounded-lg bg-muted/50 p-2 font-mono text-[11px] text-foreground">{JSON.stringify(e.meta, null, 2)}</pre>
                  )}
                </div>
              )}
            </div>
          ))}
        </Panel>
      )}
    </div>
  )
}
