'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Mail, MapPin } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { csrfFetch } from '@/lib/csrf-fetch'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'
import { cn } from '@/lib/utils'
import { DeviceShowcase } from '@/components/visuals'
import { Illustration } from '@/components/illustrations/spot'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import { useLocalizedHref } from '@/components/i18n/public-language'

// Labels: publicPages.contactTopic<Value> / contactTopic<Value>Hint.
const TOPICS = [
  { value: 'pilot', label: 'publicPages.contactTopicPilot', hint: 'publicPages.contactTopicPilotHint' },
  { value: 'sales', label: 'publicPages.contactTopicSales', hint: 'publicPages.contactTopicSalesHint' },
  { value: 'support', label: 'publicPages.contactTopicSupport', hint: 'publicPages.contactTopicSupportHint' },
  { value: 'other', label: 'publicPages.contactTopicOther', hint: 'publicPages.contactTopicOtherHint' },
] as const

type Topic = (typeof TOPICS)[number]['value']

const field =
  'h-12 w-full rounded-xl border border-cs-grid bg-cs-sheet px-4 text-base text-cs-ink placeholder:text-cs-ink-soft/70 transition-colors hover:border-cs-ink-soft focus:border-cs-accent focus:outline-none aria-invalid:border-cs-flag'

function ContactInner() {
  const { t, rich } = useT()
  const apiError = useApiError()
  const lp = useLocalizedHref()
  const params = useSearchParams()
  const initial = (TOPICS.find((x) => x.value === params.get('topic'))?.value ?? 'pilot') as Topic
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
    if (!form.name.trim()) local.name = t('publicPages.contactErrName')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) local.email = t('publicPages.contactErrEmail')
    if (form.message.trim().length < 10) local.message = t('publicPages.contactErrMessage')
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
        setFormError(apiError(data, t('publicPages.contactErrSend')))
        setTurnstileToken(null)
        setTurnstileResetKey((k) => k + 1)
        return
      }
      setSent(true)
    } catch {
      setFormError(t('publicPages.contactErrOffline'))
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
            <h1 className="cs-display max-w-[14ch] text-5xl sm:text-6xl">{t('publicPages.contactTitle')}</h1>
            <p className="mt-6 max-w-[48ch] text-lg leading-relaxed text-cs-ink-soft">{t('publicPages.contactLead')}</p>

            <ol className="mt-10 space-y-5">
              {[
                [t('publicPages.contactStep1'), t('publicPages.contactStep1Body')],
                [t('publicPages.contactStep2'), t('publicPages.contactStep2Body')],
                [t('publicPages.contactStep3'), t('publicPages.contactStep3Body')],
              ].map(([title, d], i) => (
                <li key={title} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cs-accent/12 text-sm font-bold text-cs-accent-text">{i + 1}</span>
                  <div>
                    <p className="font-semibold text-cs-ink">{title}</p>
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
                {t('publicPages.offices')}
              </p>
            </div>

            {/* What a pilot ends in — sample report */}
            <DeviceShowcase variant="results" compact className="mt-10 hidden lg:block" />
          </div>

          {/* Right: form */}
          <div className="rounded-3xl border border-cs-grid bg-cs-sheet p-6 shadow-[0_8px_30px_-16px_rgba(15,23,41,0.18)] sm:p-9">
            {sent ? (
              <div role="status" className="flex min-h-[420px] flex-col items-start justify-center">
                <Illustration name="success" className="w-40 sm:w-48" />
                <h2 className="cs-heading mt-5 text-4xl">{t('publicPages.contactSent')}</h2>
                <p className="mt-3 max-w-[42ch] text-cs-ink-soft">
                  {rich('publicPages.contactSentBody', { email: <strong className="text-cs-ink">{form.email}</strong> }, { name: form.name.split(' ')[0] || t('publicPages.contactThere') })}
                </p>
                <Link href={lp('/features')} className="mt-8 text-sm font-semibold text-cs-accent-text hover:underline">{t('publicPages.contactExplore')}</Link>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="space-y-6">
                <fieldset>
                  <legend className="mb-3 text-[15px] font-semibold text-cs-ink">{t('publicPages.contactHelpWith')}</legend>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {TOPICS.map((x) => (
                      <label
                        key={x.value}
                        className={cn(
                          'cursor-pointer rounded-xl border px-4 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cs-accent-text',
                          topic === x.value ? 'border-cs-accent bg-cs-accent/6 ring-1 ring-cs-accent' : 'border-cs-grid hover:border-cs-ink-soft',
                        )}
                      >
                        <input type="radio" name="topic" value={x.value} checked={topic === x.value} onChange={() => setTopic(x.value)} className="sr-only" />
                        <span className="block font-semibold text-cs-ink">{t(x.label)}</span>
                        <span className="mt-0.5 block text-sm text-cs-ink-soft">{t(x.hint)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id="name" label={t('publicPages.contactName')} error={errors.name}>
                    <input id="name" value={form.name} onChange={set('name')} autoComplete="name" aria-invalid={!!errors.name} aria-describedby={errors.name ? 'name-err' : undefined} className={field} />
                  </Field>
                  <Field id="email" label={t('publicPages.contactEmail')} error={errors.email}>
                    <input id="email" type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="you@company.com" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-err' : undefined} className={field} />
                  </Field>
                  <Field id="organisation" label={t('publicPages.contactOrg')} optional>
                    <input id="organisation" value={form.organisation} onChange={set('organisation')} autoComplete="organization" className={field} />
                  </Field>
                  <Field id="role" label={t('publicPages.contactRole')} optional>
                    <input id="role" value={form.role} onChange={set('role')} autoComplete="organization-title" placeholder={t('publicPages.contactRolePlaceholder')} className={field} />
                  </Field>
                </div>

                <Field id="message" label={topic === 'pilot' ? t('publicPages.contactPilotRole') : t('publicPages.contactMessage')} error={errors.message}>
                  <textarea
                    id="message"
                    rows={5}
                    value={form.message}
                    onChange={set('message')}
                    placeholder={topic === 'pilot' ? t('publicPages.contactPilotPlaceholder') : ''}
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
                  {sending ? t('publicPages.contactSending') : topic === 'pilot' ? t('publicPages.contactRequestPilot') : t('publicPages.contactSend')}
                </button>
                <p className="text-sm text-cs-ink-soft">
                  {rich('publicPages.contactPrivacy', { link: <Link href={lp('/privacy')} className="underline hover:text-cs-ink">{t('publicPages.privacyPolicy')}</Link> })}
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
  const { t } = useT()
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[15px] font-medium text-cs-ink">
        {label}
        {optional && <span className="ml-1.5 font-normal text-cs-ink-soft">{t('common.optionalParen')}</span>}
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
