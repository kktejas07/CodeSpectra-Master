'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Shield, AlertTriangle, Eye, EyeOff, Search, LogOut, RotateCcw, Copy, ClipboardPaste, Bell, Monitor, Usb, Mic, Video, Globe, Keyboard, Mouse, Maximize, Move } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { SkeletonStats, SkeletonList } from '@/components/ui/skeleton-boneyard'

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
  multi_face: '👥', no_face: '😶',

  // Idle & Session
  idle_60s: '💤',
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
  // Info
  copy: 'info', paste: 'info', right_click: 'info',
  clipboard_copy: 'info', clipboard_paste: 'info', copy_paste_attempt: 'info',
  keyboard_shortcut_blocked: 'info', right_click_blocked: 'info',
  usb_device_unplugged: 'info', usb_device_removed: 'info',
  screen_share_ended: 'info', hardware_port_audit: 'info',
  window_focus: 'info', viewport_restored: 'info',
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
    { id: 'all', label: 'All Events' },
    { id: 'critical', label: 'Critical Only' },
    { id: 'focus', label: 'Focus & Navigation' },
    { id: 'clipboard', label: 'Clipboard' },
    { id: 'screen', label: 'Screen & Display' },
    { id: 'hardware', label: 'USB & Hardware' },
    { id: 'audio', label: 'Audio' },
    { id: 'applications', label: 'Apps & Proxy' },
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

      <div className="flex gap-2 flex-wrap">
        <Input placeholder="Search by session ID, user ID, or event type…" value={search}
          onChange={(e) => setSearch(e.target.value)} />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.label}</option>
          ))}
        </select>
        <Button variant="outline" onClick={() => load(search)}>
          <Search className="h-4 w-4" />
        </Button>
        {categoryFilter !== 'all' && (
          <Button variant="ghost" size="sm" onClick={() => setCategoryFilter('all')}>
            Clear Filter
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-6">
          <SkeletonStats />
          <SkeletonList count={5} />
        </div>
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
                    {userMap[e.user_id]?.name || e.user_id.slice(0, 16)} · {e.session_id.slice(0, 24)}… · {new Date(e.created_at).toLocaleTimeString()}
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
                  <p>User: {userMap[e.user_id]?.name || e.user_id}{userMap[e.user_id]?.email ? ` (${userMap[e.user_id].email})` : ''}</p>
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
