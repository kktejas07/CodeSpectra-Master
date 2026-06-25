'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, Loader2, Upload, XCircle, Eye, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface VerifyResult {
  match?: boolean
  confidence?: number
  reasoning?: string
  warnings?: string[]
  status?: 'approved' | 'rejected' | 'manual_review'
  id?: string
}

export default function IdentityVerificationPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [selfie, setSelfie] = useState<string | null>(null)
  const [idPhoto, setIdPhoto] = useState<string | null>(null)
  const [camOn, setCamOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    return () => stopCamera()
  }, [])

  async function startCamera() {
    setErr(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
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
    setSelfie(canvas.toDataURL('image/jpeg', 0.7))
    stopCamera()
  }
  function handleIdUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setIdPhoto(typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
  }
  async function verify() {
    if (!selfie || !idPhoto) return
    setBusy(true)
    setErr(null)
    setResult(null)
    try {
      const res = await fetch('/api/identity/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selfie_data_url: selfie, id_data_url: idPhoto }),
      })
      const j = (await res.json()) as VerifyResult & { error?: string }
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setResult(j)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  function reset() {
    setSelfie(null)
    setIdPhoto(null)
    setResult(null)
    setErr(null)
  }

  return (
    <div className="space-y-6" data-testid="identity-verify-page">
      <div>
        <h1 className="text-2xl font-bold">Identity Verification</h1>
        <p className="text-sm text-muted-foreground">
          AI-powered identity check — capture a live selfie and upload a government ID. The
          two images are compared by Gemini Vision.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Step 1 — selfie */}
        <div className="rounded-xl border border-border/60 bg-card/40 p-5">
          <div className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" /> Step 1 — Live selfie
          </div>
          <div className="aspect-video rounded-lg border border-border bg-muted/40 overflow-hidden flex items-center justify-center">
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
              <div className="text-center text-muted-foreground text-xs px-4">
                Click &quot;Start camera&quot; to begin.
              </div>
            )}
          </div>
          <div className="mt-3 flex gap-2">
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
                onClick={() => {
                  setSelfie(null)
                  void startCamera()
                }}
                variant="outline"
                data-testid="cam-retake"
                className="flex-1"
              >
                <RotateCcw className="h-4 w-4 mr-1.5" /> Retake
              </Button>
            )}
          </div>
        </div>

        {/* Step 2 — ID */}
        <div className="rounded-xl border border-border/60 bg-card/40 p-5">
          <div className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" /> Step 2 — Upload government ID
          </div>
          <div className="aspect-video rounded-lg border border-border bg-muted/40 overflow-hidden flex items-center justify-center">
            {idPhoto ? (
              <img src={idPhoto} alt="id" className="w-full h-full object-contain" />
            ) : (
              <label className="cursor-pointer text-center text-muted-foreground text-xs p-6">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleIdUpload}
                  data-testid="id-upload"
                />
                Click to upload ID photo (PNG/JPG, &lt; 1 MB)
              </label>
            )}
          </div>
          {idPhoto && (
            <div className="mt-3 flex">
              <Button
                variant="outline"
                onClick={() => setIdPhoto(null)}
                data-testid="id-clear"
                className="flex-1"
              >
                Replace
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={verify}
          disabled={!selfie || !idPhoto || busy}
          data-testid="verify-btn"
          size="lg"
        >
          {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
          Run AI verification
        </Button>
        <Button variant="outline" onClick={reset} disabled={busy} data-testid="verify-reset">
          Reset
        </Button>
      </div>

      {err && (
        <div className="rounded border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm">
          {err}
        </div>
      )}

      {result && (
        <div
          className={cn(
            'rounded-xl border p-5',
            result.status === 'approved' && 'border-emerald-400/40 bg-emerald-400/5',
            result.status === 'rejected' && 'border-destructive/40 bg-destructive/5',
            result.status === 'manual_review' && 'border-amber-400/40 bg-amber-400/5',
          )}
          data-testid="verify-result"
        >
          <div className="flex items-center gap-2 mb-3">
            {result.status === 'approved' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            ) : result.status === 'rejected' ? (
              <XCircle className="h-5 w-5 text-destructive" />
            ) : (
              <Eye className="h-5 w-5 text-amber-400" />
            )}
            <div>
              <div className="font-semibold capitalize">
                {result.status?.replace('_', ' ')}
              </div>
              <div className="text-xs text-muted-foreground">
                Confidence: <span className="font-mono">{result.confidence ?? 0}</span>/100
              </div>
            </div>
          </div>
          {result.reasoning && (
            <p className="text-sm text-foreground/90 mb-2">{result.reasoning}</p>
          )}
          {result.warnings && result.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-amber-400 space-y-0.5">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
