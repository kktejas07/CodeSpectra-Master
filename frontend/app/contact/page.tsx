'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Loader2, Mail, MapPin } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { csrfFetch } from '@/lib/csrf-fetch'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'
import { cn } from '@/lib/utils'
import { DeviceShowcase } from '@/components/visuals'

const TOPICS = [
  { value: 'pilot', label: 'Book a pilot', hint: 'Try CodeSpectra on one open role.' },
  { value: 'sales', label: 'Pricing or plans', hint: 'Seats, campus licences, invoices.' },
  { value: 'support', label: 'Help with my account', hint: 'Something isn’t working.' },
  { value: 'other', label: 'Something else', hint: 'Partnerships, press, anything.' },
] as const

type Topic = (typeof TOPICS)[number]['value']

const field =
  'h-12 w-full rounded-xl border border-cs-grid bg-cs-sheet px-4 text-base text-cs-ink placeholder:text-cs-ink-soft/70 transition-colors hover:border-cs-ink-soft focus:border-cs-accent focus:outline-none aria-invalid:border-cs-flag'

function ContactInner() {
  const params = useSearchParams()
  const initial = (TOPICS.find((t) => t.value === params.get('topic'))?.value ?? 'pilot') as Topic
  const [topic, setTopic] = useState<Topic>(initial)
  const [form, setForm] = useState({ name: '', email: '', organisation: '', role: '', message: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    if (errors[k]) setErrors(({ [k]: _drop, ...rest }) => rest)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const local: Record<string, string> = {}
    if (!form.name.trim()) local.name = 'Enter your name.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) local.email = 'Enter a valid work email, like you@company.com.'
    if (form.message.trim().length < 10) local.message = 'Tell us a little more — at least 10 characters.'
    setErrors(local)
    if (Object.keys(local).length) return

    setSending(true)
    try {
      const res = await csrfFetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, topic, source: 'contact-page', turnstileToken }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> }
      if (!res.ok) {
        if (data.fields) setErrors(data.fields)
        setFormError(data.error || 'Your message could not be sent. Try again, or email support@codespectra.ai.')
        setTurnstileToken(null)
        setTurnstileResetKey((k) => k + 1)
        return
      }
      setSent(true)
    } catch {
      setFormError('No connection. Check your internet and send again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <PublicPageWrapper>
      <section className="relative isolate overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-50 [mask-image:radial-gradient(60%_60%_at_80%_20%,#000_25%,transparent_75%)]"
          style={{ backgroundImage: 'radial-gradient(rgba(47,91,231,0.28) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />
        <div className="mx-auto grid max-w-[1200px] gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16 lg:px-8 lg:py-20">
          {/* Left: context */}
          <div>
            <h1 className="cs-display max-w-[14ch] text-5xl sm:text-6xl">Talk to the CodeSpectra team</h1>
            <p className="mt-6 max-w-[48ch] text-lg leading-relaxed text-cs-ink-soft">
              Tell us about the role you’re hiring for. For a pilot, we set up the assessment with you and walk you
              through the ranked shortlist.
            </p>

            <ol className="mt-10 space-y-5">
              {[
                ['You send the form', 'It goes straight to the team inbox.'],
                ['We reply by email', 'With questions about the role, or a time to talk.'],
                ['We set up your pilot', 'One assessment, your candidates, your shortlist.'],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cs-accent/12 text-sm font-bold text-cs-accent-text">{i + 1}</span>
                  <div>
                    <p className="font-semibold text-cs-ink">{t}</p>
                    <p className="text-sm text-cs-ink-soft">{d}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-10 space-y-3 border-t border-cs-grid pt-6 text-[15px]">
              <p className="flex items-center gap-3 text-cs-ink">
                <Mail className="h-4 w-4 text-cs-accent-text" aria-hidden />
                <a href="mailto:support@codespectra.ai" className="hover:underline">support@codespectra.ai</a>
              </p>
              <p className="flex items-center gap-3 text-cs-ink">
                <MapPin className="h-4 w-4 text-cs-accent-text" aria-hidden />
                Hyderabad, India · Princeton, New Jersey
              </p>
            </div>

            {/* What a pilot ends in — sample report */}
            <DeviceShowcase variant="results" compact className="mt-10 hidden lg:block" />
          </div>

          {/* Right: form */}
          <div className="rounded-3xl border border-cs-grid bg-cs-sheet p-6 shadow-[0_8px_30px_-16px_rgba(15,23,41,0.18)] sm:p-9">
            {sent ? (
              <div role="status" className="flex min-h-[420px] flex-col items-start justify-center">
                <CheckCircle2 className="h-12 w-12 text-cs-accent-text" aria-hidden />
                <h2 className="cs-heading mt-5 text-4xl">Message sent</h2>
                <p className="mt-3 max-w-[42ch] text-cs-ink-soft">
                  Thanks, {form.name.split(' ')[0] || 'there'}. We’ll reply to <strong className="text-cs-ink">{form.email}</strong>.
                </p>
                <Link href="/features" className="mt-8 text-sm font-semibold text-cs-accent-text hover:underline">Explore features while you wait</Link>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="space-y-6">
                <fieldset>
                  <legend className="mb-3 text-[15px] font-semibold text-cs-ink">What can we help with?</legend>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {TOPICS.map((t) => (
                      <label
                        key={t.value}
                        className={cn(
                          'cursor-pointer rounded-xl border px-4 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cs-accent-text',
                          topic === t.value ? 'border-cs-accent bg-cs-accent/6 ring-1 ring-cs-accent' : 'border-cs-grid hover:border-cs-ink-soft',
                        )}
                      >
                        <input type="radio" name="topic" value={t.value} checked={topic === t.value} onChange={() => setTopic(t.value)} className="sr-only" />
                        <span className="block font-semibold text-cs-ink">{t.label}</span>
                        <span className="mt-0.5 block text-sm text-cs-ink-soft">{t.hint}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id="name" label="Your name" error={errors.name}>
                    <input id="name" value={form.name} onChange={set('name')} autoComplete="name" aria-invalid={!!errors.name} aria-describedby={errors.name ? 'name-err' : undefined} className={field} />
                  </Field>
                  <Field id="email" label="Work email" error={errors.email}>
                    <input id="email" type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="you@company.com" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-err' : undefined} className={field} />
                  </Field>
                  <Field id="organisation" label="Company or college" optional>
                    <input id="organisation" value={form.organisation} onChange={set('organisation')} autoComplete="organization" className={field} />
                  </Field>
                  <Field id="role" label="Your role" optional>
                    <input id="role" value={form.role} onChange={set('role')} autoComplete="organization-title" placeholder="e.g. Talent lead" className={field} />
                  </Field>
                </div>

                <Field id="message" label={topic === 'pilot' ? 'Which role are you hiring for?' : 'Message'} error={errors.message}>
                  <textarea
                    id="message"
                    rows={5}
                    value={form.message}
                    onChange={set('message')}
                    placeholder={topic === 'pilot' ? 'e.g. 3 design engineers, 1–3 years, about 120 applicants' : ''}
                    aria-invalid={!!errors.message}
                    aria-describedby={errors.message ? 'message-err' : undefined}
                    className={cn(field, 'h-auto py-3 leading-relaxed')}
                  />
                </Field>

                <TurnstileWidget onVerify={(t) => setTurnstileToken(t)} resetKey={turnstileResetKey} />

                {formError && (
                  <p role="alert" className="rounded-xl border-l-4 border-cs-flag bg-cs-flag/10 px-4 py-3 text-[15px] text-cs-ink">
                    {formError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={sending}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-cs-accent px-7 text-base font-semibold text-cs-accent-ink shadow-lg shadow-[#2f5be7]/25 transition-[filter] hover:brightness-110 disabled:opacity-60"
                >
                  {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {sending ? 'Sending…' : topic === 'pilot' ? 'Request a pilot' : 'Send message'}
                </button>
                <p className="text-sm text-cs-ink-soft">
                  We use your details only to reply. See our <Link href="/privacy" className="underline hover:text-cs-ink">Privacy Policy</Link>.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
    </PublicPageWrapper>
  )
}

function Field({ id, label, optional, error, children }: { id: string; label: string; optional?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[15px] font-medium text-cs-ink">
        {label}
        {optional && <span className="ml-1.5 font-normal text-cs-ink-soft">(optional)</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-err`} className="mt-1.5 text-sm font-medium text-cs-flag">
          {error}
        </p>
      )}
    </div>
  )
}

export default function ContactPage() {
  return (
    <Suspense fallback={null}>
      <ContactInner />
    </Suspense>
  )
}
