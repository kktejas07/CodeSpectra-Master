'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle, Camera, Loader, CheckCircle2 } from 'lucide-react'

interface FaceRecognitionProps {
  onCapture: (faceData: { front: string; left: string; right: string }) => void
  mode: 'login' | 'signup'
  onSkip?: () => void
}

interface CapturedFace {
  front?: string
  left?: string
  right?: string
}

export function FaceRecognition({ onCapture, mode, onSkip }: FaceRecognitionProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number>()
  const detectionIntervalRef = useRef<NodeJS.Timeout>()
  
  const [isScanning, setIsScanning] = useState(false)
  const [currentAngle, setCurrentAngle] = useState<'front' | 'left' | 'right'>('front')
  const [capturedAngles, setCapturedAngles] = useState<CapturedFace>({})
  const [error, setError] = useState('')
  const [speakingInstruction, setSpeakingInstruction] = useState('')
  const [scanProgress, setScanProgress] = useState(0)
  const [isCapturing, setIsCapturing] = useState(false)
  const [scanQuality, setScanQuality] = useState(0)
  const [detectionStatus, setDetectionStatus] = useState<'waiting' | 'detecting' | 'capturing' | 'complete'>('waiting')

  const instructions = {
    front: 'Look straight at the camera',
    left: 'Turn your head slowly to the left',
    right: 'Turn your head slowly to the right',
  }

  useEffect(() => {
    if (isScanning) {
      startCamera()
      speakInstruction(instructions[currentAngle])
      startAutoDetection()
    }
    return () => {
      stopCamera()
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current)
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isScanning, currentAngle])

  const speakInstruction = (text: string) => {
    setSpeakingInstruction(text)
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.9
      utterance.pitch = 1
      window.speechSynthesis.speak(utterance)
    }
  }

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user', 
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          aspectRatio: { ideal: 16 / 9 }
        },
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      setError('Unable to access camera. Please check permissions and try again.')
      setIsScanning(false)
    }
  }

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
      tracks.forEach((track) => track.stop())
    }
  }

  // Simulate face detection and auto-capture
  const startAutoDetection = () => {
    let detectionCounter = 0
    const targetDetections = 20 // ~1-2 seconds at 10fps

    detectionIntervalRef.current = setInterval(() => {
      if (!isCapturing) {
        setDetectionStatus('detecting')
        
        // Simulate face detection quality
        const quality = 30 + Math.random() * 60 // 30-90% quality
        setScanQuality(Math.min(100, quality))
        
        // Simulate detection progress
        detectionCounter++
        const progress = Math.min(100, (detectionCounter / targetDetections) * 100)
        setScanProgress(progress)

        // Auto-capture when quality is good (>75%) and progress reaches 100%
        if (quality > 75 && detectionCounter >= targetDetections) {
          detectionCounter = 0
          captureFaceAuto()
        }
      }
    }, 100) // 10 FPS detection
  }

  const captureFaceAuto = () => {
    if (videoRef.current && canvasRef.current && !isCapturing) {
      setIsCapturing(true)
      setDetectionStatus('capturing')

      const context = canvasRef.current.getContext('2d')
      if (context) {
        context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height)
        const faceData = canvasRef.current.toDataURL('image/jpeg', 0.95)
        
        const newAngles: CapturedFace = { ...capturedAngles, [currentAngle]: faceData }
        setCapturedAngles(newAngles)

        // Haptic feedback if available
        if ('vibrate' in navigator) {
          navigator.vibrate(200)
        }

        // Show success briefly
        setScanProgress(100)
        setDetectionStatus('complete')

        // Determine next angle or complete
        setTimeout(() => {
          if (Object.keys(newAngles).length === 3) {
            // All angles captured
            setIsScanning(false)
            setDetectionStatus('waiting')
            onCapture(newAngles as { front: string; left: string; right: string })
          } else {
            // Move to next angle
            const nextAngle = !newAngles.front ? 'front' : !newAngles.left ? 'left' : 'right'
            setCurrentAngle(nextAngle as 'front' | 'left' | 'right')
            setScanProgress(0)
            setDetectionStatus('waiting')
            setIsCapturing(false)
          }
        }, 800)
      }
    }
  }

  const manualCapture = () => {
    captureFaceAuto()
  }

  const startScanning = () => {
    setError('')
    setCapturedAngles({})
    setScanProgress(0)
    setDetectionStatus('waiting')
    setIsScanning(true)
  }

  const progressPercentage = (Object.keys(capturedAngles).length / 3) * 100

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Main scanning area */}
      {isScanning ? (
        <div className="space-y-4">
          {/* Video feed with AI scanning effect */}
          <div className="relative w-full bg-background rounded-lg overflow-hidden border-2 border-primary/30">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full aspect-video bg-black"
            />
            
            {/* AI Scanning overlay */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Scanning grid lines */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/10 to-transparent opacity-20" />
              
              {/* Animated scan lines */}
              <div 
                className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent"
                style={{
                  top: `${scanProgress}%`,
                  animation: 'scanning 1.5s ease-in-out infinite'
                }}
              />
              
              {/* Corner markers */}
              <div className="absolute top-4 left-4 w-6 h-6 border-l-2 border-t-2 border-primary" />
              <div className="absolute top-4 right-4 w-6 h-6 border-r-2 border-t-2 border-primary" />
              <div className="absolute bottom-4 left-4 w-6 h-6 border-l-2 border-b-2 border-primary" />
              <div className="absolute bottom-4 right-4 w-6 h-6 border-r-2 border-b-2 border-primary" />
              
              {/* Center focus circle */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div 
                  className="w-32 h-32 rounded-full border-2 border-primary/50 flex items-center justify-center"
                  style={{
                    boxShadow: `0 0 20px rgba(147, 51, 234, ${0.2 + scanQuality / 500})`
                  }}
                >
                  <div 
                    className="absolute w-20 h-20 rounded-full border border-primary opacity-50"
                    style={{
                      animation: 'pulse 2s ease-in-out infinite',
                      animationDelay: '0s'
                    }}
                  />
                  <div 
                    className="absolute w-12 h-12 rounded-full border border-primary opacity-30"
                    style={{
                      animation: 'pulse 2s ease-in-out infinite',
                      animationDelay: '0.3s'
                    }}
                  />
                </div>
              </div>

              {/* Quality indicator */}
              <div className="absolute bottom-6 left-6 right-6 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-primary/70">Quality</span>
                  <span className="text-primary font-semibold">{Math.round(scanQuality)}%</span>
                </div>
                <div className="w-full h-1 bg-background/50 rounded-full overflow-hidden border border-primary/30">
                  <div 
                    className="h-full bg-gradient-to-r from-primary via-primary to-primary/50 transition-all duration-300"
                    style={{ width: `${scanQuality}%` }}
                  />
                </div>
              </div>

              {/* Detection status indicator */}
              <div className="absolute top-6 left-6">
                <div className="flex items-center gap-2 text-xs text-primary/70 bg-background/80 px-3 py-2 rounded-full border border-primary/20">
                  {detectionStatus === 'detecting' && (
                    <>
                      <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse" />
                      <span>Detecting...</span>
                    </>
                  )}
                  {detectionStatus === 'capturing' && (
                    <>
                      <Loader className="w-3 h-3 animate-spin text-primary" />
                      <span>Capturing...</span>
                    </>
                  )}
                  {detectionStatus === 'complete' && (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      <span>Captured!</span>
                    </>
                  )}
                  {detectionStatus === 'waiting' && (
                    <>
                      <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                      <span>Ready</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Hidden canvas for capture */}
            <canvas
              ref={canvasRef}
              width={1280}
              height={720}
              className="hidden"
            />
          </div>

          {/* Instructions */}
          <div className="text-center space-y-3">
            <p className="text-lg font-semibold text-foreground">
              {instructions[currentAngle]}
            </p>
            <p className="text-sm text-muted-foreground">
              {mode === 'signup' ? 'Position your face in the circle and hold still' : 'Let us recognize you'}
            </p>
          </div>

          {/* Captured angles progress */}
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Overall Progress</span>
                <span className="text-foreground font-semibold">{Math.round(progressPercentage)}%</span>
              </div>
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>

            {/* Individual angle indicators */}
            <div className="grid grid-cols-3 gap-3">
              {(['front', 'left', 'right'] as const).map((angle) => (
                <div 
                  key={angle}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                    capturedAngles[angle]
                      ? 'border-green-500 bg-green-500/10'
                      : angle === currentAngle
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background'
                  }`}
                >
                  {capturedAngles[angle] ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : angle === currentAngle ? (
                    <Camera className="w-5 h-5 text-primary animate-pulse" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-muted-foreground" />
                  )}
                  <span className="text-xs font-medium capitalize">{angle}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded flex items-start gap-3">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Controls */}
          <div className="flex gap-3 justify-center">
            <Button 
              onClick={manualCapture}
              disabled={isCapturing}
              className="gap-2"
              size="sm"
            >
              <Camera className="w-4 h-4" />
              {isCapturing ? 'Capturing...' : 'Capture Now'}
            </Button>
            {mode === 'signup' && (
              <Button 
                onClick={() => {
                  stopCamera()
                  setIsScanning(false)
                  onSkip?.()
                }}
                variant="outline"
                size="sm"
              >
                Skip for Now
              </Button>
            )}
          </div>
        </div>
      ) : (
        /* Initial state - not scanning */
        <div className="space-y-6">
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
                <Camera className="w-8 h-8 text-primary" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">Face Recognition</h3>
              <p className="text-sm text-muted-foreground">
                {mode === 'signup' 
                  ? 'Enroll your face for secure biometric login. We capture 3 angles (front, left, right) for maximum accuracy.'
                  : 'Login using your face instead of password'
                }
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <Button 
              onClick={startScanning}
              className="w-full gap-2"
              size="lg"
            >
              <Camera className="w-5 h-5" />
              Start Face Scan
            </Button>

            {mode === 'signup' && (
              <Button 
                onClick={onSkip}
                variant="outline"
                className="w-full"
                size="lg"
              >
                Skip for Now
              </Button>
            )}
          </div>

          {/* Security info */}
          <div className="text-xs text-muted-foreground space-y-2">
            <p>✓ Your face data is encrypted and stored securely</p>
            <p>✓ Never used for identification beyond your account</p>
            <p>✓ Can be updated or deleted anytime from settings</p>
          </div>
        </div>
      )}

      {/* Scanning animation keyframes */}
      <style>{`
        @keyframes scanning {
          0% { opacity: 0; }
          50% { opacity: 1; }
          100% { opacity: 0; }
        }
        
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(0.8); opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
