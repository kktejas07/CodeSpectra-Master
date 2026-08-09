/**
 * CodeSpectra Analytics — Session Replay Viewer.
 *
 * Uses rrweb's replayEvents to play back recorded DOM mutations.
 * Shows timeline, play/pause, speed control, and event markers.
 */
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Play, Pause, SkipBack, SkipForward, RotateCcw,
  Loader2, Clock, MousePointer, Type,
} from 'lucide-react'

interface ReplayEvent {
  type: number
  timestamp: number
  data?: Record<string, unknown>
}

interface ReplayViewerProps {
  events: ReplayEvent[]
  onClose?: () => void
}

// rrweb event types
const EventType = {
  DOMContentLoaded: 0,
  Load: 1,
  FullSnapshot: 2,
  IncrementalSnapshot: 3,
  Meta: 4,
  Custom: 5,
  Plugin: 6,
}

const IncrementalSource = {
  Mutation: 0,
  MouseMove: 1,
  MouseInteraction: 2,
  Scroll: 3,
  ViewportResize: 4,
  Input: 5,
  TouchMove: 6,
  MediaInteraction: 7,
  StyleSheetRule: 8,
  CanvasMutation: 9,
  Font: 10,
  Log: 11,
}

export function ReplayViewer({ events, onClose }: ReplayViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [loading, setLoading] = useState(true)

  const totalEvents = events.length
  const progress = totalEvents > 0 ? (currentIndex / totalEvents) * 100 : 0

  // Replay events using rrweb
  useEffect(() => {
    if (!containerRef.current || events.length === 0) return

    let cancelled = false

    import('rrweb').then(({ Replayer }) => {
      if (cancelled || !containerRef.current) return

      // Clear container
      containerRef.current.innerHTML = ''

      // Filter to full snapshots and incremental snapshots
      const replayableEvents = events.filter(e =>
        e.type === EventType.FullSnapshot ||
        e.type === EventType.IncrementalSnapshot ||
        e.type === EventType.Meta
      )

      if (replayableEvents.length === 0) {
        setLoading(false)
        return
      }

      try {
        const replayer = new Replayer(replayableEvents as any, {
          root: containerRef.current,
          speed,
        })
        replayer.play()
      } catch {
        // replay failed silently
      }

      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [events, speed])

  const handlePlay = useCallback(() => {
    setPlaying(!playing)
  }, [playing])

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = Math.round((parseFloat(e.target.value) / 100) * totalEvents)
    setCurrentIndex(idx)
  }, [totalEvents])

  const handleSpeedChange = useCallback(() => {
    setSpeed(s => s === 1 ? 2 : s === 2 ? 4 : 1)
  }, [])

  // Count event types for stats
  const mouseEvents = events.filter(e => e.type === EventType.IncrementalSnapshot && (e.data?.source === IncrementalSource.MouseMove || e.data?.source === IncrementalSource.MouseInteraction)).length
  const inputEvents = events.filter(e => e.type === EventType.IncrementalSnapshot && e.data?.source === IncrementalSource.Input).length
  const scrollEvents = events.filter(e => e.type === EventType.IncrementalSnapshot && e.data?.source === IncrementalSource.Scroll).length

  // Time range
  const startTime = events[0]?.timestamp || 0
  const endTime = events[events.length - 1]?.timestamp || 0
  const duration = Math.round((endTime - startTime) / 1000)

  return (
    <Card className="border-border/60 overflow-hidden">
      {/* Header */}
      <div className="border-b border-border/60 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="font-semibold">Session Replay</h3>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{duration}s</span>
            <span className="flex items-center gap-1"><MousePointer className="h-3 w-3" />{mouseEvents} clicks</span>
            <span className="flex items-center gap-1"><Type className="h-3 w-3" />{inputEvents} inputs</span>
            <span>{scrollEvents} scrolls</span>
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        )}
      </div>

      {/* Replay container */}
      <div className="relative bg-black/5" style={{ height: 400 }}>
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading replay…
          </div>
        ) : (
          <div ref={containerRef} className="w-full h-full" />
        )}
      </div>

      {/* Controls */}
      <div className="border-t border-border/60 px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setCurrentIndex(0)}>
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handlePlay}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCurrentIndex(totalEvents)}>
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>

        <input
          type="range"
          min={0}
          max={100}
          value={progress}
          onChange={handleSeek}
          className="flex-1 h-1.5 bg-muted rounded-full appearance-none cursor-pointer"
        />

        <Button variant="ghost" size="sm" onClick={handleSpeedChange}>
          {speed}x
        </Button>

        <Badge variant="outline" className="text-xs tabular-nums">
          {currentIndex}/{totalEvents}
        </Badge>
      </div>
    </Card>
  )
}
