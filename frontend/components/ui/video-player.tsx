'use client'

import '@vidstack/react/player/styles/default/theme.css'
import '@vidstack/react/player/styles/default/layouts/video.css'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MediaPlayer, MediaProvider, Track } from '@vidstack/react'
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default'
import { RemotionProviderLoader } from '@vidstack/react/player/remotion'

/** One lesson script slide — all fields optional so `any[]` lesson docs pass straight in. */
export interface TranscriptSlide {
  title?: string
  spokenText?: string
  narration?: string
  content?: unknown
  durationInFrames?: number
  durationSec?: number
  startSec?: number
}

export interface LessonChapter {
  title?: string
  startSec?: number
}

interface VideoPlayerProps {
  src: any
  title?: string
  poster?: string
  autoplay?: boolean
  muted?: boolean
  primaryColor?: string
  logoUrl?: string
  logoLinkUrl?: string
  className?: string
  startAt?: number
  captionsSrc?: string
  onProgress?: (currentTime: number, duration: number) => void
  onEnded?: () => void
  /** Lesson script slides — renders the transcript panel beneath the player. Guarded: nothing renders when empty. */
  transcriptSlides?: TranscriptSlide[] | null
  /** Lesson duration in seconds — used for slide timing fallback + final chapter end. */
  lessonDuration?: number
  /** Seek hookup — the lesson page passes `(sec) => { setStartAt(sec); setSeekNonce(n => n + 1) }` (same remount trick as its chapters list). */
  onSeekTime?: (sec: number) => void
  /** Explicit chapters — a `kind="chapters"` track is generated client-side; falls back to slides grouped 4-at-a-time. */
  chapters?: LessonChapter[] | null
  /** Next-lesson URL — when `video_player_autoplay_next` is on, ending shows a 3s cancellable "Up next" overlay then navigates. */
  nextLessonUrl?: string
}

type PlayerSettings = {
  video_player_primary_color?: string
  video_player_autoplay?: boolean
  video_player_muted?: boolean
  video_player_logo_url?: string
  video_player_logo_link_url?: string
  video_player_captions_default?: boolean
  video_player_default_speed?: number
  video_player_transcript?: 'open' | 'closed' | 'off'
  video_player_chapters?: boolean
  video_player_autoplay_next?: boolean
  video_player_pip?: boolean
}

const RATE_KEY = 'codespectra:player-rate'

function readSavedRate(): number | null {
  try {
    const raw = window.localStorage.getItem(RATE_KEY)
    if (raw == null) return null
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0.25 && n <= 4 ? n : null
  } catch {
    return null
  }
}

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  return `${m}:${String(r).padStart(2, '0')}`
}

function fmtVtt(sec: number): string {
  const s = Math.max(0, Number(sec) || 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = Math.floor(s % 60)
  const ms = Math.floor((s - Math.floor(s)) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

interface TranscriptEntry {
  title: string
  text: string
  start: number
}

/** Cumulative slide start times: explicit startSec wins, else durationInFrames/30, else even split of lesson duration. */
function buildTranscriptEntries(
  slides: TranscriptSlide[] | null | undefined,
  duration: number | undefined,
): TranscriptEntry[] {
  if (!Array.isArray(slides) || slides.length === 0) return []
  const rows = slides
    .map((s: any, i: number) => {
      const text = String(s?.spokenText ?? s?.narration ?? '').trim()
      const title = (String(s?.title ?? `Part ${i + 1}`) || `Part ${i + 1}`).slice(0, 120)
      const explicit = Number(s?.startSec)
      const dur = Number(s?.durationInFrames) / 30 || Number(s?.durationSec) || 0
      return { title, text, start: Number.isFinite(explicit) && explicit >= 0 ? explicit : NaN, dur }
    })
    .filter((r) => r.text)
  if (rows.length === 0) return []
  const totalDur = rows.reduce((n, r) => n + (r.dur > 0 ? r.dur : 0), 0)
  const even = totalDur <= 0 && Number(duration) > 0 ? Number(duration) / rows.length : 0
  let cursor = 0
  return rows.map((r) => {
    const start = Number.isFinite(r.start) ? (r.start as number) : cursor
    cursor = start + (r.dur > 0 ? r.dur : even)
    return { title: r.title, text: r.text, start: Math.max(0, Math.floor(start)) }
  })
}

/** Chapters VTT: explicit lesson.chapters[] wins, else transcript entries grouped 4-at-a-time. Null when neither exists. */
function buildChaptersVtt(
  chapters: LessonChapter[] | null | undefined,
  entries: TranscriptEntry[],
  duration: number | undefined,
): string | null {
  const explicit = (Array.isArray(chapters) ? chapters : [])
    .map((c: any, i: number) => ({
      title: (String(c?.title ?? `Chapter ${i + 1}`) || `Chapter ${i + 1}`).slice(0, 120),
      start: Number(c?.startSec),
    }))
    .filter((c) => Number.isFinite(c.start) && c.start >= 0)
    .sort((a, b) => a.start - b.start)
  const items =
    explicit.length > 0
      ? explicit
      : entries.length >= 2
        ? entries.filter((_, i) => i % 4 === 0).map((e) => ({ title: e.title, start: e.start }))
        : []
  if (items.length === 0) return null
  const total = Number(duration) > 0 ? Number(duration) : items[items.length - 1].start + 60
  const cues = items.map((item, i) => {
    const end = i + 1 < items.length ? items[i + 1].start : Math.max(item.start + 1, total)
    return `${fmtVtt(item.start)} --> ${fmtVtt(end)}\n${item.title}`
  })
  return `WEBVTT\n\n${cues.join('\n\n')}\n`
}

export function VideoPlayer({
  src,
  title = 'Video',
  poster,
  autoplay,
  muted,
  primaryColor,
  logoUrl,
  logoLinkUrl,
  className = '',
  startAt = 0,
  captionsSrc,
  onProgress,
  onEnded,
  transcriptSlides,
  lessonDuration,
  onSeekTime,
  chapters,
  nextLessonUrl,
}: VideoPlayerProps) {
  const router = useRouter()
  const [settings, setSettings] = useState<PlayerSettings>({})
  const player = useRef<any>(null)
  const appliedStart = useRef(false)
  const onProgressRef = useRef(onProgress)
  const onEndedRef = useRef(onEnded)
  onProgressRef.current = onProgress
  onEndedRef.current = onEnded

  // Speed persistence: localStorage choice wins, superadmin default_speed is the fallback.
  // ponytail: no state for the rate — mount/remount re-reads localStorage, and the player owns the live value.
  const [savedRate] = useState<number | null>(() => readSavedRate())
  const skipPersistOnce = useRef(false)
  const defaultSpeed =
    Number.isFinite(Number(settings.video_player_default_speed)) &&
    Number(settings.video_player_default_speed) >= 0.25 &&
    Number(settings.video_player_default_speed) <= 4
      ? Number(settings.video_player_default_speed)
      : 1
  const effectiveRate = savedRate ?? defaultSpeed

  // Transcript highlight clock (whole seconds only — same-value setState bails out, no extra renders).
  const [nowSec, setNowSec] = useState(0)

  // Autoplay-next overlay.
  const [upNext, setUpNext] = useState(false)
  const upNextTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/platform/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.settings) {
          setSettings(data.settings)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    appliedStart.current = false
    setUpNext(false)
  }, [src, startAt])

  useEffect(() => () => {
    if (upNextTimer.current) clearTimeout(upNextTimer.current)
  }, [])

  const entries = useMemo(
    () => buildTranscriptEntries(transcriptSlides, lessonDuration),
    [transcriptSlides, lessonDuration],
  )

  const chaptersVtt = useMemo(
    () => buildChaptersVtt(chapters, entries, lessonDuration),
    [chapters, entries, lessonDuration],
  )
  // ponytail: blob URL in an effect, not useMemo — createObjectURL must not run during SSR prerender (hydration mismatch).
  const [chaptersUrl, setChaptersUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!chaptersVtt) {
      setChaptersUrl(null)
      return
    }
    const url = URL.createObjectURL(new Blob([chaptersVtt], { type: 'text/vtt' }))
    setChaptersUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [chaptersVtt])

  const transcriptMode =
    settings.video_player_transcript === 'open' ||
    settings.video_player_transcript === 'closed' ||
    settings.video_player_transcript === 'off'
      ? settings.video_player_transcript
      : 'closed'
  const [transcriptToggled, setTranscriptToggled] = useState<boolean | null>(null)
  const transcriptOpen = transcriptToggled ?? transcriptMode === 'open'
  const chaptersEnabled = settings.video_player_chapters !== false
  const showPip = settings.video_player_pip !== false

  const activeIdx = useMemo(() => {
    let idx = 0
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].start <= nowSec) idx = i
      else break
    }
    return idx
  }, [entries, nowSec])

  const emitProgress = () => {
    const el = player.current
    if (!el) return
    onProgressRef.current?.(Number(el.currentTime) || 0, Number(el.duration) || 0)
    const s = Math.floor(Number(el.currentTime) || 0)
    setNowSec((prev) => (prev === s ? prev : s))
  }

  const persistRate = (rate: number) => {
    if (skipPersistOnce.current) {
      skipPersistOnce.current = false
      return
    }
    try {
      window.localStorage.setItem(RATE_KEY, String(rate))
    } catch {}
  }

  const seekTo = (sec: number) => {
    if (onSeekTime) {
      onSeekTime(sec)
    } else if (player.current) {
      try {
        player.current.currentTime = sec
      } catch {}
    }
  }

  const cancelUpNext = () => {
    if (upNextTimer.current) clearTimeout(upNextTimer.current)
    upNextTimer.current = null
    setUpNext(false)
  }

  const handleEnded = () => {
    emitProgress()
    onEndedRef.current?.()
    if (settings.video_player_autoplay_next === true && nextLessonUrl) {
      setUpNext(true)
      if (upNextTimer.current) clearTimeout(upNextTimer.current)
      upNextTimer.current = setTimeout(() => {
        setUpNext(false)
        upNextTimer.current = null
        router.push(nextLessonUrl)
      }, 3000)
    }
  }

  const finalAutoplay = autoplay ?? settings.video_player_autoplay === true
  const finalMuted = muted ?? settings.video_player_muted === true
  const finalColor = primaryColor ?? settings.video_player_primary_color ?? '#34d399'
  const finalLogoUrl = logoUrl ?? settings.video_player_logo_url ?? ''
  const finalLogoLinkUrl = logoLinkUrl ?? settings.video_player_logo_link_url ?? ''
  const finalCaptionsDefault = settings.video_player_captions_default === true

  const logo = finalLogoUrl ? (
    <a
      href={finalLogoLinkUrl || undefined}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => { if (!finalLogoLinkUrl) e.preventDefault() }}
      className="ml-3 mr-1 flex items-center"
    >
      <img
        src={finalLogoUrl}
        alt=""
        className="h-7 w-auto max-w-30 object-contain"
        loading="lazy"
      />
    </a>
  ) : null

  return (
    <div className={`relative overflow-hidden rounded-md border ${className}`}>
      <MediaPlayer
        ref={player}
        src={src}
        title={title}
        // Vidstack React prop is camelCase `autoPlay` — lowercase `autoplay` is ignored / treated as a DOM flag
        autoPlay={finalAutoplay}
        muted={finalMuted}
        playsInline
        className="h-full w-full"
        style={{ '--video-brand': finalColor } as any}
        onCanPlay={() => {
          const el = player.current
          if (!el) return
          if (!appliedStart.current && startAt > 0) {
            el.currentTime = startAt
            appliedStart.current = true
          }
          // Restore persisted speed (or superadmin default) — skip persisting this programmatic set.
          if (Number.isFinite(Number(el.playbackRate)) && Math.abs(Number(el.playbackRate) - effectiveRate) > 1e-6) {
            skipPersistOnce.current = true
            try {
              el.playbackRate = effectiveRate
            } catch {}
          }
        }}
        onTimeUpdate={emitProgress}
        onPause={emitProgress}
        onRateChange={(rate: number) => persistRate(Number(rate) || 1)}
        onEnded={handleEnded}
      >
        <MediaProvider loaders={[RemotionProviderLoader]}>
          {captionsSrc ? (
            <Track src={captionsSrc} kind="subtitles" label="English" language="en" default={finalCaptionsDefault} />
          ) : null}
          {chaptersEnabled && chaptersUrl ? (
            <Track src={chaptersUrl} kind="chapters" label="Chapters" language="en" />
          ) : null}
        </MediaProvider>
        <DefaultVideoLayout
          thumbnails={poster}
          icons={defaultLayoutIcons}
          color={finalColor}
          // ponytail: DefaultVideoLayout's slot() renders the slot value verbatim when defined —
          // `pipButton: null` removes the PiP button, no CSS hack needed (verified in vidstack source).
          slots={{ topControlsGroupStart: logo, ...(showPip ? {} : { pipButton: null }) }}
        />
      </MediaPlayer>
      {upNext && nextLessonUrl ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-4">
          <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-zinc-900 px-5 py-4 shadow-xl">
            <div className="text-sm text-white">
              <p className="font-semibold">Up next…</p>
              <p className="text-xs text-zinc-400">Continuing in 3 seconds</p>
            </div>
            <button
              onClick={cancelUpNext}
              className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {entries.length > 0 && transcriptMode !== 'off' ? (
        <div className="border-t border-border/40 bg-background">
          <button
            onClick={() => setTranscriptToggled((v) => !(v ?? transcriptMode === 'open'))}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium hover:bg-muted/40"
            aria-expanded={transcriptOpen}
          >
            <span>Transcript <span className="ml-1 font-normal text-muted-foreground">({entries.length} parts)</span></span>
            <span className="text-muted-foreground">{transcriptOpen ? '▾' : '▸'}</span>
          </button>
          {transcriptOpen ? (
            <ol className="max-h-64 space-y-0.5 overflow-y-auto px-2 pb-3">
              {entries.map((e, i) => (
                <li key={i}>
                  <button
                    onClick={() => seekTo(e.start)}
                    className={`flex w-full items-start gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60 ${
                      i === activeIdx ? 'bg-primary/10 text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    <span className="shrink-0 font-mono text-xs text-primary">{fmtClock(e.start)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-foreground/80">{e.title}</span>
                      <span className="block line-clamp-2 text-xs leading-relaxed">{e.text.slice(0, 280)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
