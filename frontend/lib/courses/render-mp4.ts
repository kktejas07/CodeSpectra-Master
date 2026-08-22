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
  audio: Buffer
}): Promise<{ bytes: number; stored: 'object' | 'mongo' }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'cs-mp4-'))
  const audioPath = path.join(dir, 'voice.mp3')
  const outPath = path.join(dir, 'lesson.mp4')
  try {
    await writeFile(audioPath, opts.audio)
    const serveUrl = await getBundle()
    const { renderMedia, selectComposition } = await import('@remotion/renderer')
    const inputProps = {
      script: opts.script,
      // Remotion blocks file:// — use data URL for local TTS audio
      audioUrl: `data:audio/mpeg;base64,${opts.audio.toString('base64')}`,
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
    await renderMedia({
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
      timeoutInMilliseconds: 20 * 60 * 1000,
      chromiumOptions,
      ...(browserExecutable ? { browserExecutable } : {}),
    })
    const mp4 = await readFile(outPath)
    if (mp4.length < 1000) throw new Error('MP4 render produced an empty file')
    const stored = await saveLessonMp4(opts.courseId, opts.lessonId, mp4)
    return { bytes: mp4.length, stored }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
