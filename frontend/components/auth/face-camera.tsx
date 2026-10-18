'use client'

import React, { useEffect, useRef, useState } from 'react'
import * as faceapi from '@vladmandic/face-api'
import { Loader2, Camera, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  createLivenessTracker,
  eyeAspectRatio,
  livenessInstruction,
  noseYaw,
  type LivenessChallenge,
} from '@/lib/auth-face-liveness'

export interface LivenessCapture {
  /** Descriptors from two frames: before and after the challenge. */
  descriptors: Float32Array[]
  challenge: LivenessChallenge
  passed: true
}

interface FaceCameraProps {
  mode: 'enroll' | 'verify'
  onCapture: (descriptor: Float32Array | null, imageBase64: string) => void
  onError?: (err: Error) => void
  /**
   * 'liveness' (default) runs face detection + descriptor (needed for login /
   * enrollment matching). 'instant' grabs the frame immediately with NO
   * detection — reliable where the TFJS backend is unavailable/slow (some
   * GPUs/headless setups stall detection for 25s then fail). Used by
   * assessment proctoring, which only needs a stored photo.
   */
  captureMode?: 'liveness' | 'instant'
  /**
   * Face sign-in: after the first frame, ask for this movement (blink /
   * turn), then take a second frame, and report both via onLivenessCapture
   * instead of onCapture.
   */
  livenessChallenge?: LivenessChallenge
  onLivenessCapture?: (result: LivenessCapture) => void
}

const CDN_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model'
// ponytail: self-hosted first, CDN fallback. The Docker image bakes the 6
// model files (~6.7MB) into public/models (see Dockerfile + .gitignore), so
// production never touches a third-party CDN at verification time — no CDN
// outage, throttling, or regional block can stall face capture. Local dev
// machines without public/models fall through to jsdelivr automatically.
const MODEL_URLS = ['/models', CDN_MODEL_URL]
const DETECT_TIMEOUT_MS = 8000
const CAPTURE_BUDGET_MS = 25000
const MODEL_LOAD_TIMEOUT_MS = 45000
const MODEL_SLOW_HINT_MS = 12000
const LIVENESS_BUDGET_MS = 15000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type LandmarkSet = {
  getNose: () => Array<{ x: number; y: number }>
  getLeftEye: () => Array<{ x: number; y: number }>
  getRightEye: () => Array<{ x: number; y: number }>
}

function sampleOf(lm: LandmarkSet) {
  const l = lm.getLeftEye()
  const r = lm.getRightEye()
  const nose = lm.getNose()
  return { ear: (eyeAspectRatio(l) + eyeAspectRatio(r)) / 2, yaw: noseYaw(l, r, nose[3] ?? nose[0]) }
}

function detectOptions() {
  return new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.35, inputSize: 320 })
}

let modelsPromise: Promise<void> | null = null
let backendName = 'unknown'

/**
 * Force the TFJS compute backend to initialize on a tiny tensor.
 *
 * ponytail: without this the FIRST real detectSingleFace pays backend init +
 * WebGL shader compile on the main thread, which on machines without GPU
 * acceleration (or with hardware acceleration off) stalls long enough that the
 * 8s detect timer fires, the loop retries, and the user sits on "Hold still"
 * for the full 25s budget before a misleading "could not lock onto your face".
 * Warming up here turns that into either a fast capture or a clear init error.
 * Falls back to the CPU backend when WebGL is unavailable.
 */
async function warmUpBackend(): Promise<void> {
  const tf = faceapi.tf as any
  const probe = () => {
    const t = tf.tensor1d([0, 1, 2, 3])
    t.square().dataSync()
    t.dispose()
  }
  try {
    await tf.ready?.()
    probe()
    backendName = tf.getBackend?.() || 'unknown'
    return
  } catch {
    try {
      await tf.setBackend?.('cpu')
      await tf.ready?.()
      probe()
      backendName = tf.getBackend?.() || 'cpu'
      return
    } catch {
      throw new Error('Face engine could not initialize in this browser (no WebGL or CPU backend available).')
    }
  }
}

function loadFaceModels() {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      await (faceapi.tf as { ready?: () => Promise<void> }).ready?.()
      let lastErr: unknown = null
      let loaded = false
      for (const base of MODEL_URLS) {
        try {
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(base),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(base),
            faceapi.nets.faceRecognitionNet.loadFromUri(base),
          ])
          loaded = true
          break
        } catch (err) {
          lastErr = err
        }
      }
      if (!loaded) {
        throw lastErr instanceof Error ? lastErr : new Error('Face model download failed from all sources')
      }
      // Backend warm-up is URL-independent — run it once, after the nets load.
      await warmUpBackend()
    })().catch((err) => {
      modelsPromise = null
      throw err
    })
  }
  return modelsPromise
}

function withTimeout<T>(thenable: unknown, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms)
    Promise.resolve(thenable as Promise<T>).then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

export function FaceCamera({ mode, onCapture, onError, captureMode = 'liveness', livenessChallenge, onLivenessCapture }: FaceCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const onErrorRef = useRef(onError)
  const onCaptureRef = useRef(onCapture)
  const runIdRef = useRef(0)
  const [status, setStatus] = useState<'initializing' | 'ready' | 'detecting' | 'captured' | 'error'>('initializing')
  const [message, setMessage] = useState(
    captureMode === 'instant' ? 'Starting camera…' : 'Loading face recognition models...'
  )
  // Bumped by retryInit to re-run the init effect below (full re-init:
  // models are cached after first success, camera stream is re-requested).
  const [initNonce, setInitNonce] = useState(0)

  const onLivenessRef = useRef(onLivenessCapture)
  const challengeRef = useRef(livenessChallenge)
  onErrorRef.current = onError
  onCaptureRef.current = onCapture
  onLivenessRef.current = onLivenessCapture
  challengeRef.current = livenessChallenge

  useEffect(() => {
    let mounted = true
    // ponytail: staged init messages — model files are ~6-15MB from a CDN and
    // previously the screen sat on one static line until they arrived (or never,
    // with no timeout). The slow-hint timer proves the app is alive on bad networks.
    let slowTimer: ReturnType<typeof setTimeout> | null = null

    async function start() {
      try {
        // Instant mode needs no face-api models — skip the ~6.7MB download and
        // backend warm-up entirely and go straight to the camera.
        if (captureMode !== 'instant') {
          slowTimer = setTimeout(() => {
            if (mounted) setMessage('Still downloading recognition models — slow connection, please wait…')
          }, MODEL_SLOW_HINT_MS)
          await withTimeout(loadFaceModels(), MODEL_LOAD_TIMEOUT_MS, 'Model download timed out')
          if (slowTimer) { clearTimeout(slowTimer); slowTimer = null }
        }
        if (!mounted) return
        setMessage('Please grant camera permissions.')
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        })
        streamRef.current = stream
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          // ponytail: play() rejections used to be swallowed (`.catch(()=>{})`),
          // leaving the preview black and status stuck on initializing forever
          // with zero feedback. A failed play is now a visible, retryable error.
          await withTimeout(videoRef.current.play(), 8000, 'Camera preview failed to start')
        }
      } catch (err: any) {
        if (slowTimer) { clearTimeout(slowTimer); slowTimer = null }
        console.error('Face camera init failed:', err)
        if (!mounted) return
        const denied = err?.name === 'NotAllowedError' || /permission|denied/i.test(err?.message || '')
        const timedOut = /timed out|timeout/i.test(err?.message || '')
        setStatus('error')
        setMessage(
          denied
            ? 'Camera access denied or unavailable.'
            : timedOut
              ? 'Setup took too long (models or camera). Check your connection and retry.'
              : 'Failed to load biometric models.',
        )
        onErrorRef.current?.(err instanceof Error ? err : new Error(String(err)))
      }
    }

    start()

    return () => {
      mounted = false
      if (slowTimer) clearTimeout(slowTimer)
      runIdRef.current += 1
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }
  }, [initNonce])

  /** Full re-initialization for the error-state Retry button (models are
   *  cached after first success; camera stream is re-requested). */
  const retryInit = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    runIdRef.current += 1
    setStatus('initializing')
    setMessage(captureMode === 'instant' ? 'Starting camera…' : 'Loading face recognition models...')
    setInitNonce((n) => n + 1)
  }

  const handleVideoPlay = () => {
    setStatus((prev) => (prev === 'initializing' ? 'ready' : prev))
    setMessage((prev) => (prev === 'Please grant camera permissions.' || prev === 'Loading face recognition models...'
      ? 'Position your face in the oval, then capture.'
      : prev))
  }

  const stopLoop = () => {
    runIdRef.current += 1
  }

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }

  /**
   * Face sign-in liveness: ask for the challenge movement, confirm it over
   * several frames, then take a second centred descriptor. Both frames go
   * to the server, which matches each against the enrolled template.
   */
  const runLiveness = async (runId: number, first: Float32Array, challenge: LivenessChallenge) => {
    const tracker = createLivenessTracker(challenge)
    setMessage(livenessInstruction(challenge))
    let startedAt = Date.now()
    while (runIdRef.current === runId) {
      const video = videoRef.current
      if (!video) return
      if (Date.now() - startedAt > LIVENESS_BUDGET_MS) {
        setStatus('error')
        setMessage('We couldn’t confirm the movement. Retry and follow the prompt.')
        return
      }
      try {
        const det = (await withTimeout(
          faceapi.detectSingleFace(video, detectOptions()).withFaceLandmarks(true),
          DETECT_TIMEOUT_MS,
          'Face detection timed out',
        )) as { landmarks: LandmarkSet } | undefined
        if (runIdRef.current !== runId) return
        if (det && tracker.push(sampleOf(det.landmarks))) break
      } catch (err) {
        if (runIdRef.current !== runId) return
        console.error('Liveness check error:', err)
      }
      await sleep(40)
    }
    if (runIdRef.current !== runId) return

    setMessage('Done. Now look straight at the camera.')
    startedAt = Date.now()
    while (runIdRef.current === runId) {
      const video = videoRef.current
      if (!video) return
      if (Date.now() - startedAt > LIVENESS_BUDGET_MS) {
        setStatus('error')
        setMessage('Could not lock onto your face. Face the camera and retry.')
        return
      }
      try {
        const det = (await withTimeout(
          faceapi.detectSingleFace(video, detectOptions()).withFaceLandmarks(true).withFaceDescriptor(),
          DETECT_TIMEOUT_MS,
          'Descriptor timed out',
        )) as { landmarks: LandmarkSet; descriptor: Float32Array } | undefined
        if (runIdRef.current !== runId) return
        if (det) {
          const { yaw } = sampleOf(det.landmarks)
          if (yaw >= 0.36 && yaw <= 0.64) {
            stopStream()
            setStatus('captured')
            setMessage('Face captured.')
            onLivenessRef.current?.({ descriptors: [first, det.descriptor], challenge, passed: true })
            return
          }
        }
      } catch (err) {
        if (runIdRef.current !== runId) return
        console.error('Liveness capture error:', err)
      }
      await sleep(80)
    }
  }

  const analyzeFace = async (runId: number) => {
    const startedAt = Date.now()
    // ponytail: previously EVERY thrown detection was swallowed and the loop
    // spun the full 25s budget, ending on a misleading "could not lock onto
    // your face". A persistent engine error (no backend, dead GPU) now bails
    // with the real message instead of hanging.
    let consecutiveErrors = 0

    while (runIdRef.current === runId) {
      if (!videoRef.current) return

      if (Date.now() - startedAt > CAPTURE_BUDGET_MS) {
        setStatus('error')
        setMessage('Could not lock onto your face. Move closer, face the camera, and retry.')
        return
      }

      try {
        // ponytail: a stalled TFJS backend hangs detectSingleFace FOREVER,
        // freezing the loop with no message and never reaching the 25s budget.
        // The 8s timeout turns a hang into an ordinary miss (loop continues).
        const detection = (await withTimeout(
          faceapi
            .detectSingleFace(videoRef.current, detectOptions())
            .withFaceLandmarks(true),
          DETECT_TIMEOUT_MS,
          'Face detection timed out',
        )) as {
          detection: { box: { width: number; height: number } }
          landmarks: {
            getNose: () => Array<{ x: number }>
            getLeftEye: () => Array<{ x: number }>
            getRightEye: () => Array<{ x: number }>
          }
        } | undefined

        if (runIdRef.current !== runId) return

        if (!detection) {
          setMessage('No face detected. Look directly at the camera.')
          await new Promise((r) => setTimeout(r, 150))
          continue
        }
        consecutiveErrors = 0

        const { width, height } = detection.detection.box
        const videoWidth = videoRef.current.videoWidth
        const videoHeight = videoRef.current.videoHeight
        if (width < videoWidth * 0.12 || height < videoHeight * 0.12) {
          setMessage('Move closer to the camera.')
          await new Promise((r) => setTimeout(r, 150))
          continue
        }

        const landmarks = detection.landmarks
        const nose = landmarks.getNose()
        const leftEye = landmarks.getLeftEye()
        const rightEye = landmarks.getRightEye()
        const faceWidth = rightEye[3].x - leftEye[0].x
        const noseOffset = faceWidth === 0 ? 0.5 : (nose[0].x - leftEye[0].x) / faceWidth

        if (noseOffset < 0.22 || noseOffset > 0.78) {
          setMessage('Look straight at the camera.')
          await new Promise((r) => setTimeout(r, 150))
          continue
        }

        setMessage('Capturing biometric template...')
        const fullDetection = (await withTimeout(
          faceapi
            .detectSingleFace(videoRef.current, detectOptions())
            .withFaceLandmarks(true)
            .withFaceDescriptor(),
          DETECT_TIMEOUT_MS,
          'Descriptor timed out',
        )) as { descriptor: Float32Array } | undefined

        if (runIdRef.current !== runId) return

        if (!fullDetection) {
          setStatus('error')
          setMessage('Failed to generate biometric descriptor. Try again.')
          return
        }

        const challenge = challengeRef.current
        if (challenge && onLivenessRef.current) {
          await runLiveness(runId, fullDetection.descriptor, challenge)
          return
        }

        const canvas = document.createElement('canvas')
        canvas.width = videoWidth
        canvas.height = videoHeight
        canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop())
          streamRef.current = null
        }

        setStatus('captured')
        setMessage('Face captured.')
        onCaptureRef.current(fullDetection.descriptor, dataUrl)
        return
      } catch (err: any) {
        if (runIdRef.current !== runId) return
        console.error('Liveness check error:', err)
        await new Promise((r) => setTimeout(r, 150))
      }
    }
  }

  const captureFace = () => {
    if (!videoRef.current || status === 'captured') return
    // Instant mode: no detection loop, no descriptor — just grab the frame.
    // The assessment stores the photo for proctor review; biometric matching
    // is best-effort elsewhere and must never block the exam start.
    if (captureMode === 'instant') {
      const runId = runIdRef.current + 1
      runIdRef.current = runId
      setStatus('detecting')
      setMessage('Capturing photo…')
      const video = videoRef.current
      try {
        const videoWidth = video.videoWidth || 640
        const videoHeight = video.videoHeight || 480
        const canvas = document.createElement('canvas')
        canvas.width = videoWidth
        canvas.height = videoHeight
        canvas.getContext('2d')?.drawImage(video, 0, 0, videoWidth, videoHeight)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop())
          streamRef.current = null
        }
        if (runIdRef.current !== runId) return
        setStatus('captured')
        setMessage('Photo captured.')
        onCaptureRef.current(null, dataUrl)
      } catch (err) {
        console.error('Instant capture failed:', err)
        setStatus('error')
        setMessage('Could not capture the photo. Please retry.')
        onErrorRef.current?.(err instanceof Error ? err : new Error(String(err)))
      }
      return
    }
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    setStatus('detecting')
    setMessage('Hold still — detecting your face...')
    void analyzeFace(runId)
  }

  const resetCapture = () => {
    stopLoop()
    setStatus('ready')
    setMessage('Ready to capture.')
  }

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="relative w-full max-w-sm aspect-4/3 rounded-xl overflow-hidden bg-muted border-2 border-border shadow-sm flex items-center justify-center">
        {status === 'initializing' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm p-6 text-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full border-t-2 border-primary animate-spin" />
              <div className="absolute inset-1 rounded-full border-r-2 border-primary/70 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
              <Loader2 className="w-12 h-12 text-primary animate-pulse p-2" />
            </div>
            <p className="text-sm font-medium mt-4 bg-clip-text text-transparent bg-linear-to-r from-primary to-primary/60">{message}</p>
            <p className="text-xs text-muted-foreground mt-1 animate-pulse">
              {captureMode === 'instant' ? 'Starting camera...' : 'Initializing Biometrics Engine...'}
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/95 p-6 text-center">
            <AlertCircle className="w-10 h-10 text-destructive mb-4" />
            <p className="text-sm font-medium text-destructive">{message}</p>
          </div>
        )}

        <video
          ref={videoRef}
          onPlay={handleVideoPlay}
          className={`w-full h-full object-cover ${(status === 'initializing' || status === 'error') ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
          playsInline
          muted
          autoPlay
        />

        {(status === 'ready' || status === 'detecting') && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
            <div className="w-40 h-55 rounded-[100%] border-2 border-primary/50 ring-1000 ring-background/60 transition-all duration-500" />
          </div>
        )}

        {status === 'captured' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-emerald-500/20 backdrop-blur-sm p-6 text-center">
            <ShieldCheck className="w-12 h-12 text-emerald-500 mb-4" />
            <p className="text-sm font-medium text-emerald-600">{message}</p>
          </div>
        )}
      </div>

      <div className="w-full max-w-sm text-center">
        <p className="text-sm text-muted-foreground mb-4 min-h-5">
          {status === 'ready' || status === 'detecting' ? message : ''}
        </p>

        {status === 'ready' && (
          <Button onClick={captureFace} className="w-full gap-2">
            <Camera className="w-4 h-4" />
            {mode === 'enroll' ? 'Capture face and enroll' : captureMode === 'instant' ? 'Capture photo' : 'Verify my face'}
          </Button>
        )}

        {status === 'detecting' && (
          <div className="flex flex-col gap-2">
            <Button disabled className="w-full gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing...
            </Button>
            <Button variant="ghost" size="sm" onClick={resetCapture}>
              Restart analysis
            </Button>
          </div>
        )}

        {status === 'error' && (
          <Button onClick={retryInit} className="w-full gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry capture
          </Button>
        )}
      </div>
    </div>
  )
}
