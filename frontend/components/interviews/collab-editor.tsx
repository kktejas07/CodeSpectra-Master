'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Users, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { csrfFetch } from '@/lib/csrf-fetch'

interface CollabEditorProps {
  sessionId: string
  initialLanguage?: string
  readOnly?: boolean
}

interface Presence {
  user_name: string
  cursor_line: number
  last_seen: string
}

export function CollabEditor({ sessionId, initialLanguage = 'javascript', readOnly = false }: CollabEditorProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState(initialLanguage)
  const [version, setVersion] = useState(0)
  const [remoteVersion, setRemoteVersion] = useState(0)
  const [presences, setPresences] = useState<Presence[]>([])
  const [loading, setLoading] = useState(true)
  const [lastSave, setLastSave] = useState<string>('')
  const isLocalChange = useRef(false)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch document on mount
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch(`/api/collab/${sessionId}`)
        const data = await res.json()
        if (data.document) {
          setCode(data.document.content)
          setLanguage(data.document.language || language)
          setVersion(data.document.version)
          setRemoteVersion(data.document.version)
        }
      } catch {} finally { setLoading(false) }
    }
    void init()
  }, [sessionId, language])

  // Push local changes (debounced)
  const pushChanges = useCallback(async (content: string) => {
    try {
      const res = await csrfFetch(`/api/collab/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, language, version }),
      })
      const data = await res.json()
      if (data.version) {
        setVersion(data.version)
        setRemoteVersion(data.version)
        setLastSave(new Date().toLocaleTimeString())
      }
    } catch {} // silent
  }, [sessionId, language, version])

  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleChange = useCallback((value: string) => {
    setCode(value)
    isLocalChange.current = true
    if (pushTimer.current) clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => pushChanges(value), 2000)
  }, [pushChanges])

  // Poll for remote changes
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/collab/${sessionId}?v=${remoteVersion}`)
        const data = await res.json()
        if (data.changed && data.document && !isLocalChange.current) {
          setCode(data.document.content)
          setVersion(data.document.version)
          setRemoteVersion(data.document.version)
        }
        isLocalChange.current = false
      } catch {}
    }
    pollTimer.current = setInterval(poll, 3000)
    return () => { if (pollTimer.current) clearInterval(pollTimer.current) }
  }, [sessionId, remoteVersion])

  // Presence heartbeat
  useEffect(() => {
    const heartbeat = () => {
      csrfFetch(`/api/collab/${sessionId}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cursor_line: 0, cursor_column: 0 }),
      }).catch(() => {})
    }
    heartbeat()
    const hbTimer = setInterval(heartbeat, 30000)
    return () => clearInterval(hbTimer)
  }, [sessionId])

  // Fetch presences periodically
  useEffect(() => {
    const fetchPresence = async () => {
      try {
        const res = await fetch(`/api/collab/${sessionId}/presence`)
        const data = await res.json()
        setPresences(data.presences || [])
      } catch {}
    }
    fetchPresence()
    const pTimer = setInterval(fetchPresence, 15000)
    return () => clearInterval(pTimer)
  }, [sessionId])

  const languages = [
    { value: 'javascript', label: 'JavaScript' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'python', label: 'Python' },
    { value: 'java', label: 'Java' },
    { value: 'cpp', label: 'C++' },
    { value: 'go', label: 'Go' },
    { value: 'rust', label: 'Rust' },
  ]

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading editor…
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-2 border-b border-border/40">
        <div className="flex items-center gap-2">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="h-7 rounded border border-border/40 bg-background px-2 text-xs outline-none"
          >
            {languages.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
          {lastSave && (
            <span className="text-[10px] text-muted-foreground">Saved {lastSave}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {presences.length > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Users className="h-3 w-3" /> {presences.length} online
            </Badge>
          )}
          <Button size="sm" variant="ghost" className="h-6 text-xs"
            onClick={async () => {
              const res = await csrfFetch(`/api/collab/${sessionId}`, { method: 'DELETE' })
              if (res.ok) {
                const data = await res.json()
                if (data.document) {
                  setCode(data.document.content)
                  setVersion(data.document.version)
                  setRemoteVersion(data.document.version)
                }
              }
            }}>
            <RotateCcw className="h-3 w-3 mr-1" /> Reset
          </Button>
        </div>
      </div>

      {/* Editor */}
      <textarea
        ref={editorRef}
        value={code}
        onChange={(e) => handleChange(e.target.value)}
        readOnly={readOnly}
        className="w-full min-h-[400px] bg-zinc-950 p-4 text-sm font-mono text-green-400 outline-none resize-y leading-relaxed"
        spellCheck={false}
        placeholder="// Start coding..."
        style={{ tabSize: 2 }}
      />
    </div>
  )
}
