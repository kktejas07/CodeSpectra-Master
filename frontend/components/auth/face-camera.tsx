'use client'

import React, { useEffect, useRef, useState } from 'react'
import * as faceapi from '@vladmandic/face-api'
import { Loader2, Camera, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FaceCameraProps {
  mode: 'enroll' | 'verify'
  onCapture: (descriptor: Float32Array, imageBase64: string) => void
  onError?: (err: Error) => void
}

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model'
const DETECT_TIMEOUT_MS = 8000
const CAPTURE_BUDGET_MS = 25000

function detectOptions() {
  return new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.35, inputSize: 320 })
}

let modelsPromise: Promise<void> | null = null

function loadFaceModels() {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      await (faceapi.tf as { ready?: () => Promise<void> }).ready?.()
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ])
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

export function FaceCamera({ mode, onCapture, onError }: FaceCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const onErrorRef = useRef(onError)
  const onCaptureRef = useRef(onCapture)
  const runIdRef = useRef(0)
  const [status, setStatus] = useState<'initializing' | 'ready' | 'detecting' | 'captured' | 'error'>('initializing')
  const [message, setMessage] = useState('Loading face recognition models...')

  onErrorRef.current = onError
  onCaptureRef.current = onCapture

  useEffect(() => {
    let mounted = true

    async function start() {
      try {
        await loadFaceModels()
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
          await videoRef.current.play().catch(() => {})
        }
      } catch (err: any) {
        console.error('Face camera init failed:', err)
        if (!mounted) return
        const denied = err?.name === 'NotAllowedError' || /permission|denied/i.test(err?.message || '')
        setStatus('error')
        setMessage(denied ? 'Camera access denied or unavailable.' : 'Failed to load biometric models.')
        onErrorRef.current?.(err instanceof Error ? err : new Error(String(err)))
      }
    }

    start()

    return () => {
      mounted = false
      runIdRef.current += 1
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }
  }, [])

  const handleVideoPlay = () => {
    setStatus((prev) => (prev === 'initializing' ? 'ready' : prev))
    setMessage((prev) => (prev === 'Please grant camera permissions.' || prev === 'Loading face recognition models...'
      ? 'Position your face in the oval, then capture.'
      : prev))
  }

  const stopLoop = () => {
    runIdRef.current += 1
  }

  const analyzeFace = async (runId: number) => {
    const startedAt = Date.now()

    while (runIdRef.current === runId) {
      if (!videoRef.current) return

      if (Date.now() - startedAt > CAPTURE_BUDGET_MS) {
        setStatus('error')
        setMessage('Could not lock onto your face. Move closer, face the camera, and retry.')
        return
      }

      try {
        const detection = await withTimeout<{
          detection: { box: { width: number; height: number } }
          landmarks: {
            getNose: () => Array<{ x: number }>
            getLeftEye: () => Array<{ x: number }>
            getRightEye: () => Array<{ x: number }>
          }
        } | undefined>(
          faceapi
            .detectSingleFace(videoRef.current, detectOptions())
            .withFaceLandmarks(true),
          DETECT_TIMEOUT_MS,
          'Face detection timed out',
        )

        if (runIdRef.current !== runId) return

        if (!detection) {
          setMessage('No face detected. Look directly at the camera.')
          await new Promise((r) => setTimeout(r, 150))
          continue
        }

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
        const fullDetection = await withTimeout<{ descriptor: Float32Array } | undefined>(
          faceapi
            .detectSingleFace(videoRef.current, detectOptions())
            .withFaceLandmarks(true)
            .withFaceDescriptor(),
          DETECT_TIMEOUT_MS * 2,
          'Biometric capture timed out',
        )

        if (runIdRef.current !== runId) return

        if (!fullDetection) {
          setStatus('error')
          setMessage('Failed to generate biometric descriptor. Try again.')
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
            <p className="text-xs text-muted-foreground mt-1 animate-pulse">Initializing Biometrics Engine...</p>
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
            {mode === 'enroll' ? 'Capture Face & Enroll' : 'Verify My Face'}
          </Button>
        )}

        {status === 'detecting' && (
          <div className="flex flex-col gap-2">
            <Button disabled className="w-full gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing...
            </Button>
            <Button variant="ghost" size="sm" onClick={resetCapture}>
              Restart Analysis
            </Button>
          </div>
        )}

        {status === 'error' && (
          <Button onClick={resetCapture} className="w-full gap-2">
            <RefreshCw className="w-4 h-4" />
            Retry Capture
          </Button>
        )}
      </div>
    </div>
  )
}
