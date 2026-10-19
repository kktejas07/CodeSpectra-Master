'use client'

/**
 * Plays a proctoring recording that was uploaded as ~1-minute WebM chunks
 * (lib/proctoring/recordings.ts). One <video> element walks the chunk list;
 * the timeline spans the whole attempt, so seeking jumps to the right chunk
 * and position. Webcam and screen share one clock: switching keeps the moment.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Monitor, Pause, Play, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { locate } from '@/lib/proctoring/recording-playback'

export interface PlayerItem { id: string; chunk_index: number; offset_ms: number; duration_ms: number; url: string; has_audio: boolean }
export interface PlayerRecording {
  total_ms: number
  origin_ms: number
  streams: { webcam: PlayerItem[]; screen: PlayerItem[] }
  gaps: Array<{ stream: 'webcam' | 'screen'; after_index: number; missing: number[] }>
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

export function RecordingPlayer({ recording, onExpired }: { recording: PlayerRecording; onExpired?: () => void }) {
  const hasScreen = recording.streams.screen.length > 0
  const hasWebcam = recording.streams.webcam.length > 0
  const [stream, setStream] = useState<'webcam' | 'screen'>(hasWebcam ? 'webcam' : 'screen')
  const items = recording.streams[stream]
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [idx, setIdx] = useState(0)
  const pendingSeek = useRef<number>(0)
  const [now, setNow] = useState(items[0]?.offset_ms ?? 0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((t: number, list = items) => {
    const at = locate(list, t)
    if (!at) { setPlaying(false); return }
    pendingSeek.current = at.within_ms / 1000
    setIdx(at.index)
    setNow(list[at.index].offset_ms + at.within_ms)
    const v = videoRef.current
    // Same chunk: seek in place without reloading.
    if (v && at.index === idx && list === items) v.currentTime = pendingSeek.current
  }, [items, idx])

  // Switching stream keeps the current moment.
  useEffect(() => { load(now, recording.streams[stream]) }, [stream]) // eslint-disable-line react-hooks/exhaustive-deps

  const item = items[idx]
  const gapsHere = useMemo(() => recording.gaps.filter((g) => g.stream === stream), [recording.gaps, stream])

  const onLoaded = () => {
    const v = videoRef.current
    if (!v) return
    v.playbackRate = rate
    if (pendingSeek.current > 0) v.currentTime = pendingSeek.current
    pendingSeek.current = 0
    if (playing) v.play().catch(() => setPlaying(false))
  }
  const onTime = () => {
    const v = videoRef.current
    if (v && item) setNow(item.offset_ms + v.currentTime * 1000)
  }
  const onEnded = () => {
    if (idx + 1 < items.length) {
      pendingSeek.current = 0
      setIdx(idx + 1)
      setNow(items[idx + 1].offset_ms)
    } else {
      setPlaying(false)
    }
  }
  const toggle = () => {
    const v = videoRef.current
    if (!v) return
    if (playing) { v.pause(); setPlaying(false) } else { v.play().then(() => setPlaying(true)).catch(() => setPlaying(false)) }
  }

  if (!items.length) {
    return <p className="text-sm text-muted-foreground">No footage for this stream.</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Recording stream">
        {hasWebcam && (
          <Button type="button" size="sm" role="tab" aria-selected={stream === 'webcam'} variant={stream === 'webcam' ? 'default' : 'outline'} onClick={() => setStream('webcam')} className="gap-2">
            <Camera className="h-4 w-4" aria-hidden /> Webcam
          </Button>
        )}
        {hasScreen && (
          <Button type="button" size="sm" role="tab" aria-selected={stream === 'screen'} variant={stream === 'screen' ? 'default' : 'outline'} onClick={() => setStream('screen')} className="gap-2">
            <Monitor className="h-4 w-4" aria-hidden /> Screen
          </Button>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          Speed
          <select
            className="rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground"
            value={rate}
            onChange={(e) => { const r = Number(e.target.value); setRate(r); if (videoRef.current) videoRef.current.playbackRate = r }}
          >
            {[1, 1.5, 2, 4].map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
        </label>
      </div>

      {/* Video canvas: dark in both themes by design. */}
      <div className="overflow-hidden rounded-2xl bg-black">
        <video
          key={`${stream}-${item?.id}`}
          ref={videoRef}
          src={item?.url}
          className="aspect-video w-full"
          preload="auto"
          playsInline
          onLoadedMetadata={onLoaded}
          onTimeUpdate={onTime}
          onEnded={onEnded}
          onError={() => { setError('This part of the recording could not be loaded. The link may have expired — reload the page.'); onExpired?.() }}
          onPlay={() => setError(null)}
          aria-label={`${stream === 'webcam' ? 'Webcam' : 'Screen'} recording`}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" size="icon" variant="outline" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="h-11 w-11 shrink-0">
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <input
          type="range"
          min={0}
          max={Math.max(1, recording.total_ms)}
          step={1000}
          value={Math.min(now, recording.total_ms)}
          onChange={(e) => load(Number(e.target.value))}
          className="w-full accent-[hsl(var(--primary))]"
          aria-label="Seek"
          aria-valuetext={fmtClock(now)}
        />
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{fmtClock(now)} / {fmtClock(recording.total_ms)}</span>
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        Part {idx + 1} of {items.length}{item && !item.has_audio && stream === 'webcam' ? ' · no audio' : ''}
      </p>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {gapsHere.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {gapsHere.reduce((n, g) => n + g.missing.length, 0)} minute-long part(s) of the {stream} recording never arrived
            (after part{gapsHere.length > 1 ? 's' : ''} {gapsHere.map((g) => g.after_index + 1).join(', ')}). The player skips over them.
          </span>
        </div>
      )}
    </div>
  )
}
