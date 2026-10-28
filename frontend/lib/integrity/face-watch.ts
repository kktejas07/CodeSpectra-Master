/**
 * Face count + head turn from one camera frame (browser only). Reuses
 * @vladmandic/face-api — the same library and self-hosted models (CDN
 * fallback) as components/auth/face-camera.tsx and the eye-gaze tracker —
 * loaded lazily so pages without camera signals never download it.
 *
 * Phone / book detection is NOT done: no light in-browser object model is
 * shipped with the app (face-api only finds faces).
 */
type FaceApi = typeof import('@vladmandic/face-api')

let api: FaceApi | null = null
let loading: Promise<FaceApi | null> | null = null
const MODEL_URLS = ['/models', 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model']

export function loadFaceWatch(): Promise<FaceApi | null> {
  if (api) return Promise.resolve(api)
  if (!loading) {
    loading = (async () => {
      try {
        const faceapi = await import('@vladmandic/face-api')
        await (faceapi.tf as { ready?: () => Promise<void> })?.ready?.()
        for (const base of MODEL_URLS) {
          try {
            await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(base), faceapi.nets.faceLandmark68TinyNet.loadFromUri(base)])
            api = faceapi
            return faceapi
          } catch { /* next source */ }
        }
        return null
      } catch {
        return null
      } finally {
        if (!api) loading = null
      }
    })()
  }
  return loading
}

export interface FaceSample {
  /** Faces found (0 = nobody in view). */
  count: number
  /** Head yaw in degrees of the largest face (positive = turned right), null without landmarks. */
  yaw: number | null
}

type Pt = { x: number; y: number }
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** Yaw from 68-point landmarks (same geometry as lib/proctoring/eye-gaze-tracker.ts). Pure. */
export function yawFromLandmarks(pts: readonly Pt[]): number | null {
  if (pts.length < 46) return null
  const l = mid(pts[36], pts[39])
  const r = mid(pts[42], pts[45])
  const eye = mid(l, r)
  const inter = Math.max(1, Math.hypot(l.x - r.x, l.y - r.y))
  return Math.round(((pts[30].x - eye.x) / inter) * 90)
}

export async function sampleFaces(video: HTMLVideoElement): Promise<FaceSample | null> {
  if (!api || !video || video.readyState < 2) return null
  try {
    const found = await api
      .detectAllFaces(video, new api.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 }))
      .withFaceLandmarks(true)
    if (!found.length) return { count: 0, yaw: null }
    const biggest = found.reduce((a, b) => (b.detection.box.area > a.detection.box.area ? b : a))
    return { count: found.length, yaw: yawFromLandmarks(biggest.landmarks.positions as Pt[]) }
  } catch {
    return null
  }
}

/** A small JPEG of the current frame (for violation snapshots). */
export function frameJpeg(video: HTMLVideoElement, width = 320, quality = 0.6): string | null {
  if (!video || video.readyState < 2 || !video.videoWidth) return null
  const h = Math.round((video.videoHeight / video.videoWidth) * width)
  const c = document.createElement('canvas')
  c.width = width
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, width, h)
  try { return c.toDataURL('image/jpeg', quality) } catch { return null }
}
