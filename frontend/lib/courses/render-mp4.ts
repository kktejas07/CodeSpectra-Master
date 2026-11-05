/**
 * Render the Unstop-style Remotion composition to an H264 MP4.
 * ponytail: 720p scale (Unstop was ~720p/20fps VOD). Chrome lives on the worker image.
 */
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import { existsSync } from 'fs'
import type { ScriptItem } from '@/app/remotion/CourseVideo'
import { saveLessonMp4 } from '@/lib/courses/lesson-mp4'

let bundleUrl: string | null = null

/** Per-frame render timeout. A single frame is ~instant; 3min/frame is generous.
 * (The old 20-90min value meant that when Chrome crashed mid-render, the stuck
 * frame would sit for up to 90min at 0% CPU — the "2.5h hang in courses".) */
const PER_FRAME_TIMEOUT_MS = 3 * 60 * 1000

/** Overall render deadline (wall-clock for the whole lesson). Measured on the
 * worker host: ~4.5x realtime for a healthy 720p encode, so a healthy N-minute
 * render finishes in ~5N minutes. 15 min base + 12 min per video minute leaves
 * wide headroom for slow hosts while still being FINITE — the point is that a
 * crash-recovery deadlock (0% CPU, static file) fails in ~1-2h max instead of
 * wedging the course worker forever. */
export function renderDeadlineMs(scriptOrMinutes: ScriptItem[] | number): number {
  const minutes = typeof scriptOrMinutes === 'number'
    ? scriptOrMinutes
    : Math.max(1, Math.round(scriptOrMinutes.reduce((n, s) => n + (s.durationInFrames || 0), 0) / 30 / 60))
  return (15 + minutes * 12) * 60 * 1000
}

function chromePath(): string | undefined {
  const env = process.env.REMOTION_BROWSER_EXECUTABLE?.trim()
  if (env) return env
  for (const p of ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome']) {
    if (existsSync(p)) return p
  }
  return undefined
}

async function getBundle(): Promise<string> {
  if (bundleUrl) return bundleUrl
  const { bundle } = await import('@remotion/bundler')
  bundleUrl = await bundle({
    entryPoint: path.join(process.cwd(), 'remotion', 'index.ts'),
    webpackOverride: (config) => {
      config.resolve = config.resolve || {}
      config.resolve.alias = { ...(config.resolve.alias as Record<string, string>), '@': process.cwd() }
      return config
    },
  })
  return bundleUrl
}

export async function renderAndStoreLessonMp4(opts: {
  courseId: string
  lessonId: string
  script: ScriptItem[]
  /** Omit or pass an empty buffer to render a SILENT MP4 (TTS unavailable). */
  audio?: Buffer
  videoMinutes?: number
}): Promise<{ bytes: number; stored: 'object' | 'mongo' }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'cs-mp4-'))
  const outPath = path.join(dir, 'lesson.mp4')
  const hasAudio = Boolean(opts.audio && opts.audio.length > 0)
  try {
    if (hasAudio) await writeFile(path.join(dir, 'voice.mp3'), opts.audio!)
    const serveUrl = await getBundle()
    const { renderMedia, selectComposition } = await import('@remotion/renderer')
    const inputProps = {
      script: opts.script,
      // Remotion blocks file:// — use data URL for local TTS audio. A silent
      // lesson omits audioUrl so the <Audio> track isn't rendered.
      ...(hasAudio ? { audioUrl: `data:audio/mpeg;base64,${opts.audio!.toString('base64')}` } : {}),
    }
    // Prefer Remotion's chrome-headless-shell (works on Alpine with gcompat + setpriv shim).
    // Only force system Chromium when REMOTION_BROWSER_EXECUTABLE is set.
    const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE?.trim() || undefined
    const chromiumOptions = { enableMultiProcessOnLinux: false as const }
    const composition = await selectComposition({
      serveUrl,
      id: 'CourseVideo',
      inputProps,
      chromiumOptions,
      ...(browserExecutable ? { browserExecutable } : {}),
    })
    // Per-frame timeout is short (a frame is near-instant). The OVERALL render
    // gets a separate wall-clock watchdog (Promise.race) because Remotion's
    // crash-recovery ("killed browser, made new one") can deadlock at 0% CPU on
    // a long-form lesson — the per-frame timeout does not bound that restart
    // wait. Without this, one crashing Chrome wedged the course worker for hours.
    const overallDeadlineMs = renderDeadlineMs(opts.videoMinutes ?? opts.script)
    const render = renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: outPath,
      inputProps,
      // 1920×1080 composition → 1280×720 file (Unstop-like VOD, faster encode)
      scale: 2 / 3,
      crf: 28,
      jpegQuality: 70,
      concurrency: 1,
      timeoutInMilliseconds: PER_FRAME_TIMEOUT_MS,
      chromiumOptions,
      ...(browserExecutable ? { browserExecutable } : {}),
    })
    let deadlineTimer: NodeJS.Timeout | undefined
    const watchdog = new Promise<never>((_, reject) => {
      deadlineTimer = setTimeout(
        () => reject(new Error(`MP4 render exceeded ${Math.round(overallDeadlineMs / 60000)}min deadline (browser likely wedged)`)),
        overallDeadlineMs,
      )
    })
    try {
      await Promise.race([render, watchdog])
    } catch (e) {
      // Fail fast on the deadline: don't let a wedged render block the worker.
      throw e
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer)
    }
    const mp4 = await readFile(outPath)
    if (mp4.length < 1000) throw new Error('MP4 render produced an empty file')
    const stored = await saveLessonMp4(opts.courseId, opts.lessonId, mp4)
    return { bytes: mp4.length, stored }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
