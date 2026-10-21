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
import { useT } from '@/lib/i18n/client'

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
  const { t } = useT()
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
      addToast({ type: 'error', title: t('exam.stillNoCamera'), message: probe === 'permission_denied' ? t('exam.cameraAccessIsStillBlockedIn14b') : t('exam.weStillCantFindAWorking175') })
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
      addToast({ type: 'error', title: t('exam.captureFailed'), message: t('exam.failedToCaptureFrame') })
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
          throw new Error(data.error || t('exam.failedToVerifyId'))
        }

        setNameMatch(data.nameMatch === 'partial' ? 'partial' : 'match')
        addToast({ type: 'success', title: t('exam.idAccepted'), message: data.message || t('exam.yourIdWasReadSuccessfully') })
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
        setFinishLabel(t('exam.comparingPhotos'))
        faceMatch = await faceMatchScore(idPhoto, facePhoto)
      }
      setFinishLabel(t('common.saving'))
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
      if (!res.ok) throw new Error(data.error || t('exam.weCouldntSaveYourIdentityCheck595'))
      if (useAsProfile && facePhoto) setProfileAvatar(facePhoto)
      onComplete({ idPhoto: needId ? idPhoto : null, facePhoto: needFace ? facePhoto : null, needsReview: nameMatch === 'partial' })
    } catch (err) {
      setVerificationError(err instanceof Error ? err.message : t('exam.weCouldntSaveYourIdentityCheck595'))
    } finally {
      setIsVerifying(false)
    }
  }

  const pickUpload = (file: File | undefined) => {
    setUploadError(null)
    if (!file) return
    if (!ID_UPLOAD_TYPES.includes(file.type)) {
      setUploadError(t('exam.useAJpgPngOrWebp97c'))
      return
    }
    if (file.size > ID_UPLOAD_MAX_BYTES) {
      setUploadError(t('exam.thePhotoMustBeUnder5184'))
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
      if (!res.ok) throw new Error(data.error || t('exam.uploadFailedTryAgain'))
      onComplete({ idPhoto: null, facePhoto: null, needsReview: true })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('exam.uploadFailedTryAgain'))
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
    >{t('exam.myCameraIsntWorking')}</button>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <Card ref={panelRef} role="dialog" aria-modal="true" aria-label={t('exam.identityVerification')} className="max-w-xl w-full max-h-[92vh] overflow-y-auto rounded-3xl p-6 border-border/70 space-y-6 bg-card text-card-foreground shadow-2xl dark:shadow-none relative">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={t('common.close')}
          aria-label={t('common.close')}
        >
          <X className="h-5 w-5" />
        </button>

        {/* Wizard Header */}
        <div className="border-b border-border pb-4">
          <h2 className="text-xl font-bold text-foreground">{t('exam.identityCheck')}</h2>
          <p className="text-xs text-muted-foreground mt-1">{t('exam.requiredBeforeYouStart')}{' '}<strong className="text-foreground">{examTitle}</strong></p>

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
                <p className="font-semibold text-foreground">{t('exam.examRules')}</p>
                <ul className="list-disc pl-4 space-y-1.5 text-muted-foreground text-xs">
                  <li><strong>{t('exam.proctoredSession')}</strong>{' '}{t('exam.weMonitorYourCameraStreamEye7e8')}</li>
                  <li><strong>{t('exam.noOutsideHelp')}</strong>{' '}{t('exam.switchingTabsCopyPastingOrUsing605')}</li>
                  {(needId || needFace) && (
                    <li><strong>{t('exam.identityCheck2')}</strong> {needId && needFace ? t('exam.youTakeAPhotoOfYour5e2') : needId ? t('exam.youTakeAPhotoOfYour9dd') : t('exam.youTakeALivePhotoOfe6f')}{t('exam.theHiringTeamSeesThesePhotosc06')}</li>
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
                <span className="text-muted-foreground text-xs">{t('exam.iAgreeToKeepMyCamerafc8')}</span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedPrivacy}
                  onChange={(e) => setAgreedPrivacy(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                />
                <span className="text-muted-foreground text-xs">{t('exam.iConsentToCodespectraCollecting')}{' '}{needId && needFace ? t('exam.myLiveFacePhotoAndGovernment413') : needId ? t('exam.myGovernmentIdPhoto') : needFace ? t('exam.myLiveFacePhoto') : t('exam.sessionProctoringData')}{t('exam.iUnderstandValueUsedSolelyByf1e', { value: needId || needFace ? t('exam.theseAre') : t('exam.itIs') })}</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
              <Button
                onClick={() => void handleNextFromConsent()}
                disabled={!agreedTerms || !agreedPrivacy || checkingCamera}
                className="gap-2"
              >
                {checkingCamera ? (<><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />{' '}{t('exam.checkingYourCamera')}</>)
                  : (!needId && !needFace) ? (<>{t('exam.startAssessment')}{' '}<ArrowRight className="h-4 w-4" /></>) : (<>{t('common.continue')}{' '}<ArrowRight className="h-4 w-4" /></>)}
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
                {noCameraReason === 'permission_denied' ? t('exam.cameraAccessIsBlocked') : noCameraReason === 'no_device' ? t('exam.noCameraFound') : t('exam.yourCameraIsntWorking')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {noCameraReason === 'permission_denied'
                  ? t('exam.yourBrowserDidntGiveThisPagedc1')
                  : t('exam.weCouldntUseACameraOnf65')}
              </p>
            </div>

            {noCameraStep.kind === 'blocked' ? (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl text-sm text-foreground flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" aria-hidden />
                <p>{t('exam.thisTestNeedsAWorkingCamera1b5')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-4 bg-muted/40 border border-border rounded-2xl text-sm text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">{t('exam.youCanStillTakeThisTest')}</p>
                  <p>{t('exam.uploadAClearPhotoOfYour91c')}</p>
                </div>
                <label className="flex flex-col items-center justify-center gap-2 w-full cursor-pointer min-h-28 border border-dashed border-border rounded-2xl hover:bg-muted/50 transition-colors p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                  {uploadPreview ? (
                    <img src={uploadPreview} alt={t('exam.yourIdPhoto')} className="max-h-48 rounded-lg object-contain" />
                  ) : (
                    <>
                      <Upload className="h-5 w-5 text-muted-foreground" aria-hidden />
                      <span className="text-sm font-medium">{t('exam.chooseAPhotoOfYourId')}</span>
                      <span className="text-xs text-muted-foreground">{t('exam.jpgPngOrWebpUpTo54c')}</span>
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
                  <p className="text-xs text-muted-foreground text-center truncate">{t('exam.nameChooseAgainToReplaceIt', { name: uploadFile.name })}</p>
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
                {checkingCamera ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Camera className="h-4 w-4" />}{' '}{t('exam.tryCameraAgain')}</Button>
              {noCameraStep.kind === 'blocked' ? (
                <Button onClick={onCancel}>{t('common.close')}</Button>
              ) : (
                <Button onClick={() => void handleUploadContinue()} disabled={!uploadFile || uploading} className="gap-2">
                  {uploading ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />{' '}{t('exam.uploading')}</> : <>{t('exam.continueWithoutCamera')}{' '}<ArrowRight className="h-4 w-4" /></>}
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
                <FileText className="h-5 w-5 text-primary" />{' '}{t('exam.holdUpYourGovernmentId')}</h3>
              <p className="text-xs text-muted-foreground">{t('exam.placeYourIdAadhaarPassportDriversa5d')}</p>
            </div>

            {cameraError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{cameraError}</span>
              </div>
            )}

            <div className="relative mx-auto max-w-sm aspect-4/3 rounded-2xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 overflow-hidden flex items-center justify-center">
              {idPhoto ? (
                <img src={idPhoto} alt={t('exam.capturedId')} className="w-full h-full object-cover" />
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
                    <RefreshCw className="h-4 w-4" />{' '}{t('exam.retakePhoto')}</Button>
                ) : (
                  <Button
                    onClick={() => capturePhoto('id')}
                    disabled={isCameraLoading || !!cameraError}
                    className="gap-2"
                  >
                    <Camera className="h-4 w-4" />{' '}{t('exam.captureIdPhoto')}</Button>
                )}
              </div>

              {!idPhoto && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground w-full max-w-sm">
                  <div className="flex-1 border-b border-border"></div>
                  <span className="text-xs">{t('exam.orUpload')}</span>
                  <div className="flex-1 border-b border-border"></div>
                </div>
              )}

              {!idPhoto && (
                <label className="flex items-center justify-center w-full max-w-sm cursor-pointer h-11 border border-border rounded-lg hover:bg-muted/50 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                  <span className="text-sm font-medium">{t('exam.uploadIdDocument')}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (!ID_UPLOAD_TYPES.includes(file.type)) { setIdError(t('exam.useAJpgPngOrWebp97c')); return }
                      if (file.size > ID_UPLOAD_MAX_BYTES) { setIdError(t('exam.thePhotoMustBeUnder5184')); return }
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
                <Button variant="outline" onClick={() => { stopCamera(); setStep('consent'); }} disabled={isIdVerifying}>{t('common.back')}</Button>
                <Button onClick={handleNextFromId} disabled={!idPhoto || isIdVerifying} className="gap-2">
                  {isIdVerifying ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />{' '}{t('exam.verifying')}</>
                  ) : needFace ? (
                    <>{t('exam.nextFacePhoto')}{' '}<ArrowRight className="h-4 w-4" /></>
                  ) : (
                    <>{t('exam.nextReview')}{' '}<ArrowRight className="h-4 w-4" /></>
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
                <User className="h-5 w-5 text-primary" />{' '}{t('exam.faceCheck')}</h3>
              <p className="text-xs text-muted-foreground">{t('exam.lookDirectlyIntoTheCameraTo0e3')}</p>
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
              <Button variant="outline" onClick={() => { if (needId) { setStep('capture_id'); startCamera(); } else { setStep('consent'); } }}>{t('common.back')}</Button>
            </div>
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <h3 className="font-semibold text-base">{t('exam.reviewYourPhotos')}</h3>
              <p className="text-xs text-muted-foreground">{t('exam.verifyThatValueClearAndReadablee16', { value: needId && needFace ? t('exam.bothImagesAre') : t('exam.theImageIs') })}</p>
            </div>

            <div className={`grid gap-4 ${needId && needFace ? 'grid-cols-2' : 'grid-cols-1 max-w-xs mx-auto w-full'}`}>
              {needId && (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground block text-center">{t('exam.governmentId')}</span>
                <div className="aspect-4/3 rounded-xl border border-border overflow-hidden bg-muted">
                  {idPhoto && <img src={idPhoto} alt={t('exam.idPreview')} className="w-full h-full object-cover" />}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setIdPhoto(null); setStep('capture_id'); startCamera(); }} className="w-full text-xs" disabled={isVerifying}>{t('exam.retakeId')}</Button>
              </div>
              )}

              {needFace && (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground block text-center">{t('exam.liveSelfie')}</span>
                <div className="aspect-4/3 rounded-xl border border-border overflow-hidden bg-muted">
                  {facePhoto && <img src={facePhoto} alt={t('exam.facePreview')} className="w-full h-full object-cover" />}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setStep('capture_face'); }} className="w-full text-xs" disabled={isVerifying}>{t('exam.retakeSelfie')}</Button>
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
                <span className="text-muted-foreground text-xs">{t('exam.alsoUseMyVerificationSelfieAs450')}</span>
              </label>
            )}

            {verificationError && (
              <div role="alert" className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{verificationError}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" disabled={isVerifying} onClick={() => { if (needFace) { setStep('capture_face'); } else if (needId) { setStep('capture_id'); startCamera(); } else { setStep('consent'); } }}>{t('common.back')}</Button>
              <Button onClick={() => void handleFinish()} disabled={isVerifying} className="gap-2">
                {isVerifying ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> {finishLabel}</> : <><Check className="h-4 w-4" />{' '}{t('exam.startAssessment')}</>}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
