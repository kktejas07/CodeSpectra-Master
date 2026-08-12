'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Camera, CheckCircle2, Loader2, Upload, XCircle, Eye, RotateCcw,
  User, FileText, ShieldCheck, ChevronRight, ChevronLeft, AlertTriangle,
  Info, CreditCard, BookOpen, BadgeCheck, Scan, Fingerprint
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { csrfFetch } from '@/lib/csrf-fetch'
import { usePageGuard } from '@/lib/use-page-guard'
import { createWorker } from 'tesseract.js'

interface VerifyResult {
  match?: boolean
  confidence?: number
  reasoning?: string
  warnings?: string[]
  status?: 'approved' | 'rejected' | 'manual_review'
  id?: string
}

interface StatusResult {
  status?: 'approved' | 'rejected' | 'manual_review' | 'none'
  verified?: boolean
  created_at?: string
  reasoning?: string
}

const STEPS = [
  { id: 1, label: 'Personal Info', icon: User },
  { id: 2, label: 'Document Type', icon: FileText },
  { id: 3, label: 'Upload ID', icon: Upload },
  { id: 4, label: 'Take Selfie', icon: Camera },
  { id: 5, label: 'Review & Submit', icon: ShieldCheck },
]

const DOC_TYPES = [
  { id: 'passport', label: 'Passport', icon: BookOpen, desc: 'International travel document' },
  { id: 'drivers_license', label: "Driver's License", icon: CreditCard, desc: 'National driving permit' },
  { id: 'national_id', label: 'National ID Card', icon: BadgeCheck, desc: 'Government-issued ID' },
]

const NATIONALITIES = [
  'Indian', 'American', 'British', 'Canadian', 'Australian', 'German', 'French',
  'Japanese', 'Chinese', 'Brazilian', 'Other'
]

export default function IdentityVerificationPage() {
  const gate = usePageGuard('user')

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Step state
  const [step, setStep] = useState(1)

  // Personal info
  const [fullName, setFullName] = useState('')
  const [dob, setDob] = useState('')
  const [nationality, setNationality] = useState('')

  // Document
  const [docType, setDocType] = useState('')
  const [idFront, setIdFront] = useState<string | null>(null)
  const [idBack, setIdBack] = useState<string | null>(null)

  // Selfie
  const [selfie, setSelfie] = useState<string | null>(null)
  const [camOn, setCamOn] = useState(false)

  // OCR
  const [ocrText, setOcrText] = useState('')
  const [ocrExtracting, setOcrExtracting] = useState(false)
  const [ocrMatch, setOcrMatch] = useState<{ nameMatch: boolean; dobMatch: boolean } | null>(null)

  // Verification
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // Existing status
  const [existingStatus, setExistingStatus] = useState<StatusResult | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)

  useEffect(() => {
    void fetchStatus()
    return () => stopCamera()
  }, [])

  async function fetchStatus() {
    try {
      const res = await csrfFetch('/api/identity/status', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json() as StatusResult
        setExistingStatus(data)
      }
    } catch { /* ignore */ }
    setStatusLoading(false)
  }

  async function startCamera() {
    setErr(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCamOn(true)
    } catch (e) {
      setErr(`Camera access denied: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCamOn(false)
  }

  function capture() {
    if (!videoRef.current) return
    const v = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(v, 0, 0)
    setSelfie(canvas.toDataURL('image/jpeg', 0.8))
    stopCamera()
  }

  function handleFrontUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setIdFront(typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
  }

  function handleBackUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setIdBack(typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
  }

  async function extractTextFromID() {
    if (!idFront) return
    setOcrExtracting(true)
    setOcrText('')
    setOcrMatch(null)
    try {
      const worker = await createWorker('eng')
      const { data } = await worker.recognize(idFront)
      await worker.terminate()
      const text = data.text
      setOcrText(text)

      // Simple matching: check if user-provided name appears in extracted text
      const nameWords = fullName.toLowerCase().split(/\s+/).filter(w => w.length > 2)
      const textLower = text.toLowerCase()
      const nameMatch = nameWords.length > 0 && nameWords.every(w => textLower.includes(w))

      // Check DOB match (DD/MM/YYYY or DD-MM-YYYY or YYYY-MM-DD)
      const dobVariants = [
        dob.replace(/-/g, '/'),
        dob.split('-').reverse().join('/'),
        dob,
      ]
      const dobMatch = dobVariants.some(v => textLower.includes(v.toLowerCase()))

      setOcrMatch({ nameMatch, dobMatch })
    } catch (e) {
      setOcrText('OCR extraction failed: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setOcrExtracting(false)
    }
  }

  // Auto-extract when ID is uploaded and user info is available
  useEffect(() => {
    if (idFront && fullName.trim() && dob) {
      void extractTextFromID()
    }
  }, [idFront, fullName, dob])

  async function submit() {
    if (!idFront) return
    setBusy(true)
    setErr(null)
    setResult(null)
    try {
      const res = await csrfFetch('/api/identity/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selfie_data_url: selfie || null,
          id_data_url: idFront,
          candidate_name: fullName,
          document_type: docType,
          date_of_birth: dob,
          nationality,
          ocr_extracted_text: ocrText,
          ocr_name_match: ocrMatch?.nameMatch ?? null,
          ocr_dob_match: ocrMatch?.dobMatch ?? null,
        }),
      })
      const j = (await res.json()) as VerifyResult & { error?: string }
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setResult(j)
      setStep(6) // Show results
      void fetchStatus()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setStep(1)
    setFullName('')
    setDob('')
    setNationality('')
    setDocType('')
    setIdFront(null)
    setIdBack(null)
    setSelfie(null)
    setResult(null)
    setErr(null)
  }

  function canNext() {
    if (step === 1) return fullName.trim().length > 0 && dob.length > 0 && nationality.length > 0
    if (step === 2) return docType.length > 0
    if (step === 3) return idFront !== null
    if (step === 4) return true // Selfie is optional
    return true
  }

  if (!gate.ready) return null

  // Verification status banner
  if (existingStatus?.verified) {
    return (
      <div className="space-y-6" data-testid="identity-verify-page">
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-8 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-400 mb-3" />
          <h1 className="text-2xl font-bold text-foreground mb-1">Identity Verified</h1>
          <p className="text-muted-foreground mb-4">
            Your identity has been verified successfully.
          </p>
          {existingStatus.created_at && (
            <p className="text-xs text-muted-foreground">
              Verified on {new Date(existingStatus.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          )}
        </div>
      </div>
    )
  }

  // Results view
  if (step === 6 && result) {
    return (
      <div className="space-y-6" data-testid="identity-verify-page">
        <div>
          <h1 className="text-2xl font-bold">Verification Result</h1>
          <p className="text-sm text-muted-foreground">Your identity verification has been processed.</p>
        </div>
        <div
          className={cn(
            'rounded-xl border p-6',
            result.status === 'approved' && 'border-emerald-400/40 bg-emerald-400/5',
            result.status === 'rejected' && 'border-destructive/40 bg-destructive/5',
            result.status === 'manual_review' && 'border-amber-400/40 bg-amber-400/5',
          )}
          data-testid="verify-result"
        >
          <div className="flex items-center gap-3 mb-4">
            {result.status === 'approved' ? (
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            ) : result.status === 'rejected' ? (
              <XCircle className="h-8 w-8 text-destructive" />
            ) : (
              <Eye className="h-8 w-8 text-amber-400" />
            )}
            <div>
              <div className="text-lg font-semibold capitalize">
                {result.status?.replace('_', ' ')}
              </div>
              <div className="text-sm text-muted-foreground">
                Confidence: <span className="font-mono font-semibold">{result.confidence ?? 0}</span>/100
              </div>
            </div>
          </div>
          {result.reasoning && (
            <p className="text-sm text-foreground/90 mb-3">{result.reasoning}</p>
          )}
          {result.warnings && result.warnings.length > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-amber-400/10 border border-amber-400/20">
              <p className="text-xs font-semibold text-amber-400 mb-1">Warnings</p>
              <ul className="list-disc pl-4 text-xs text-amber-400 space-y-0.5">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
        </div>
        <Button onClick={reset} variant="outline">
          <RotateCcw className="h-4 w-4 mr-1.5" /> Start New Verification
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6" data-testid="identity-verify-page">
      <div>
        <h1 className="text-2xl font-bold">Identity Verification</h1>
        <p className="text-sm text-muted-foreground">
          Complete the steps below to verify your identity. This is required for certain assessments and certifications.
        </p>
      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const active = step === s.id
          const done = step > s.id
          return (
            <div key={s.id} className="flex items-center">
              <div
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                  active && 'bg-primary text-primary-foreground',
                  done && 'bg-emerald-500/20 text-emerald-400',
                  !active && !done && 'bg-muted text-muted-foreground'
                )}
              >
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground mx-1 shrink-0" />}
            </div>
          )
        })}
      </div>

      {/* Error */}
      {err && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {err}
        </div>
      )}

      {/* Step 1: Personal Info */}
      {step === 1 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <User className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Personal Information</h2>
          </div>
          <p className="text-sm text-muted-foreground">Enter your legal name as it appears on your government ID.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="full-name">Full Legal Name *</Label>
              <Input
                id="full-name"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="As shown on your ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dob">Date of Birth *</Label>
              <Input
                id="dob"
                type="date"
                value={dob}
                onChange={e => setDob(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Nationality *</Label>
            <Select value={nationality} onValueChange={setNationality}>
              <SelectTrigger><SelectValue placeholder="Select nationality" /></SelectTrigger>
              <SelectContent>
                {NATIONALITIES.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Card>
      )}

      {/* Step 2: Document Type */}
      {step === 2 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Select Document Type</h2>
          </div>
          <p className="text-sm text-muted-foreground">Choose the government-issued ID you will upload.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {DOC_TYPES.map(d => {
              const Icon = d.icon
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDocType(d.id)}
                  className={cn(
                    'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center',
                    docType === d.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  <Icon className={cn('h-8 w-8', docType === d.id ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="text-sm font-medium">{d.label}</span>
                  <span className="text-xs text-muted-foreground">{d.desc}</span>
                </button>
              )
            })}
          </div>
        </Card>
      )}

      {/* Step 3: Upload ID */}
      {step === 3 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Upload className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Upload Your {DOC_TYPES.find(d => d.id === docType)?.label || 'ID'}</h2>
          </div>

          {/* Guidelines */}
          <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-400 space-y-1">
                <p className="font-semibold">Photo guidelines:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Place your ID on a flat, well-lit surface</li>
                  <li>Ensure all four corners are visible</li>
                  <li>Avoid glare, shadows, or obstructions</li>
                  <li>Text and photo must be clearly legible</li>
                  <li>Accepted formats: JPG, PNG (max 1 MB)</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Front upload */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Front of ID *</Label>
            <div className="aspect-[16/10] rounded-lg border-2 border-dashed border-border bg-muted/20 overflow-hidden flex items-center justify-center relative">
              {idFront ? (
                <>
                  <img src={idFront} alt="ID front" className="w-full h-full object-contain" />
                  <button
                    type="button"
                    onClick={() => setIdFront(null)}
                    className="absolute top-2 right-2 bg-background/80 backdrop-blur rounded-full p-1 hover:bg-background"
                  >
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  </button>
                </>
              ) : (
                <label className="cursor-pointer text-center p-6 w-full h-full flex flex-col items-center justify-center">
                  <input type="file" accept="image/*" className="hidden" onChange={handleFrontUpload} data-testid="id-front-upload" />
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Click to upload front of ID</span>
                  <span className="text-xs text-muted-foreground/60 mt-1">JPG or PNG, max 1 MB</span>
                </label>
              )}
            </div>
          </div>

          {/* Back upload (for driver's license) */}
          {docType === 'drivers_license' && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Back of ID (optional)</Label>
              <div className="aspect-[16/10] rounded-lg border-2 border-dashed border-border bg-muted/20 overflow-hidden flex items-center justify-center relative">
                {idBack ? (
                  <>
                    <img src={idBack} alt="ID back" className="w-full h-full object-contain" />
                    <button
                      type="button"
                      onClick={() => setIdBack(null)}
                      className="absolute top-2 right-2 bg-background/80 backdrop-blur rounded-full p-1 hover:bg-background"
                    >
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </>
                ) : (
                  <label className="cursor-pointer text-center p-6 w-full h-full flex flex-col items-center justify-center">
                    <input type="file" accept="image/*" className="hidden" onChange={handleBackUpload} data-testid="id-back-upload" />
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">Click to upload back of ID</span>
                  </label>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Step 4: Selfie */}
      {step === 4 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Camera className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Take a Selfie</h2>
            <Badge variant="outline" className="text-[10px]">Optional</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            A selfie helps with verification but is not required. If your ID photo is old or differs significantly from your current appearance, you can skip this step.
          </p>

          <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-400 space-y-1">
                <p className="font-semibold">Selfie tips:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Look directly at the camera</li>
                  <li>Keep a neutral expression</li>
                  <li>Ensure your face is well-lit</li>
                  <li>Remove glasses, hats, or face coverings</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="aspect-video rounded-lg border border-border bg-muted/40 overflow-hidden flex items-center justify-center max-w-md mx-auto">
            {selfie ? (
              <img src={selfie} alt="selfie" className="w-full h-full object-cover" />
            ) : (
              <video
                ref={videoRef}
                playsInline
                muted
                className={cn('w-full h-full object-cover', !camOn && 'hidden')}
              />
            )}
            {!selfie && !camOn && (
              <div className="text-center text-muted-foreground text-sm px-4">
                <Camera className="h-10 w-10 mx-auto mb-2 opacity-40" />
                Click &quot;Start camera&quot; to begin
              </div>
            )}
          </div>

          <div className="flex gap-2 max-w-md mx-auto">
            {!camOn && !selfie && (
              <Button onClick={startCamera} data-testid="cam-start" className="flex-1">
                <Camera className="h-4 w-4 mr-1.5" /> Start camera
              </Button>
            )}
            {camOn && (
              <Button onClick={capture} data-testid="cam-capture" className="flex-1">
                <Eye className="h-4 w-4 mr-1.5" /> Capture
              </Button>
            )}
            {selfie && (
              <Button
                onClick={() => { setSelfie(null); void startCamera() }}
                variant="outline"
                data-testid="cam-retake"
                className="flex-1"
              >
                <RotateCcw className="h-4 w-4 mr-1.5" /> Retake
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Step 5: Review & Submit */}
      {step === 5 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Review & Submit</h2>
          </div>
          <p className="text-sm text-muted-foreground">Verify the information below is correct before submitting.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Full Name</p>
                <p className="text-sm font-medium">{fullName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Date of Birth</p>
                <p className="text-sm font-medium">{dob}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Nationality</p>
                <p className="text-sm font-medium">{nationality}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Document Type</p>
                <p className="text-sm font-medium">{DOC_TYPES.find(d => d.id === docType)?.label || docType}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Selfie</p>
                <p className="text-sm font-medium">{selfie ? 'Provided' : 'Skipped'}</p>
              </div>
            </div>
            <div className="space-y-3">
              {idFront && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">ID Front</p>
                  <img src={idFront} alt="ID front preview" className="w-full h-32 object-contain rounded-lg border border-border" />
                </div>
              )}
              {selfie && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Selfie</p>
                  <img src={selfie} alt="selfie preview" className="w-full h-32 object-cover rounded-lg border border-border" />
                </div>
              )}
            </div>
          </div>

          {/* OCR Results */}
          {ocrExtracting && (
            <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3 flex items-center gap-2">
              <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
              <span className="text-sm text-blue-400">Extracting text from ID document...</span>
            </div>
          )}
          {ocrMatch && (
            <div className={cn(
              'rounded-lg p-3 border',
              ocrMatch.nameMatch && ocrMatch.dobMatch
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : 'bg-amber-500/5 border-amber-500/20'
            )}>
              <div className="flex items-center gap-2 mb-2">
                <Scan className="h-4 w-4" />
                <span className="text-sm font-semibold">OCR Verification</span>
              </div>
              <div className="flex gap-4 text-xs">
                <span className="flex items-center gap-1">
                  {ocrMatch.nameMatch ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-amber-400" />}
                  Name {ocrMatch.nameMatch ? 'matched' : 'not found'}
                </span>
                <span className="flex items-center gap-1">
                  {ocrMatch.dobMatch ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-amber-400" />}
                  DOB {ocrMatch.dobMatch ? 'matched' : 'not found'}
                </span>
              </div>
              {!ocrMatch.nameMatch && !ocrMatch.dobMatch && (
                <p className="text-xs text-amber-400 mt-2">
                  If your ID photo is old and text is not clearly visible, this is normal. The AI will still review your documents.
                </p>
              )}
            </div>
          )}

          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            By submitting, you confirm that the information and documents provided are genuine and belong to you.
          </div>
        </Card>
      )}

      {/* Navigation buttons */}
      {step <= 5 && (
        <div className="flex items-center justify-between">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(s => s - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1.5" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step < 5 ? (
              <Button onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
                Next <ChevronRight className="h-4 w-4 ml-1.5" />
              </Button>
            ) : (
              <Button onClick={submit} disabled={busy} size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-1.5" />}
                Submit Verification
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
