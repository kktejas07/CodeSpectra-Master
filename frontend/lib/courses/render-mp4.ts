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

/** Hard ceiling for a single lesson render. The formula below is already
 * generous; this stops a 60-min script from being granted hours of wall clock. */
const MAX_RENDER_DEADLINE_MS = 75 * 60 * 1000

/** Overall render deadline (wall-clock for the whole lesson). Measured on the
 * worker host: 6000 frames render in ~306s (~20 fps) with no audio, so a
 * healthy N-minute lesson needs roughly 1.3N minutes at 30fps.
 *
 * History: this used to be `(15 + N*12)` minutes. For the 60-min lessons the
 * admin UI queued that is 12.25 HOURS — so a genuinely wedged Chrome (static
 * pre-encode.mp4, 90% CPU, zero frames) was never reaped and blocked the single
 * worker replica for hours at a time. Bounded by MAX_RENDER_DEADLINE_MS now. */
export function renderDeadlineMs(scriptOrMinutes: ScriptItem[] | number): number {
  const minutes = typeof scriptOrMinutes === 'number'
    ? scriptOrMinutes
    : Math.max(1, Math.round(scriptOrMinutes.reduce((n, s) => n + (s.durationInFrames || 0), 0) / 30 / 60))
  return Math.min(MAX_RENDER_DEADLINE_MS, (8 + minutes * 5) * 60 * 1000)
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
    const { renderMedia, selectComposition, makeCancelSignal } = await import('@remotion/renderer')
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
    // ponytail: memory-tunable for constrained hosts. Production (Docker worker)
    // runs the 720p/concurrency-1 defaults; a low-RAM box can set
    // LESSON_RENDER_SCALE=0.5 (≈540p, ⅓ the per-frame memory) and/or
    // LESSON_RENDER_CONCURRENCY=2 to trade RAM for wall-clock.
    const scale = process.env.LESSON_RENDER_SCALE ? Number(process.env.LESSON_RENDER_SCALE) : 2 / 3
    const concurrency = process.env.LESSON_RENDER_CONCURRENCY ? Number(process.env.LESSON_RENDER_CONCURRENCY) : 1
    // CRITICAL: keep Remotion's shared-memory frame capture OFF.
    // Remotion 4.0.537 introduced a raw-frame fast path that hands JPEG frames
    // to ffmpeg through shared-memory pools. On this worker image (Ubuntu
    // container, 64MB /dev/shm, musl compositor under gcompat) it stalls after
    // roughly 2-3k frames: Chrome sits at ~100% CPU, the Node render loop waits
    // on a promise forever, and pre-encode.mp4 stops growing at a fixed byte
    // count. That was the "0 videos generated" failure — every lesson wedged,
    // and the old 12-hour deadline never reaped it.
    // Measured with the stalled lesson's own 15-slide/23,701-frame script:
    // default path froze at ~2800 frames; with disableSharedMemoryCapture it
    // rendered 4000 frames in 402s (~10 fps) with no stall.
    const disableSharedMemoryCapture = true
    // A rejected watchdog promise does NOT stop Remotion — Chrome + ffmpeg keep
    // rendering at 100% CPU and starve the next lesson on a single-replica
    // worker. `cancel()` actually tears the browser down.
    const { cancelSignal, cancel } = makeCancelSignal()
    const render = renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: outPath,
      inputProps,
      // 1920×1080 composition → 1280×720 file (Unstop-like VOD, faster encode)
      scale,
      crf: 28,
      jpegQuality: 70,
      concurrency,
      disableSharedMemoryCapture,
      timeoutInMilliseconds: PER_FRAME_TIMEOUT_MS,
      chromiumOptions,
      cancelSignal,
      ...(browserExecutable ? { browserExecutable } : {}),
    })
    let deadlineTimer: NodeJS.Timeout | undefined
    const watchdog = new Promise<never>((_, reject) => {
      deadlineTimer = setTimeout(
        () => {
          cancel()
          reject(new Error(`MP4 render exceeded ${Math.round(overallDeadlineMs / 60000)}min deadline (browser likely wedged)`))
        },
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
