/**
 * Eye Gaze, Blink Counter & Head Pose Tracker for AI Proctoring.
 *
 * Uses `@vladmandic/face-api` (the same library + self-hosted models as the
 * face-camera) to detect 68 face landmarks per frame, then derives:
 * 1. Blink detection via Eye Aspect Ratio (EAR).
 * 2. Gaze direction from eye/nose geometry.
 * 3. Head pose (yaw/pitch) from landmark geometry.
 * 4. A basic attentiveness gesture.
 *
 * History: this used to guess everything from raw luma of fixed pixel regions
 * with thresholds (< 22 or > 200) that almost never fire on a normally-lit
 * face, so blinks stayed 0 and gaze stayed "center" forever. Landmarks fix that.
 */

export interface EyeGazeAnalysis {
  gazeDirection: 'center' | 'left' | 'right' | 'up' | 'down'
  blinkCount: number
  isEyeClosed: boolean
  headPose: { yaw: number; pitch: number; roll: number; isTurnedAway: boolean }
  faceDetected: boolean
  emotionGesture: 'neutral' | 'focused' | 'distracted' | 'suspicious_motion'
  confidenceScore: number
}

const EMPTY: EyeGazeAnalysis = {
  gazeDirection: 'center',
  blinkCount: 0,
  isEyeClosed: false,
  headPose: { yaw: 0, pitch: 0, roll: 0, isTurnedAway: false },
  faceDetected: false,
  emotionGesture: 'neutral',
  confidenceScore: 0,
}

// Eye Aspect Ratio below this (on a closed frame, after having been open) = blink.
const EAR_BLINK_THRESHOLD = 0.21
// Gaze / head-pose dead-zone (degrees).
const YAW_THRESHOLD = 14
const PITCH_THRESHOLD = 14
const TURNED_AWAY_THRESHOLD = 25

type Pt = { x: number; y: number }
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

function eyeAspectRatio(pts: Pt[]): number {
  // Standard 6-point EAR: (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
  const [p1, p2, p3, p4, p5, p6] = pts
  const horiz = dist(p1, p4)
  if (horiz === 0) return 0
  return (dist(p2, p6) + dist(p3, p5)) / (2 * horiz)
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

export class EyeGazeTracker {
  private blinkCount = 0
  private lastEyeClosed = false
  private ready = false
  private loading: Promise<boolean> | null = null
  private faceapi: typeof import('@vladmandic/face-api') | null = null

  /** Load the tiny face detector + landmark models (self-hosted, CDN fallback). */
  public async load(): Promise<boolean> {
    if (this.ready) return true
    if (this.loading) return this.loading
    this.loading = (async () => {
      try {
        const faceapi = await import('@vladmandic/face-api')
        await (faceapi.tf as { ready?: () => Promise<void> })?.ready?.()
        try {
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
          ])
        } catch {
          // Fallback to the public CDN if the self-hosted models are missing.
          const base = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model'
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(base),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(base),
          ])
        }
        this.faceapi = faceapi
        this.ready = true
        return true
      } catch {
        this.ready = false
        return false
      }
    })()
    return this.loading
  }

  public isReady(): boolean {
    return this.ready
  }

  public async analyzeFrame(video: HTMLVideoElement): Promise<EyeGazeAnalysis> {
    if (!video || video.paused || video.ended || video.readyState < 2) return { ...EMPTY, blinkCount: this.blinkCount }
    if (!this.ready || !this.faceapi) return { ...EMPTY, blinkCount: this.blinkCount }

    try {
      const faceapi = this.faceapi
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 }))
        .withFaceLandmarks(true)
      if (!detection) {
        this.lastEyeClosed = false
        return { ...EMPTY, blinkCount: this.blinkCount, faceDetected: false, emotionGesture: 'neutral' }
      }

      const pts = detection.landmarks.positions as Pt[]
      const leftEye = pts.slice(36, 42)
      const rightEye = pts.slice(42, 48)
      const earAvg = (eyeAspectRatio(leftEye) + eyeAspectRatio(rightEye)) / 2

      // Blink: eye must be closed (EAR < threshold) then reopen to count once.
      const closed = earAvg < EAR_BLINK_THRESHOLD
      if (closed && !this.lastEyeClosed) {
        this.lastEyeClosed = true
      } else if (!closed && this.lastEyeClosed) {
        this.lastEyeClosed = false
        this.blinkCount++
      }

      // Gaze / head pose from eye-line vs nose geometry.
      const leftCenter = mid(pts[36], pts[39])
      const rightCenter = mid(pts[42], pts[45])
      const eyeMid = mid(leftCenter, rightCenter)
      const interOcular = Math.max(1, dist(leftCenter, rightCenter))
      const nose = pts[30]
      const yawRatio = (nose.x - eyeMid.x) / interOcular
      const pitchRatio = (nose.y - eyeMid.y) / interOcular
      const yaw = Math.round(yawRatio * 90)
      const pitch = Math.round((pitchRatio - 0.7) * 90)
      const isTurnedAway = Math.abs(yaw) > TURNED_AWAY_THRESHOLD || Math.abs(pitch) > TURNED_AWAY_THRESHOLD

      let gazeDirection: EyeGazeAnalysis['gazeDirection'] = 'center'
      if (yaw > YAW_THRESHOLD) gazeDirection = 'right'
      else if (yaw < -YAW_THRESHOLD) gazeDirection = 'left'
      else if (pitch > PITCH_THRESHOLD) gazeDirection = 'down'
      else if (pitch < -PITCH_THRESHOLD) gazeDirection = 'up'

      let emotionGesture: EyeGazeAnalysis['emotionGesture'] = closed ? 'neutral' : 'focused'
      if (isTurnedAway) emotionGesture = 'distracted'
      if (Math.abs(yaw) > 35) emotionGesture = 'suspicious_motion'

      return {
        gazeDirection,
        blinkCount: this.blinkCount,
        isEyeClosed: closed,
        headPose: { yaw, pitch, roll: 0, isTurnedAway },
        faceDetected: true,
        emotionGesture,
        confidenceScore: detection.detection.score,
      }
    } catch {
      return { ...EMPTY, blinkCount: this.blinkCount, faceDetected: false }
    }
  }

  public getBlinkCount(): number {
    return this.blinkCount
  }

  public resetBlinkCount(): void {
    this.blinkCount = 0
  }
}

export const eyeGazeTracker = new EyeGazeTracker()
