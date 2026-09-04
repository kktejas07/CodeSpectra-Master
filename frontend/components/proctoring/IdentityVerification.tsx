'use client'

import { useRef, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { FaceCamera } from '@/components/auth/face-camera'
import { X, ShieldAlert, ArrowRight, FileText, AlertCircle, RefreshCw, Camera, User, Check, Loader2 } from "lucide-react"

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
  const [faceDescriptor, setFaceDescriptor] = useState<Float32Array | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [verificationError, setVerificationError] = useState<string | null>(null)
  const [isCameraLoading, setIsCameraLoading] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)

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

  const [isIdVerifying, setIsIdVerifying] = useState(false)
  const [idError, setIdError] = useState<string | null>(null)
  const [useAsProfile, setUseAsProfile] = useState(false)

  const handleNextFromId = async () => {
    if (idPhoto) {
      setIsIdVerifying(true)
      setIdError(null)
      try {
        const res = await csrfFetch('/api/assessment/id-ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: idPhoto })
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || 'Failed to verify ID')
        }
        
        addToast({ type: 'success', title: 'ID Verified', message: 'Name matches account profile.' })
        stopCamera()
        setStep('capture_face')
      } catch (err: any) {
        setIdError(err.message)
      } finally {
        setIsIdVerifying(false)
      }
    }
  }

  const handleNextFromFace = () => {
    if (facePhoto) {
      stopCamera()
      setStep('confirm')
    }
  }

  const handleFinish = async () => {
    if (idPhoto && facePhoto && faceDescriptor) {
      setIsVerifying(true)
      try {
        const res = await csrfFetch('/api/assessment/face-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ descriptor: Array.from(faceDescriptor), examId: examTitle })
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || 'Verification failed')
        }
        if (useAsProfile) setProfileAvatar(facePhoto)
        onComplete({ idPhoto, facePhoto })
      } catch (err: any) {
        setVerificationError(err.message)
        setStep('capture_face') // Go back on error
      } finally {
        setIsVerifying(false)
      }
    } else if (idPhoto && facePhoto) {
      // Fallback if no descriptor
      if (useAsProfile) setProfileAvatar(facePhoto)
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

  const setProfileAvatar = (dataUrl: string) => {
    try {
      const key = 'codeSpectra_extendedProfile'
      let extended: Record<string, any> = {}
      const prev = localStorage.getItem(key)
      if (prev) {
        try { extended = JSON.parse(prev) || {} } catch { extended = {} }
      }
      extended.avatar = dataUrl
      localStorage.setItem(key, JSON.stringify(extended))
    } catch (e) {
      console.error('Failed to save profile avatar:', e)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <Card className="max-w-xl w-full p-6 border-primary/20 space-y-6 bg-card text-card-foreground shadow-2xl relative">
        <button 
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"
          title="Close"
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
                  <li><strong>Identity Check:</strong> You must verify your identity before taking the assessment.</li>
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

            <div className="flex flex-col items-center gap-3 pt-2">
              <div className="flex justify-center gap-3">
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
              
              {!idPhoto && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground w-full max-w-sm">
                  <div className="flex-1 border-b border-border"></div>
                  <span className="text-xs uppercase">or upload</span>
                  <div className="flex-1 border-b border-border"></div>
                </div>
              )}

              {!idPhoto && (
                <label className="flex items-center justify-center w-full max-w-sm cursor-pointer h-10 border rounded-md hover:bg-muted/50 transition-colors">
                  <span className="text-sm font-medium">Upload ID Document</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        const reader = new FileReader()
                        reader.onload = (e) => setIdPhoto(e.target?.result as string)
                        reader.readAsDataURL(file)
                      }
                    }}
                  />
                </label>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t pt-4">
              {idError && (
                <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 p-3 rounded-md">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p>{idError}</p>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => { stopCamera(); setStep('consent'); }} disabled={isIdVerifying}>Back</Button>
                <Button onClick={handleNextFromId} disabled={!idPhoto || isIdVerifying} className="gap-2">
                  {isIdVerifying ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Verifying...</>
                  ) : (
                    <>Next: Face Capture <ArrowRight className="h-4 w-4" /></>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Capture Face */}
        {step === 'capture_face' && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <h3 className="font-semibold text-base flex items-center justify-center gap-2">
                <User className="h-5 w-5 text-primary" /> Biometric Identity Verification
              </h3>
              <p className="text-xs text-muted-foreground">
                Look directly into the camera to capture and verify your face.
              </p>
            </div>

            {verificationError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{verificationError}</span>
              </div>
            )}

            <div className="py-2">
              <FaceCamera 
                mode="verify" 
                onCapture={(descriptor, base64) => {
                  setFaceDescriptor(descriptor)
                  setFacePhoto(base64)
                  setVerificationError(null)
                  setStep('confirm')
                }}
                onError={(err) => setVerificationError(err.message)}
              />
            </div>

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => { setStep('capture_id'); startCamera(); }}>Back</Button>
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
                <Button variant="ghost" size="sm" onClick={() => { setStep('capture_face'); }} className="w-full text-xs">
                  Retake Selfie
                </Button>
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer p-3 bg-muted/40 rounded-lg border text-sm">
                <input
                  type="checkbox"
                  checked={useAsProfile}
                  onChange={(e) => setUseAsProfile(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                />
                <span className="text-muted-foreground text-xs">
                  Also use my verification selfie as my profile picture. You can change it anytime from Profile &gt; Edit.
                </span>
              </label>

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => { setStep('capture_face'); }}>Back</Button>
              <Button onClick={handleFinish} disabled={isVerifying} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                {isVerifying ? 'Verifying...' : <><Check className="h-4 w-4" /> Start Assessment Now</>}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
