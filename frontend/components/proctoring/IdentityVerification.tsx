'use client'

import { useRef, useState, useEffect } from 'react'
import { useFocusTrap } from '@/hooks/use-focus-trap'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { FaceCamera } from '@/components/auth/face-camera'
import { faceMatchScore, type FaceMatchReport } from '@/components/proctoring/face-match-score'
import { identityRequirement, type ExamIdentityPolicy, type NoCameraPolicy } from '@/lib/exam-access'
import { X, ShieldAlert, ArrowRight, FileText, AlertCircle, RefreshCw, Camera, CameraOff, User, Check, Loader2, Upload } from 'lucide-react'

export interface IdentityResult {
  idPhoto: string | null
  facePhoto: string | null
  /** Took the no-camera path: the organiser checks identity by hand. */
  needsReview: boolean
}

interface IdentityVerificationProps {
  onComplete: (data: IdentityResult) => void
  onCancel: () => void
  examTitle: string
  /** The test being started; the result is stored on the server for this attempt. */
  examId: string
  /** False = skip the Government-ID step. Defaults true (strict, backward-compat). */
  requireId?: boolean | null
  /** False = skip the live-face step. Defaults true (strict, backward-compat). */
  requireFace?: boolean | null
  /** What happens when this device has no usable camera. Default: allow and flag. */
  noCameraPolicy?: NoCameraPolicy | null
  inviteToken?: string | null
  linkToken?: string | null
}

type NoCameraReason = 'no_device' | 'permission_denied' | 'error'
type Step = 'consent' | 'capture_id' | 'capture_face' | 'confirm' | 'no_camera'

const ID_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ID_UPLOAD_MAX_BYTES = 5 * 1024 * 1024

function cameraErrorReason(err: unknown): NoCameraReason {
  const name = err && typeof err === 'object' ? String((err as { name?: unknown }).name || '') : ''
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'permission_denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return 'no_device'
  return 'error'
}

/** Opens and closes the camera once, to learn whether this device can take the photos. */
async function probeCamera(): Promise<'ok' | NoCameraReason> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'no_device'
  try {
    const devices = await navigator.mediaDevices.enumerateDevices?.()
    // Labels/ids may be hidden before permission, but the kinds are still listed.
    if (devices && devices.length > 0 && !devices.some((d) => d.kind === 'videoinput')) return 'no_device'
  } catch { /* fall through to getUserMedia */ }
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    s.getTracks().forEach((t) => t.stop())
    return 'ok'
  } catch (err) {
    return cameraErrorReason(err)
  }
}

export function IdentityVerification({
  onComplete,
  onCancel,
  examTitle,
  examId,
  requireId = true,
  requireFace = true,
  noCameraPolicy = 'allow_flag',
  inviteToken = null,
  linkToken = null,
}: IdentityVerificationProps) {
  const needId = requireId !== false
  const needFace = requireFace !== false
  const policy: ExamIdentityPolicy = {
    requireId: needId,
    requireFace: needFace,
    required: needId || needFace,
    noCamera: noCameraPolicy === 'block' ? 'block' : 'allow_flag',
  }
  const noCameraStep = identityRequirement(policy, false)
  const addToast = useToast()
  const [step, setStep] = useState<Step>('consent')
  const panelRef = useFocusTrap<HTMLDivElement>(true, onCancel)

  // Consent state
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [agreedPrivacy, setAgreedPrivacy] = useState(false)
  const [checkingCamera, setCheckingCamera] = useState(false)

  // Camera stream & photos
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [idPhoto, setIdPhoto] = useState<string | null>(null)
  const [facePhoto, setFacePhoto] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [verificationError, setVerificationError] = useState<string | null>(null)
  const [isCameraLoading, setIsCameraLoading] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [finishLabel, setFinishLabel] = useState('Saving…')

  // No-camera path
  const [noCameraReason, setNoCameraReason] = useState<NoCameraReason>('no_device')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // Clean up camera on unmount or step change
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  useEffect(() => () => { if (uploadPreview) URL.revokeObjectURL(uploadPreview) }, [uploadPreview])

  const goNoCamera = (reason: NoCameraReason) => {
    stopCamera()
    setNoCameraReason(reason)
    setStep('no_camera')
  }

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
    } catch (err: unknown) {
      console.error('Camera access error:', err)
      goNoCamera(cameraErrorReason(err))
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

  const enterCameraFlow = () => {
    if (needId) {
      setStep('capture_id')
      void startCamera()
    } else {
      setStep('capture_face')
    }
  }

  const handleNextFromConsent = async () => {
    if (!agreedTerms || !agreedPrivacy) return
    // No identity steps required — consent alone completes verification.
    if (!policy.required) {
      onComplete({ idPhoto: null, facePhoto: null, needsReview: false })
      return
    }
    setCheckingCamera(true)
    const probe = await probeCamera()
    setCheckingCamera(false)
    if (identityRequirement(policy, probe === 'ok').kind === 'camera') enterCameraFlow()
    else goNoCamera(probe === 'ok' ? 'error' : probe)
  }

  const retryCamera = async () => {
    setCheckingCamera(true)
    const probe = await probeCamera()
    setCheckingCamera(false)
    if (probe === 'ok') enterCameraFlow()
    else {
      setNoCameraReason(probe)
      addToast({ type: 'error', title: 'Still no camera', message: probe === 'permission_denied' ? 'Camera access is still blocked in your browser.' : 'We still can’t find a working camera.' })
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
      addToast({ type: 'error', title: 'Capture failed', message: 'Failed to capture frame.' })
    }
  }

  const [isIdVerifying, setIsIdVerifying] = useState(false)
  const [idError, setIdError] = useState<string | null>(null)
  const [useAsProfile, setUseAsProfile] = useState(false)
  // 'partial' = the ID name only partly matches the account → sent to identity review (A-005).
  const [nameMatch, setNameMatch] = useState<'match' | 'partial' | null>(null)

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

        setNameMatch(data.nameMatch === 'partial' ? 'partial' : 'match')
        addToast({ type: 'success', title: 'ID accepted', message: data.message || 'Your ID was read successfully.' })
        stopCamera()
        if (needFace) {
          setStep('capture_face')
        } else {
          setStep('confirm')
        }
      } catch (err: any) {
        setIdError(err.message)
      } finally {
        setIsIdVerifying(false)
      }
    }
  }

  /** Camera flow: compare the photos (advisory), store the result for this attempt, then start. */
  const handleFinish = async () => {
    const idOk = !needId || !!idPhoto
    const faceOk = !needFace || !!facePhoto
    if (!idOk || !faceOk || isVerifying) return
    setIsVerifying(true)
    setVerificationError(null)
    try {
      let faceMatch: FaceMatchReport | null = null
      if (needId && needFace && idPhoto && facePhoto) {
        setFinishLabel('Comparing photos…')
        faceMatch = await faceMatchScore(idPhoto, facePhoto)
      }
      setFinishLabel('Saving…')
      const res = await csrfFetch(`/api/exams/${encodeURIComponent(examId)}/identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'camera',
          idPhoto: needId ? idPhoto : null,
          facePhoto: needFace ? facePhoto : null,
          faceMatch,
          nameMatch,
          inviteToken,
          linkToken,
        }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'We couldn’t save your identity check. Try again.')
      if (useAsProfile && facePhoto) setProfileAvatar(facePhoto)
      onComplete({ idPhoto: needId ? idPhoto : null, facePhoto: needFace ? facePhoto : null, needsReview: nameMatch === 'partial' })
    } catch (err) {
      setVerificationError(err instanceof Error ? err.message : 'We couldn’t save your identity check. Try again.')
    } finally {
      setIsVerifying(false)
    }
  }

  const pickUpload = (file: File | undefined) => {
    setUploadError(null)
    if (!file) return
    if (!ID_UPLOAD_TYPES.includes(file.type)) {
      setUploadError('Use a JPG, PNG or WebP photo.')
      return
    }
    if (file.size > ID_UPLOAD_MAX_BYTES) {
      setUploadError('The photo must be under 5 MB.')
      return
    }
    setUploadFile(file)
    setUploadPreview(URL.createObjectURL(file))
  }

  /** No-camera flow: upload the ID photo; the attempt is flagged for manual review. */
  const handleUploadContinue = async () => {
    if (!uploadFile || uploading) return
    setUploading(true)
    setUploadError(null)
    try {
      const form = new FormData()
      form.set('file', uploadFile)
      form.set('reason', noCameraReason)
      if (inviteToken) form.set('inviteToken', inviteToken)
      if (linkToken) form.set('linkToken', linkToken)
      const res = await csrfFetch(`/api/exams/${encodeURIComponent(examId)}/identity`, { method: 'POST', body: form })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'Upload failed. Try again.')
      onComplete({ idPhoto: null, facePhoto: null, needsReview: true })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Try again.')
    } finally {
      setUploading(false)
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

  const cameraBrokenLink = (
    <button
      type="button"
      onClick={() => goNoCamera('error')}
      className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    >
      My camera isn&apos;t working
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <Card ref={panelRef} role="dialog" aria-modal="true" aria-label="Identity verification" className="max-w-xl w-full max-h-[92vh] overflow-y-auto rounded-3xl p-6 border-border/70 space-y-6 bg-card text-card-foreground shadow-2xl dark:shadow-none relative">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Close"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Wizard Header */}
        <div className="border-b border-border pb-4">
          <h2 className="text-xl font-bold text-foreground">Identity check</h2>
          <p className="text-xs text-muted-foreground mt-1">Required before you start <strong className="text-foreground">{examTitle}</strong></p>

          {/* Steps Indicator — skipped steps render muted so the bar matches the active flow */}
          {step !== 'no_camera' && (
          <div className="flex items-center gap-2 mt-4">
            <div className={`h-1.5 flex-1 rounded-full ${step === 'consent' ? 'bg-primary' : 'bg-primary/30'}`} />
            {needId && (
              <div className={`h-1.5 flex-1 rounded-full ${step === 'capture_id' ? 'bg-primary' : idPhoto ? 'bg-primary/50' : 'bg-muted'}`} />
            )}
            {needFace && (
              <div className={`h-1.5 flex-1 rounded-full ${step === 'capture_face' ? 'bg-primary' : facePhoto ? 'bg-primary/50' : 'bg-muted'}`} />
            )}
            <div className={`h-1.5 flex-1 rounded-full ${step === 'confirm' ? 'bg-primary' : 'bg-muted'}`} />
          </div>
          )}
        </div>

        {/* Step 1: Consent */}
        {step === 'consent' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-muted/40 rounded-2xl border border-border text-sm leading-relaxed">
              <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="font-semibold text-foreground">Exam rules</p>
                <ul className="list-disc pl-4 space-y-1.5 text-muted-foreground text-xs">
                  <li><strong>Proctored session:</strong> We monitor your camera stream, eye movements, and active browser tab.</li>
                  <li><strong>No outside help:</strong> Switching tabs, copy-pasting, or using external AI resources will flag your assessment.</li>
                  {(needId || needFace) && (
                    <li><strong>Identity check:</strong> {needId && needFace ? 'You take a photo of your ID card and a live photo of your face' : needId ? 'You take a photo of your ID card' : 'You take a live photo of your face'}. The hiring team sees these photos with your answers.</li>
                  )}
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
                  I consent to CodeSpectra collecting {needId && needFace ? 'my live face photo and Government ID photo' : needId ? 'my government ID photo' : needFace ? 'my live face photo' : 'session proctoring data'}. I understand {needId || needFace ? 'these are' : 'it is'} used solely by the recruiting team for verification and will be stored securely.
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={onCancel}>Cancel</Button>
              <Button
                onClick={() => void handleNextFromConsent()}
                disabled={!agreedTerms || !agreedPrivacy || checkingCamera}
                className="gap-2"
              >
                {checkingCamera ? (<><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Checking your camera…</>)
                  : (!needId && !needFace) ? (<>Start assessment <ArrowRight className="h-4 w-4" /></>) : (<>Continue <ArrowRight className="h-4 w-4" /></>)}
              </Button>
            </div>
          </div>
        )}

        {/* No camera on this device (or access blocked) */}
        {step === 'no_camera' && (
          <div className="space-y-4">
            <div className="text-center space-y-2">
              <CameraOff className="h-8 w-8 mx-auto text-muted-foreground" aria-hidden />
              <h3 className="font-semibold text-base">
                {noCameraReason === 'permission_denied' ? 'Camera access is blocked' : noCameraReason === 'no_device' ? 'No camera found' : 'Your camera isn’t working'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {noCameraReason === 'permission_denied'
                  ? 'Your browser didn’t give this page access to the camera. You can allow it in the address bar or browser settings, then choose Try camera again.'
                  : 'We couldn’t use a camera on this device. If you have one, connect it and choose Try camera again.'}
              </p>
            </div>

            {noCameraStep.kind === 'blocked' ? (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl text-sm text-foreground flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" aria-hidden />
                <p>This test needs a working camera, so you can&apos;t start it on this device. Use a device with a camera, or contact the organiser.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-4 bg-muted/40 border border-border rounded-2xl text-sm text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">You can still take this test</p>
                  <p>Upload a clear photo of your government ID instead. The organiser will check your identity by hand before your result is final.</p>
                </div>
                <label className="flex flex-col items-center justify-center gap-2 w-full cursor-pointer min-h-28 border border-dashed border-border rounded-2xl hover:bg-muted/50 transition-colors p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                  {uploadPreview ? (
                    <img src={uploadPreview} alt="Your ID photo" className="max-h-48 rounded-lg object-contain" />
                  ) : (
                    <>
                      <Upload className="h-5 w-5 text-muted-foreground" aria-hidden />
                      <span className="text-sm font-medium">Choose a photo of your ID</span>
                      <span className="text-xs text-muted-foreground">JPG, PNG or WebP, up to 5 MB</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => pickUpload(e.target.files?.[0])}
                  />
                </label>
                {uploadFile && (
                  <p className="text-xs text-muted-foreground text-center truncate">{uploadFile.name} · choose again to replace it</p>
                )}
                {uploadError && (
                  <div role="alert" className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <p>{uploadError}</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => void retryCamera()} disabled={checkingCamera || uploading} className="gap-2">
                {checkingCamera ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Camera className="h-4 w-4" />} Try camera again
              </Button>
              {noCameraStep.kind === 'blocked' ? (
                <Button onClick={onCancel}>Close</Button>
              ) : (
                <Button onClick={() => void handleUploadContinue()} disabled={!uploadFile || uploading} className="gap-2">
                  {uploading ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Uploading…</> : <>Continue without camera <ArrowRight className="h-4 w-4" /></>}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Capture ID (skipped when requireId === false) */}
        {needId && step === 'capture_id' && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <h3 className="font-semibold text-base flex items-center justify-center gap-2">
                <FileText className="h-5 w-5 text-primary" /> Hold up your government ID
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

            <div className="relative mx-auto max-w-sm aspect-4/3 rounded-2xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 overflow-hidden flex items-center justify-center">
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
                    <RefreshCw className="h-4 w-4" /> Retake photo
                  </Button>
                ) : (
                  <Button
                    onClick={() => capturePhoto('id')}
                    disabled={isCameraLoading || !!cameraError}
                    className="gap-2"
                  >
                    <Camera className="h-4 w-4" /> Capture ID photo
                  </Button>
                )}
              </div>

              {!idPhoto && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground w-full max-w-sm">
                  <div className="flex-1 border-b border-border"></div>
                  <span className="text-xs">or upload</span>
                  <div className="flex-1 border-b border-border"></div>
                </div>
              )}

              {!idPhoto && (
                <label className="flex items-center justify-center w-full max-w-sm cursor-pointer h-11 border border-border rounded-lg hover:bg-muted/50 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                  <span className="text-sm font-medium">Upload ID document</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (!ID_UPLOAD_TYPES.includes(file.type)) { setIdError('Use a JPG, PNG or WebP photo.'); return }
                      if (file.size > ID_UPLOAD_MAX_BYTES) { setIdError('The photo must be under 5 MB.'); return }
                      setIdError(null)
                      const reader = new FileReader()
                      reader.onload = (ev) => setIdPhoto(ev.target?.result as string)
                      reader.readAsDataURL(file)
                    }}
                  />
                </label>
              )}
              {!idPhoto && cameraBrokenLink}
            </div>

            <div className="flex flex-col gap-3 border-t pt-4">
              {idError && (
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-500/10 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p>{idError}</p>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => { stopCamera(); setStep('consent'); }} disabled={isIdVerifying}>Back</Button>
                <Button onClick={handleNextFromId} disabled={!idPhoto || isIdVerifying} className="gap-2">
                  {isIdVerifying ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</>
                  ) : needFace ? (
                    <>Next: face photo <ArrowRight className="h-4 w-4" /></>
                  ) : (
                    <>Next: review <ArrowRight className="h-4 w-4" /></>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Capture Face (skipped when requireFace === false) */}
        {needFace && step === 'capture_face' && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <h3 className="font-semibold text-base flex items-center justify-center gap-2">
                <User className="h-5 w-5 text-primary" /> Face check
              </h3>
              <p className="text-xs text-muted-foreground">
                Look directly into the camera to take a live photo of your face.
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
                captureMode="instant"
                onCapture={(_descriptor, base64) => {
                  setFacePhoto(base64)
                  setVerificationError(null)
                  setStep('confirm')
                }}
                onError={(err) => setVerificationError(err.message)}
              />
            </div>

            <div className="flex items-center justify-between gap-3 border-t pt-4">
              {cameraBrokenLink}
              <Button variant="outline" onClick={() => { if (needId) { setStep('capture_id'); startCamera(); } else { setStep('consent'); } }}>Back</Button>
            </div>
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <h3 className="font-semibold text-base">Review your photos</h3>
              <p className="text-xs text-muted-foreground">
                Verify that {needId && needFace ? 'both images are' : 'the image is'} clear and readable. If correct, submit to start the assessment.
              </p>
            </div>

            <div className={`grid gap-4 ${needId && needFace ? 'grid-cols-2' : 'grid-cols-1 max-w-xs mx-auto w-full'}`}>
              {needId && (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground block text-center">Government ID</span>
                <div className="aspect-4/3 rounded-xl border border-border overflow-hidden bg-muted">
                  {idPhoto && <img src={idPhoto} alt="ID preview" className="w-full h-full object-cover" />}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setIdPhoto(null); setStep('capture_id'); startCamera(); }} className="w-full text-xs" disabled={isVerifying}>
                  Retake ID
                </Button>
              </div>
              )}

              {needFace && (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground block text-center">Live selfie</span>
                <div className="aspect-4/3 rounded-xl border border-border overflow-hidden bg-muted">
                  {facePhoto && <img src={facePhoto} alt="Face preview" className="w-full h-full object-cover" />}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setStep('capture_face'); }} className="w-full text-xs" disabled={isVerifying}>
                  Retake selfie
                </Button>
              </div>
              )}
            </div>

            {needFace && (
            <label className="flex items-start gap-3 cursor-pointer p-3 bg-muted/40 rounded-xl border border-border text-sm">
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
            )}

            {verificationError && (
              <div role="alert" className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{verificationError}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" disabled={isVerifying} onClick={() => { if (needFace) { setStep('capture_face'); } else if (needId) { setStep('capture_id'); startCamera(); } else { setStep('consent'); } }}>Back</Button>
              <Button onClick={() => void handleFinish()} disabled={isVerifying} className="gap-2">
                {isVerifying ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> {finishLabel}</> : <><Check className="h-4 w-4" /> Start assessment</>}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
