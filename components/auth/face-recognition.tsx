'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle, Camera, Loader } from 'lucide-react'

interface FaceRecognitionProps {
  onCapture: (faceData: string) => void
  mode: 'login' | 'signup'
}

export function FaceRecognition({ onCapture, mode }: FaceRecognitionProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [currentAngle, setCurrentAngle] = useState<'front' | 'left' | 'right'>('front')
  const [capturedAngles, setCapturedAngles] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [speakingInstruction, setSpeakingInstruction] = useState('')

  const instructions = {
    front: 'Look straight at the camera',
    left: 'Turn your head to the left',
    right: 'Turn your head to the right',
  }

  useEffect(() => {
    if (isScanning) {
      startCamera()
      speakInstruction(instructions[currentAngle])
    }
    return () => {
      stopCamera()
    }
  }, [isScanning, currentAngle])

  const speakInstruction = (text: string) => {
    setSpeakingInstruction(text)
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.9
      window.speechSynthesis.speak(utterance)
    }
  }

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      setError('Unable to access camera. Please allow camera permissions.')
    }
  }

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
      tracks.forEach((track) => track.stop())
    }
  }

  const captureFace = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d')
      if (context) {
        context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height)
        const faceData = canvasRef.current.toDataURL('image/jpeg')
        const newAngles = new Set(capturedAngles)
        newAngles.add(currentAngle)
        setCapturedAngles(newAngles)

        if (newAngles.size === 3) {
          onCapture(faceData)
          setIsScanning(false)
        } else {
          const nextAngle = newAngles.has('front') && newAngles.has('left') ? 'right' : newAngles.has('front') ? 'left' : 'front'
          setCurrentAngle(nextAngle as 'front' | 'left' | 'right')
        }
      }
    }
  }

  return (
    <div className="space-y-6">
      {isScanning ? (
        <div className="space-y-4">
          <div className="relative bg-background/50 border border-border rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" width={640} height={480} />

            {/* Scanning animation overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-40 h-40">
                <div className="absolute inset-0 border-2 border-primary rounded-lg animate-pulse" />
                <div className="absolute inset-0 border-2 border-primary rounded-lg animate-spin" style={{ animationDuration: '3s' }} />
              </div>
            </div>

            {/* Status indicator */}
            <div className="absolute top-4 right-4 bg-background/80 px-3 py-1 rounded-full text-sm">
              {capturedAngles.size}/3 angles captured
            </div>
          </div>

          <div className="text-center space-y-2">
            <p className="text-lg font-semibold">{speakingInstruction || instructions[currentAngle]}</p>
            <p className="text-sm text-foreground/60">Angle: {currentAngle.charAt(0).toUpperCase() + currentAngle.slice(1)}</p>
          </div>

          <Button onClick={captureFace} className="w-full" size="lg">
            <Camera className="w-4 h-4 mr-2" />
            Capture Face
          </Button>

          <Button onClick={() => setIsScanning(false)} variant="outline" className="w-full">
            Cancel
          </Button>
        </div>
      ) : (
        <Button onClick={() => setIsScanning(true)} className="w-full" size="lg">
          <Camera className="w-4 h-4 mr-2" />
          Start Face {mode === 'login' ? 'Recognition' : 'Enrollment'}
        </Button>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}
    </div>
  )
}
