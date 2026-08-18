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

export function FaceCamera({ mode, onCapture, onError }: FaceCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<'initializing' | 'ready' | 'detecting' | 'captured' | 'error'>('initializing')
  const [message, setMessage] = useState('Loading face recognition models...')
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadModels() {
      try {
        // Load models from a public CDN
        const MODEL_URL = 'https://cdn.jsdelivr.net/gh/vladmandic/face-api/model/'
        
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ])
        
        if (mounted) {
          setMessage('Please grant camera permissions.')
          startVideo()
        }
      } catch (err: any) {
        console.error('Failed to load models:', err)
        if (mounted) {
          setStatus('error')
          setMessage('Failed to load biometric models.')
          onError?.(err)
        }
      }
    }

    async function startVideo() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } 
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }
      } catch (err: any) {
        console.error('Camera error:', err)
        if (mounted) {
          setStatus('error')
          setMessage('Camera access denied or unavailable.')
          onError?.(err)
        }
      }
    }

    loadModels()

    return () => {
      mounted = false
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [onError])

  const handleVideoPlay = () => {
    if (status === 'error') return
    setStatus('ready')
    setMessage('Position your face in the center of the camera.')
  }

  const [livenessState, setLivenessState] = useState<'center' | 'left' | 'right' | 'smile' | 'done'>('center')
  const [livenessAttempts, setLivenessAttempts] = useState(0)
  const livenessStateRef = useRef(livenessState)
  
  useEffect(() => { livenessStateRef.current = livenessState }, [livenessState])

  const analyzeLiveness = async () => {
    if (!videoRef.current || status === 'captured' || status === 'error') return
    
    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor()

      if (!detection) {
        setMessage('No face detected. Please look directly at the camera.')
        requestAnimationFrame(analyzeLiveness)
        return
      }

      // Check face size/position roughly
      const { width, height } = detection.detection.box
      const videoWidth = videoRef.current.videoWidth
      const videoHeight = videoRef.current.videoHeight

      if (width < videoWidth * 0.2 || height < videoHeight * 0.2) {
        setMessage('Please move closer to the camera.')
        requestAnimationFrame(analyzeLiveness)
        return
      }

      // Liveness checks using 68 landmarks
      const landmarks = detection.landmarks
      const nose = landmarks.getNose()
      const leftEye = landmarks.getLeftEye()
      const rightEye = landmarks.getRightEye()
      const mouth = landmarks.getMouth()

      // Simple heuristic for yaw (left/right turn)
      const noseX = nose[0].x
      const leftEyeX = leftEye[0].x
      const rightEyeX = rightEye[3].x
      const faceWidth = rightEyeX - leftEyeX
      const noseOffset = (noseX - leftEyeX) / faceWidth // ~0.5 is center

      // Simple heuristic for smile
      const mouthWidth = mouth[6].x - mouth[0].x
      const smileRatio = mouthWidth / faceWidth

      const state = livenessStateRef.current

      if (state === 'center') {
        if (noseOffset > 0.4 && noseOffset < 0.6) {
          setMessage('Great. Now turn your head slowly to the LEFT.')
          setLivenessState('left')
        } else {
          setMessage('Look straight at the camera.')
        }
      } else if (state === 'left') {
        if (noseOffset < 0.35) { // Nose closer to left eye in 2D projection when turning left
          setMessage('Good. Now turn your head slowly to the RIGHT.')
          setLivenessState('right')
        }
      } else if (state === 'right') {
        if (noseOffset > 0.65) { // Nose closer to right eye
          setMessage('Good. Look forward and SMILE.')
          setLivenessState('smile')
        }
      } else if (state === 'smile') {
        if (noseOffset > 0.4 && noseOffset < 0.6 && smileRatio > 0.55) {
          setMessage('Perfect! Capturing...')
          setLivenessState('done')
          
          setStatus('captured')
          
          const canvas = document.createElement('canvas')
          canvas.width = videoWidth
          canvas.height = videoHeight
          const ctx = canvas.getContext('2d')
          ctx?.drawImage(videoRef.current, 0, 0)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8)

          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop())
          }

          onCapture(detection.descriptor, dataUrl)
          return // Stop polling
        }
      }

      requestAnimationFrame(analyzeLiveness)

    } catch (err: any) {
      console.error('Liveness check error:', err)
      setStatus('error')
      setMessage('Analysis failed. Please try again.')
    }
  }

  const captureFace = async () => {
    if (!videoRef.current || status === 'captured') return
    setStatus('detecting')
    setLivenessState('center')
    analyzeLiveness()
  }

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="relative w-full max-w-sm aspect-4/3 rounded-xl overflow-hidden bg-muted border-2 border-border shadow-sm flex items-center justify-center">
        {status === 'initializing' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm p-6 text-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
            <p className="text-sm font-medium">{message}</p>
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
        />

        {/* Overlay Guide */}
        {(status === 'ready' || status === 'detecting') && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
            <div className="w-[160px] h-[220px] rounded-[100%] border-2 border-primary/50 ring-[1000px] ring-background/60 transition-all duration-500" />
          </div>
        )}

        {status === 'captured' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-emerald-500/20 backdrop-blur-sm p-6 text-center">
            <ShieldCheck className="w-12 h-12 text-emerald-500 mb-4" />
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{message}</p>
          </div>
        )}
      </div>

      <div className="w-full max-w-sm text-center">
        <p className="text-sm text-muted-foreground mb-4 min-h-5">{status === 'ready' ? message : ''}</p>
        
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
            <Button variant="ghost" size="sm" onClick={() => {
              setStatus('ready')
              setMessage('Ready to capture.')
            }}>
              Restart Analysis
            </Button>
          </div>
        )}

        {status === 'error' && (
           <Button onClick={() => {
             setStatus('ready')
             setMessage('Ready to capture.')
           }} className="w-full gap-2">
             <RefreshCw className="w-4 h-4" />
             Retry Capture
           </Button>
        )}
      </div>
    </div>
  )
}
