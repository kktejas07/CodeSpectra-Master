'use client'

/**
 * Apply form for jobs run through the hiring pipeline (job_postings rows with
 * `ats_job_id`). Signed-in applicants apply in one click (their primary résumé
 * is used unless they attach one); guests give name, email, phone and a résumé.
 * Posts to /api/ats/public/jobs/[id]/apply.
 */
import { useState } from 'react'
import { Loader2, AlertCircle, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'
import { csrfFetch } from '@/lib/csrf-fetch'

const ACCEPT = '.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown'
const MAX_MB = 5

/** Country of the phone number: sets the dialling code and the region number used for screening calls. */
const COUNTRIES = [
  { iso: 'IN', dial: '+91', name: 'India' },
  { iso: 'US', dial: '+1', name: 'United States' },
  { iso: 'CA', dial: '+1', name: 'Canada' },
  { iso: 'GB', dial: '+44', name: 'United Kingdom' },
  { iso: 'AE', dial: '+971', name: 'United Arab Emirates' },
  { iso: 'SG', dial: '+65', name: 'Singapore' },
  { iso: 'AU', dial: '+61', name: 'Australia' },
  { iso: 'DE', dial: '+49', name: 'Germany' },
] as const

/** "98765 43210" + IN → "+919876543210"; numbers already starting with + are kept. */
function withDialCode(phone: string, iso: string): string {
  const p = phone.trim()
  if (!p || p.startsWith('+')) return p
  const dial = COUNTRIES.find((c) => c.iso === iso)?.dial ?? ''
  return `${dial}${p.replace(/^0+/, '')}`
}

export function AtsApplyForm({
  atsJobId,
  signedIn,
  defaultName,
  onApplied,
}: {
  atsJobId: string
  signedIn: boolean
  defaultName?: string
  onApplied: (alreadyApplied: boolean) => void
}) {
  const [name, setName] = useState(defaultName || '')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [country, setCountry] = useState<string>('IN')
  const [location, setLocation] = useState('')
  const [cover, setCover] = useState('')
  const [notice, setNotice] = useState('')
  const [currentSalary, setCurrentSalary] = useState('')
  const [expectedSalary, setExpectedSalary] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [consentWa, setConsentWa] = useState(false)
  const [consentCalls, setConsentCalls] = useState(false)
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    if (file && file.size > MAX_MB * 1024 * 1024) { setError(`Résumés can be up to ${MAX_MB} MB`); return }
    if (!signedIn && !file) { setError('Attach your résumé'); return }
    const fd = new FormData()
    fd.set('name', name)
    if (!signedIn) { fd.set('email', email); fd.set('captcha', captcha || '') }
    fd.set('phone', withDialCode(phone, country))
    fd.set('country', country)
    fd.set('location', location)
    fd.set('notice_days', notice)
    fd.set('current_salary', currentSalary)
    fd.set('expected_salary', expectedSalary)
    fd.set('cover_letter', cover)
    fd.set('consent_whatsapp', String(consentWa))
    fd.set('consent_calls', String(consentCalls))
    fd.set('website', (e.currentTarget.elements.namedItem('website') as HTMLInputElement | null)?.value || '')
    if (file) fd.set('resume', file)
    setBusy(true)
    try {
      const res = await csrfFetch(`/api/ats/public/jobs/${encodeURIComponent(atsJobId)}/apply`, { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) onApplied(!!data.already_applied)
      else {
        setError(data.error || 'Could not submit your application')
        if (!signedIn) setCaptchaKey((k) => k + 1)
      }
    } catch {
      setError('Something went wrong. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {/* Honeypot: hidden from people and assistive tech. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="apply-name" className="text-xs text-cs-ink">Full name</Label>
        <Input id="apply-name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {!signedIn && (
        <div className="space-y-1.5">
          <Label htmlFor="apply-email" className="text-xs text-cs-ink">Email</Label>
          <Input id="apply-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="apply-phone" className="text-xs text-cs-ink">Phone{signedIn ? ' (optional)' : ''}</Label>
        <div className="flex gap-2">
          <select
            aria-label="Country code"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="h-9 w-28 shrink-0 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{c.iso} {c.dial}</option>)}
          </select>
          <Input id="apply-phone" type="tel" required={!signedIn} autoComplete="tel-national" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="apply-location" className="text-xs text-cs-ink">Current city (optional)</Label>
        <Input id="apply-location" autoComplete="address-level2" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="apply-notice" className="text-xs text-cs-ink">Notice period (days)</Label>
          <Input id="apply-notice" inputMode="numeric" placeholder="30" value={notice} onChange={(e) => setNotice(e.target.value.replace(/[^\d]/g, '').slice(0, 3))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="apply-current-salary" className="text-xs text-cs-ink">Current salary / year</Label>
          <Input id="apply-current-salary" inputMode="numeric" placeholder="Optional" value={currentSalary} onChange={(e) => setCurrentSalary(e.target.value.replace(/[^\d]/g, '').slice(0, 11))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="apply-expected-salary" className="text-xs text-cs-ink">Expected salary / year</Label>
          <Input id="apply-expected-salary" inputMode="numeric" placeholder="Optional" value={expectedSalary} onChange={(e) => setExpectedSalary(e.target.value.replace(/[^\d]/g, '').slice(0, 11))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="apply-resume" className="text-xs text-cs-ink">
          Résumé{signedIn ? ' (optional — we use your primary résumé otherwise)' : ''}
        </Label>
        <label
          htmlFor="apply-resume"
          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-cs-grid px-3 py-2 text-sm text-cs-ink-soft hover:border-cs-accent focus-within:ring-2 focus-within:ring-ring"
        >
          <Paperclip className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{file ? file.name : 'PDF, DOCX, TXT or Markdown, up to 5 MB'}</span>
          <input id="apply-resume" type="file" accept={ACCEPT} className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="apply-cover" className="text-xs text-cs-ink">Cover letter (optional)</Label>
        <Textarea id="apply-cover" rows={3} value={cover} onChange={(e) => setCover(e.target.value)} placeholder="Tell the team why you're a great fit…" className="text-sm" />
      </div>
      <fieldset className="space-y-2 rounded-2xl border border-cs-grid p-3">
        <legend className="px-1 text-xs font-medium text-cs-ink">How can the hiring team reach you?</legend>
        <div className="flex items-start gap-2">
          <Checkbox id="consent-wa" checked={consentWa} onCheckedChange={(v) => setConsentWa(v === true)} className="mt-0.5" />
          <Label htmlFor="consent-wa" className="text-xs font-normal leading-5 text-cs-ink-soft">
            Message me on WhatsApp about this application (screening questions, interview times)
          </Label>
        </div>
        <div className="flex items-start gap-2">
          <Checkbox id="consent-calls" checked={consentCalls} onCheckedChange={(v) => setConsentCalls(v === true)} className="mt-0.5" />
          <Label htmlFor="consent-calls" className="text-xs font-normal leading-5 text-cs-ink-soft">
            Call me for a short automated or recruiter screening call
          </Label>
        </div>
        <p className="text-[11px] leading-4 text-cs-ink-soft">Optional. You can change this any time by replying to the team. Email updates are always sent.</p>
      </fieldset>
      {!signedIn && <TurnstileWidget onVerify={setCaptcha} resetKey={captchaKey} />}
      {error && (
        <p role="alert" className="flex items-center gap-1 text-xs text-cs-flag">
          <AlertCircle className="h-3 w-3" aria-hidden />{error}
        </p>
      )}
      <Button type="submit" className="h-11 w-full rounded-full" disabled={busy}>
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
        {busy ? 'Submitting…' : 'Submit application'}
      </Button>
    </form>
  )
}
