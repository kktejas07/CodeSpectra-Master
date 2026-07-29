'use client'

import { useRef, useState, useEffect } from 'react'
import { Camera, Check, ShieldAlert, FileText, User, ArrowRight, RefreshCw, X, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/lib/toast-context'

interface IdentityVerificationProps {
  onComplete: (data: { idPhoto: string; facePhoto: string }) => void
  onCancel: () => void
  examTitle: string
}

export function IdentityVerification({ onComplete, onCancel, examTitle }: IdentityVerificationProps) {
  const addToast = useToast()
  const [step, setStep] = useState<'consent' | 'capture_id' | 'capture_face' | 'confirm'>('consent')
  
  // Consent state
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [agreedPrivacy, setAgreedPrivacy] = useState(false)

  // Camera stream & photos
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [idPhoto, setIdPhoto] = useState<string | null>(null)
  const [facePhoto, setFacePhoto] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isCameraLoading, setIsCameraLoading] = useState(false)

  // Clean up camera on unmount or step change
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  const startCamera = async () => {
    stopCamera()
    setIsCameraLoading(true)
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err: any) {
      console.error('Camera access error:', err)
      setCameraError('Could not access camera. Please verify camera permissions in your browser.')
      addToast({ type: 'error', title: 'Camera Access Failed', message: 'Please allow camera access to proceed.' })
    } finally {
      setIsCameraLoading(false)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  // Automatically attach active stream to video element when it mounts/re-renders
  useEffect(() => {
    if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [step, idPhoto, facePhoto])

  const handleNextFromConsent = () => {
    if (agreedTerms && agreedPrivacy) {
      setStep('capture_id')
      startCamera()
    }
  }

  const capturePhoto = (type: 'id' | 'face') => {
    if (!videoRef.current) return
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 480
      const ctx = canvas.getContext('2d')
      if (ctx) {
        // Draw video frame to canvas
        ctx.drawImage(videoRef.current, 0, 0, 640, 480)
        // Compress image to JPEG at 0.6 quality for lower size Base64
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
        if (type === 'id') {
          setIdPhoto(dataUrl)
        } else {
          setFacePhoto(dataUrl)
        }
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Capture Failed', message: 'Failed to capture frame.' })
    }
  }

  const handleNextFromId = () => {
    if (idPhoto) {
      setStep('capture_face')
      // Make sure camera is running
      if (!streamRef.current) {
        startCamera()
      }
    }
  }

  const handleNextFromFace = () => {
    if (facePhoto) {
      stopCamera()
      setStep('confirm')
    }
  }

  const handleFinish = () => {
    if (idPhoto && facePhoto) {
      onComplete({ idPhoto, facePhoto })
    }
  }

  const retakePhoto = (type: 'id' | 'face') => {
    if (type === 'id') {
      setIdPhoto(null)
    } else {
      setFacePhoto(null)
    }
    startCamera()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <Card className="max-w-xl w-full p-6 border-primary/20 space-y-6 bg-card text-card-foreground shadow-2xl relative">
        <button 
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Wizard Header */}
        <div className="border-b border-border pb-4">
          <h2 className="text-xl font-bold text-foreground">Identity Verification</h2>
          <p className="text-xs text-muted-foreground mt-1">Required for starting: <strong className="text-foreground">{examTitle}</strong></p>
          
          {/* Steps Indicator */}
          <div className="flex items-center gap-2 mt-4">
            <div className={`h-1.5 flex-1 rounded-full ${step === 'consent' ? 'bg-primary' : 'bg-primary/30'}`} />
            <div className={`h-1.5 flex-1 rounded-full ${step === 'capture_id' ? 'bg-primary' : idPhoto ? 'bg-primary/50' : 'bg-muted'}`} />
            <div className={`h-1.5 flex-1 rounded-full ${step === 'capture_face' ? 'bg-primary' : facePhoto ? 'bg-primary/50' : 'bg-muted'}`} />
            <div className={`h-1.5 flex-1 rounded-full ${step === 'confirm' ? 'bg-primary' : 'bg-muted'}`} />
          </div>
        </div>

        {/* Step 1: Consent */}
        {step === 'consent' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-muted/40 rounded-lg border text-sm leading-relaxed">
              <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="font-semibold text-foreground">Strict Examination Policy</p>
                <ul className="list-disc pl-4 space-y-1.5 text-muted-foreground text-xs">
                  <li><strong>Proctored Environment:</strong> We monitor your camera stream, eye movements, and active browser tab.</li>
                  <li><strong>Zero Cheating Tolerance:</strong> Switching tabs, copy-pasting, or using external AI resources will flag your assessment.</li>
                  <li><strong>Identity Check:</strong> You must verify your identity before taking the exam.</li>
                </ul>
              </div>
            </div>

            <div className="space-y-3 pt-2 text-sm">
              <label className="flex items-start gap-3 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                />
                <span className="text-muted-foreground text-xs">
                  I agree to keep my camera enabled, stay in full-screen mode, and complete this test without external aid.
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={agreedPrivacy}
                  onChange={(e) => setAgreedPrivacy(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                />
                <span className="text-muted-foreground text-xs">
                  I consent to CodeSpectra collecting my live face photo and Government ID photo. I understand these are used solely by the recruiting team for verification and will be stored securely.
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={onCancel}>Cancel</Button>
              <Button 
                onClick={handleNextFromConsent} 
                disabled={!agreedTerms || !agreedPrivacy}
                className="gap-2"
              >
                Proceed <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Capture ID */}
        {step === 'capture_id' && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <h3 className="font-semibold text-base flex items-center justify-center gap-2">
                <FileText className="h-5 w-5 text-primary" /> Hold Up Your Government ID
              </h3>
              <p className="text-xs text-muted-foreground">
                Place your ID (Aadhaar, Passport, Driver's License, etc.) within the frame. Ensure all text and details are readable.
              </p>
            </div>

            {cameraError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{cameraError}</span>
              </div>
            )}

            <div className="relative mx-auto max-w-sm aspect-4/3 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 overflow-hidden flex items-center justify-center">
              {idPhoto ? (
                <img src={idPhoto} alt="Captured ID" className="w-full h-full object-cover" />
              ) : (
                <>
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover" 
                  />
                  {/* ID card overlay guide */}
                  <div className="absolute inset-0 border-4 border-primary/20 pointer-events-none flex items-center justify-center">
                    <div className="w-[80%] h-[60%] border-2 border-dashed border-primary rounded-md bg-transparent" />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-center gap-3 pt-2">
              {idPhoto ? (
                <Button variant="outline" onClick={() => retakePhoto('id')} className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Retake Photo
                </Button>
              ) : (
                <Button 
                  onClick={() => capturePhoto('id')} 
                  disabled={isCameraLoading || !!cameraError}
                  className="gap-2"
                >
                  <Camera className="h-4 w-4" /> Capture ID Photo
                </Button>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => { stopCamera(); setStep('consent'); }}>Back</Button>
              <Button onClick={handleNextFromId} disabled={!idPhoto} className="gap-2">
                Next: Face Capture <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Capture Face */}
        {step === 'capture_face' && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <h3 className="font-semibold text-base flex items-center justify-center gap-2">
                <User className="h-5 w-5 text-primary" /> Take a Live Selfie
              </h3>
              <p className="text-xs text-muted-foreground">
                Look directly into the camera. Ensure your face is fully visible and well-lit.
              </p>
            </div>

            {cameraError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{cameraError}</span>
              </div>
            )}

            <div className="relative mx-auto max-w-sm aspect-4/3 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 overflow-hidden flex items-center justify-center">
              {facePhoto ? (
                <img src={facePhoto} alt="Captured Face" className="w-full h-full object-cover" />
              ) : (
                <>
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover" 
                  />
                  {/* Face oval guide */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-[60%] h-[75%] border-2 border-dashed border-primary rounded-full" />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-center gap-3 pt-2">
              {facePhoto ? (
                <Button variant="outline" onClick={() => retakePhoto('face')} className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Retake Photo
                </Button>
              ) : (
                <Button 
                  onClick={() => capturePhoto('face')} 
                  disabled={isCameraLoading || !!cameraError}
                  className="gap-2"
                >
                  <Camera className="h-4 w-4" /> Capture Selfie
                </Button>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => { setStep('capture_id'); startCamera(); }}>Back</Button>
              <Button onClick={handleNextFromFace} disabled={!facePhoto} className="gap-2">
                Next: Review <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <h3 className="font-semibold text-base">Review Verification Photos</h3>
              <p className="text-xs text-muted-foreground">
                Verify that both images are clear and readable. If correct, submit to start the assessment.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground block text-center">Government ID</span>
                <div className="aspect-4/3 rounded-lg border overflow-hidden bg-muted">
                  {idPhoto && <img src={idPhoto} alt="ID Preview" className="w-full h-full object-cover" />}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setStep('capture_id'); startCamera(); }} className="w-full text-xs">
                  Retake ID
                </Button>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground block text-center">Live Face Selfie</span>
                <div className="aspect-4/3 rounded-lg border overflow-hidden bg-muted">
                  {facePhoto && <img src={facePhoto} alt="Face Preview" className="w-full h-full object-cover" />}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setStep('capture_face'); startCamera(); }} className="w-full text-xs">
                  Retake Selfie
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => { setStep('capture_face'); startCamera(); }}>Back</Button>
              <Button onClick={handleFinish} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Check className="h-4 w-4" /> Start Assessment Now
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
