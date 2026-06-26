'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Settings as SettingsIcon,
  Save,
  Loader2,
  Building2,
  Sliders,
  Users,
  Mail,
  KeyRound,
  ExternalLink,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRoleGate } from '@/lib/use-role-gate'
import { useToast } from '@/lib/toast-context'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  ADMIN_NEW_USER_EMAIL_DELIVERIES,
  GENERAL_PLATFORM_DEFAULTS,
  type GeneralPlatformSettings,
} from '@/lib/platform-general-settings'
import {
  parsePlatformSettingsSection,
  platformSettingsHref,
  type PlatformSettingsSection,
} from '@/lib/platform-settings-nav'
import { isStripePriceId } from '@/lib/pricing-catalog'
import { PricingCatalogStripeHint } from '@/components/dashboard/pricing-catalog-stripe-hint'

type General = GeneralPlatformSettings
type GeneralKey = keyof General

const defaults: General = GENERAL_PLATFORM_DEFAULTS

const locales = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'de', label: 'Deutsch' },
]

const BRANDING_KEYS: GeneralKey[] = [
  'platform_name',
  'platform_tagline',
  'support_email',
  'support_link_url',
  'timezone',
  'default_locale',
]
const OPS_KEYS: GeneralKey[] = ['allow_registration', 'email_notifications', 'maintenance_mode']
const PRODUCT_KEYS: GeneralKey[] = ['require_email_verification', 'show_public_leaderboard']
const EMAIL_PROVISION_KEYS: GeneralKey[] = ['admin_new_user_email_delivery']

const DELIVERY_LABELS: Record<(typeof ADMIN_NEW_USER_EMAIL_DELIVERIES)[number], string> = {
  supabase_invite: 'Supabase invite email (recommended)',
  resend_recovery: 'Resend — password reset link',
  resend_magiclink: 'Resend — magic sign-in link',
  sendgrid_recovery: 'SendGrid — password reset link',
  sendgrid_magiclink: 'SendGrid — magic sign-in link',
}

type SecretsDraft = {
  stripe_secret_key: string
  stripe_webhook_secret: string
  stripe_price_pro_monthly: string
  stripe_price_pro_yearly: string
  stripe_price_enterprise_monthly: string
  stripe_price_enterprise_yearly: string
}

const emptySecretsDraft = (): SecretsDraft => ({
  stripe_secret_key: '',
  stripe_webhook_secret: '',
  stripe_price_pro_monthly: '',
  stripe_price_pro_yearly: '',
  stripe_price_enterprise_monthly: '',
  stripe_price_enterprise_yearly: '',
})

function SystemSettingsInner() {
  const gate = useRoleGate({ require: 'superadmin' })
  const searchParams = useSearchParams()
  const section: PlatformSettingsSection = parsePlatformSettingsSection(
    searchParams.get('section')
  )
  const addToast = useToast()
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<
    'branding' | 'ops' | 'product' | 'mail' | 'integrations' | null
  >(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState<General>(defaults)
  const [secretsMeta, setSecretsMeta] = useState<Record<string, unknown>>({})
  const [secretsDraft, setSecretsDraft] = useState<SecretsDraft>(() => emptySecretsDraft())
  const [mailSecretsDraft, setMailSecretsDraft] = useState({
    resend_api_key: '',
    resend_from_email: '',
    sendgrid_api_key: '',
    sendgrid_from_email: '',
  })

  useEffect(() => {
    if (!gate.ready) return
    const run = async () => {
      const [res, secRes] = await Promise.all([
        fetch('/api/admin/platform-settings', { credentials: 'include' }),
        fetch('/api/admin/server-secrets', { credentials: 'include' }),
      ])
      const json = await res.json().catch(() => ({}))
      const secJson = await secRes.json().catch(() => ({}))
      if (res.ok && json.settings) {
        setLoadError(null)
        setForm({ ...defaults, ...json.settings })
      } else if (!res.ok) {
        const msg =
          res.status === 401
            ? 'Your browser session was not sent to the API (common after switching to cookie-based auth). Sign out and sign in again once.'
            : (json.error as string) || `HTTP ${res.status}`
        setLoadError(msg)
        addToast({
          type: 'error',
          title: 'Could not load settings',
          message: msg,
        })
      }
      if (secRes.ok && secJson.secrets) {
        setSecretsMeta(secJson.secrets as Record<string, unknown>)
      }
      setLoading(false)
    }
    void run()
  }, [gate.ready, addToast])

  const reloadSecrets = useCallback(async () => {
    const secRes = await fetch('/api/admin/server-secrets', { credentials: 'include' })
    const secJson = await secRes.json().catch(() => ({}))
    if (secRes.ok && secJson.secrets) {
      setSecretsMeta(secJson.secrets as Record<string, unknown>)
    }
  }, [])

  useEffect(() => {
    if (loading) return
    setSecretsDraft((d) => ({
      ...d,
      stripe_price_pro_monthly: isStripePriceId(secretsMeta.stripe_price_pro_monthly)
        ? String(secretsMeta.stripe_price_pro_monthly).trim()
        : d.stripe_price_pro_monthly,
      stripe_price_pro_yearly: isStripePriceId(secretsMeta.stripe_price_pro_yearly)
        ? String(secretsMeta.stripe_price_pro_yearly).trim()
        : d.stripe_price_pro_yearly,
      stripe_price_enterprise_monthly: isStripePriceId(secretsMeta.stripe_price_enterprise_monthly)
        ? String(secretsMeta.stripe_price_enterprise_monthly).trim()
        : d.stripe_price_enterprise_monthly,
      stripe_price_enterprise_yearly: isStripePriceId(secretsMeta.stripe_price_enterprise_yearly)
        ? String(secretsMeta.stripe_price_enterprise_yearly).trim()
        : d.stripe_price_enterprise_yearly,
    }))
  }, [loading, secretsMeta])

  const saveKeys = useCallback(
    async (keys: GeneralKey[], section: 'branding' | 'ops' | 'product') => {
      setSavingKey(section)
      try {
        const body: Record<string, unknown> = {}
        for (const k of keys) {
          body[k] = form[k]
        }
        const res = await fetch('/api/admin/platform-settings', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          const msg =
            res.status === 401
              ? 'Unauthorized — sign out and sign in again so the API receives your session cookie.'
              : (json.error as string) || 'Save failed'
          setLoadError(msg)
          throw new Error(msg)
        }
        setLoadError(null)
        setForm({ ...defaults, ...json.settings })
        addToast({ type: 'success', title: 'Section saved' })
      } catch (e) {
        addToast({
          type: 'error',
          title: 'Save failed',
          message: e instanceof Error ? e.message : 'Unknown error',
        })
      } finally {
        setSavingKey(null)
      }
    },
    [addToast, form]
  )

  const saveSecrets = useCallback(async () => {
    setSavingKey('integrations')
    try {
      const body: Record<string, string> = {}
      const priceKeys = [
        'stripe_price_pro_monthly',
        'stripe_price_pro_yearly',
        'stripe_price_enterprise_monthly',
        'stripe_price_enterprise_yearly',
      ] as const
      for (const [k, v] of Object.entries(secretsDraft)) {
        const t = String(v).trim()
        if (!t) continue
        if (priceKeys.includes(k as (typeof priceKeys)[number]) && !isStripePriceId(t)) {
          addToast({
            type: 'error',
            title: 'Invalid Stripe price ID',
            message: `${k} must be a Stripe Dashboard price id (price_…), not a dollar amount.`,
          })
          setSavingKey(null)
          return
        }
        body[k] = t
      }
      if (Object.keys(body).length === 0) {
        addToast({ type: 'error', title: 'Nothing to save', message: 'Enter at least one value to update.' })
        setSavingKey(null)
        return
      }
      const res = await fetch('/api/admin/server-secrets', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json.error as string) || 'Save failed')
      setSecretsDraft(emptySecretsDraft())
      await reloadSecrets()
      addToast({ type: 'success', title: 'Stripe & billing saved' })
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Save failed',
        message: e instanceof Error ? e.message : 'Unknown error',
      })
    } finally {
      setSavingKey(null)
    }
  }, [addToast, reloadSecrets, secretsDraft])

  const saveInvitationsAndOptionalMailSecrets = useCallback(async () => {
    setSavingKey('mail')
    try {
      const body: Record<string, unknown> = { admin_new_user_email_delivery: form.admin_new_user_email_delivery }
      const res = await fetch('/api/admin/platform-settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          res.status === 401
            ? 'Unauthorized — sign out and sign in again so the API receives your session cookie.'
            : (json.error as string) || 'Save failed'
        throw new Error(msg)
      }
      setForm({ ...defaults, ...json.settings })

      const secBody: Record<string, string> = {}
      if (mailSecretsDraft.resend_api_key.trim()) secBody.resend_api_key = mailSecretsDraft.resend_api_key.trim()
      if (mailSecretsDraft.resend_from_email.trim())
        secBody.resend_from_email = mailSecretsDraft.resend_from_email.trim()
      if (mailSecretsDraft.sendgrid_api_key.trim())
        secBody.sendgrid_api_key = mailSecretsDraft.sendgrid_api_key.trim()
      if (mailSecretsDraft.sendgrid_from_email.trim())
        secBody.sendgrid_from_email = mailSecretsDraft.sendgrid_from_email.trim()
      if (Object.keys(secBody).length > 0) {
        const sres = await fetch('/api/admin/server-secrets', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(secBody),
        })
        const sjson = await sres.json().catch(() => ({}))
        if (!sres.ok) throw new Error((sjson.error as string) || 'Secrets save failed')
        setMailSecretsDraft({
          resend_api_key: '',
          resend_from_email: '',
          sendgrid_api_key: '',
          sendgrid_from_email: '',
        })
        await reloadSecrets()
      }

      addToast({ type: 'success', title: 'Mail & invitations saved' })
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Save failed',
        message: e instanceof Error ? e.message : 'Unknown error',
      })
    } finally {
      setSavingKey(null)
    }
  }, [addToast, form.admin_new_user_email_delivery, mailSecretsDraft, reloadSecrets])

  // While the role gate is still resolving, render NOTHING — prevents the
  // half-mounted form (and its outbound /api/admin/* fetches) from racing
  // with an in-flight redirect for non-superadmin users.
  if (!gate.ready) return null

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading settings…
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <SettingsIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Platform settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the sidebar under <strong>Platform settings</strong> to switch sections.{' '}
              <strong>Mail & email APIs</strong> configures invitations plus Resend/SendGrid keys (always visible
              there). <strong>Stripe & billing</strong> holds the Stripe API secret and webhook
              signing secret. <strong>Stripe price IDs</strong> for dashboard checkout are edited under{' '}
              <Link href="/dashboard/admin/pricing" className="font-medium text-primary underline-offset-4 hover:underline">
                Pricing management
              </Link>{' '}
              (same database values; no duplicate form). Host <code className="rounded bg-muted px-1 text-xs">.env</code>{' '}
              variables override stored secrets when set (see project <code className="rounded bg-muted px-1 text-xs">.env.example</code>
              ).
            </p>
          </div>
        </div>
      </div>

      {loadError ? (
        <Alert variant="destructive" className="border-destructive/40">
          <AlertTitle>Could not load saved settings</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="min-w-0 space-y-6">
          {section === 'branding' ? (
            <Alert className="rounded-xl border-border/60 bg-muted/30">
              <Building2 className="h-4 w-4" />
              <AlertTitle>How this is stored</AlertTitle>
              <AlertDescription className="text-muted-foreground">
                General settings use the <code className="rounded bg-muted px-1 text-xs">general</code> row in{' '}
                <code className="rounded bg-muted px-1 text-xs">platform_settings</code>. Requires a superadmin
                session and a server Supabase key.
              </AlertDescription>
            </Alert>
          ) : null}

          {section === 'branding' ? (
        <Card className="rounded-xl border-border/60 shadow-sm">
          <div className="border-b border-border/60 px-6 py-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Branding & support</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Name, support contacts, timezone, and default locale.</p>
          </div>
          <div className="space-y-4 px-6 py-5">
            <div>
              <Label htmlFor="platform_name">Platform name</Label>
              <Input
                id="platform_name"
                value={form.platform_name}
                onChange={(e) => setForm((f) => ({ ...f, platform_name: e.target.value }))}
                className="mt-1.5 h-10 rounded-lg border-border/60 bg-background"
              />
            </div>
            <div>
              <Label htmlFor="platform_tagline">Tagline (optional)</Label>
              <Input
                id="platform_tagline"
                value={form.platform_tagline}
                onChange={(e) => setForm((f) => ({ ...f, platform_tagline: e.target.value }))}
                className="mt-1.5 h-10 rounded-lg border-border/60 bg-background"
                placeholder="Ship quality software with confidence"
              />
            </div>
            <div>
              <Label htmlFor="support_email">Support email</Label>
              <Input
                id="support_email"
                type="email"
                value={form.support_email}
                onChange={(e) => setForm((f) => ({ ...f, support_email: e.target.value }))}
                className="mt-1.5 h-10 rounded-lg border-border/60 bg-background"
              />
            </div>
            <div>
              <Label htmlFor="support_link_url">Help center or status URL (optional)</Label>
              <Input
                id="support_link_url"
                type="url"
                value={form.support_link_url}
                onChange={(e) => setForm((f) => ({ ...f, support_link_url: e.target.value }))}
                className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm"
                placeholder="https://status.example.com"
              />
            </div>
            <div>
              <Label htmlFor="timezone">Default timezone</Label>
              <Input
                id="timezone"
                value={form.timezone}
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm"
                placeholder="UTC"
              />
            </div>
            <div>
              <Label htmlFor="default_locale">Default language</Label>
              <Select
                value={form.default_locale}
                onValueChange={(v) => setForm((f) => ({ ...f, default_locale: v }))}
              >
                <SelectTrigger id="default_locale" className="mt-1.5 h-10 w-full rounded-lg border-border/60">
                  <SelectValue placeholder="Select locale" />
                </SelectTrigger>
                <SelectContent>
                  {locales.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end border-t border-border/60 bg-muted/20 px-6 py-4">
            <Button
              className="gap-2 rounded-lg"
              onClick={() => void saveKeys(BRANDING_KEYS, 'branding')}
              disabled={savingKey !== null}
            >
              {savingKey === 'branding' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save branding
            </Button>
          </div>
        </Card>
          ) : null}

          {section === 'mail' ? (
        <Card className="rounded-xl border-border/60 shadow-sm">
          <div className="border-b border-border/60 px-6 py-4">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Mail &amp; email APIs</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              When a superadmin adds a user <strong>without</strong> typing a password, choose how they receive access.
              Resend and SendGrid keys below are always available to configure (saved to server secrets); they are used
              when you pick a Resend/SendGrid delivery method, and can be used by other app emails.{' '}
              <strong>SMTP for Supabase Auth</strong> is configured in the Supabase dashboard, not here.
            </p>
          </div>
          <div className="space-y-4 px-6 py-5">
            <div>
              <Label htmlFor="admin_new_user_email_delivery">Delivery method</Label>
              <Select
                value={form.admin_new_user_email_delivery}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    admin_new_user_email_delivery: v as General['admin_new_user_email_delivery'],
                  }))
                }
              >
                <SelectTrigger
                  id="admin_new_user_email_delivery"
                  className="mt-1.5 h-10 w-full rounded-lg border-border/60"
                >
                  <SelectValue placeholder="Select delivery" />
                </SelectTrigger>
                <SelectContent>
                  {ADMIN_NEW_USER_EMAIL_DELIVERIES.map((id) => (
                    <SelectItem key={id} value={id}>
                      {DELIVERY_LABELS[id]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                <strong>Supabase invite</strong> uses your project&apos;s Auth email (configure SMTP under Supabase →
                Authentication → Emails). <strong>Resend / SendGrid</strong> send links from this app. Optional: set{' '}
                <code className="rounded bg-muted px-1 text-xs">RESEND_API_KEY</code>,{' '}
                <code className="rounded bg-muted px-1 text-xs">SENDGRID_API_KEY</code>, etc. in the host environment —
                they override secrets saved here.
              </p>
            </div>

            <Alert className="rounded-lg border-border/60 bg-muted/20">
              <AlertTitle className="text-sm">SMTP &amp; Auth templates (Supabase)</AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                Custom SMTP and invite templates are not stored in CodeSpectra. Configure them in the Supabase project:{' '}
                <Link
                  href="https://supabase.com/docs/guides/auth/auth-smtp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                >
                  Auth SMTP <ExternalLink className="h-3 w-3" />
                </Link>
                ,{' '}
                <Link
                  href="https://supabase.com/dashboard/project/_/auth/templates"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                >
                  email templates <ExternalLink className="h-3 w-3" />
                </Link>
                . Set <code className="rounded bg-muted px-1 text-xs">NEXT_PUBLIC_APP_URL</code> for correct invite
                redirects.
              </AlertDescription>
            </Alert>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/15 p-4">
                <p className="text-sm font-medium text-foreground">Resend</p>
                <p className="text-xs text-muted-foreground">
                  API key and default from address. Leave key blank to keep the current stored key.
                </p>
                {secretsMeta.has_resend_api_key ? (
                  <p className="font-mono text-xs text-muted-foreground">
                    Current key: {String(secretsMeta.resend_api_key_masked ?? '—')}
                  </p>
                ) : null}
                <div>
                  <Label htmlFor="mail_resend_key">Resend API key</Label>
                  <Input
                    id="mail_resend_key"
                    type="password"
                    autoComplete="off"
                    placeholder="re_…"
                    value={mailSecretsDraft.resend_api_key}
                    onChange={(e) =>
                      setMailSecretsDraft((d) => ({ ...d, resend_api_key: e.target.value }))
                    }
                    className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="mail_resend_from">From address</Label>
                  <Input
                    id="mail_resend_from"
                    type="text"
                    placeholder={String(secretsMeta.resend_from_email || 'App <onboarding@resend.dev>')}
                    value={mailSecretsDraft.resend_from_email}
                    onChange={(e) =>
                      setMailSecretsDraft((d) => ({ ...d, resend_from_email: e.target.value }))
                    }
                    className="mt-1.5 h-10 rounded-lg border-border/60 bg-background text-sm"
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/15 p-4">
                <p className="text-sm font-medium text-foreground">SendGrid</p>
                <p className="text-xs text-muted-foreground">
                  API key and verified sender email. Leave key blank to keep the current stored key.
                </p>
                {secretsMeta.has_sendgrid_api_key ? (
                  <p className="font-mono text-xs text-muted-foreground">
                    Current key: {String(secretsMeta.sendgrid_api_key_masked ?? '—')}
                  </p>
                ) : null}
                <div>
                  <Label htmlFor="mail_sg_key">SendGrid API key</Label>
                  <Input
                    id="mail_sg_key"
                    type="password"
                    autoComplete="off"
                    value={mailSecretsDraft.sendgrid_api_key}
                    onChange={(e) =>
                      setMailSecretsDraft((d) => ({ ...d, sendgrid_api_key: e.target.value }))
                    }
                    className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="mail_sg_from">From email (verified sender)</Label>
                  <Input
                    id="mail_sg_from"
                    type="email"
                    placeholder={String(secretsMeta.sendgrid_from_email || 'noreply@yourdomain.com')}
                    value={mailSecretsDraft.sendgrid_from_email}
                    onChange={(e) =>
                      setMailSecretsDraft((d) => ({ ...d, sendgrid_from_email: e.target.value }))
                    }
                    className="mt-1.5 h-10 rounded-lg border-border/60 bg-background text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end border-t border-border/60 bg-muted/20 px-6 py-4">
            <Button
              className="gap-2 rounded-lg"
              onClick={() => void saveInvitationsAndOptionalMailSecrets()}
              disabled={savingKey !== null}
            >
              {savingKey === 'mail' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save mail &amp; API keys
            </Button>
          </div>
        </Card>
          ) : null}

          {section === 'ops' ? (
        <Card className="rounded-xl border-border/60 shadow-sm">
          <div className="border-b border-border/60 px-6 py-4">
            <div className="flex items-center gap-2">
              <Sliders className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Operations</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Registrations, email, and maintenance.</p>
          </div>
          <div className="space-y-0 divide-y divide-border/60 px-6 py-2">
            <div className="flex items-center justify-between gap-4 py-4">
              <div className="space-y-0.5">
                <Label htmlFor="allow_registration" className="text-foreground">
                  Allow registrations
                </Label>
                <p className="text-sm text-muted-foreground">New users can create accounts</p>
              </div>
              <Switch
                id="allow_registration"
                checked={form.allow_registration}
                onCheckedChange={(v) => setForm((f) => ({ ...f, allow_registration: v }))}
              />
            </div>
            <div className="flex items-center justify-between gap-4 py-4">
              <div className="space-y-0.5">
                <Label htmlFor="email_notifications" className="text-foreground">
                  Platform email notifications
                </Label>
                <p className="text-sm text-muted-foreground">System-level emails (when mail is configured)</p>
              </div>
              <Switch
                id="email_notifications"
                checked={form.email_notifications}
                onCheckedChange={(v) => setForm((f) => ({ ...f, email_notifications: v }))}
              />
            </div>
            <div className="flex items-center justify-between gap-4 py-4">
              <div className="space-y-0.5">
                <Label htmlFor="maintenance_mode" className="text-foreground">
                  Maintenance mode
                </Label>
                <p className="text-sm text-muted-foreground">Surface a maintenance state to clients (wire in UI)</p>
              </div>
              <Switch
                id="maintenance_mode"
                checked={form.maintenance_mode}
                onCheckedChange={(v) => setForm((f) => ({ ...f, maintenance_mode: v }))}
              />
            </div>
          </div>
          <div className="flex justify-end border-t border-border/60 bg-muted/20 px-6 py-4">
            <Button
              className="gap-2 rounded-lg"
              onClick={() => void saveKeys(OPS_KEYS, 'ops')}
              disabled={savingKey !== null}
            >
              {savingKey === 'ops' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save operations
            </Button>
          </div>
        </Card>
          ) : null}

          {section === 'product' ? (
        <Card className="rounded-xl border-border/60 shadow-sm">
          <div className="border-b border-border/60 px-6 py-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Product & access</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign-up flows, leaderboard visibility, and verification. Enforce in API routes and UI where relevant.
            </p>
          </div>
          <div className="grid gap-0 divide-y divide-border/60 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <div className="flex items-center justify-between gap-4 p-6">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="require_email_verification" className="text-foreground">
                  Require email verification
                </Label>
                <p className="text-sm text-muted-foreground">Before full access (when auth hooks enforce it)</p>
              </div>
              <Switch
                id="require_email_verification"
                checked={form.require_email_verification}
                onCheckedChange={(v) => setForm((f) => ({ ...f, require_email_verification: v }))}
              />
            </div>
            <div className="flex items-center justify-between gap-4 p-6">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="show_public_leaderboard" className="text-foreground">
                  Public leaderboard
                </Label>
                <p className="text-sm text-muted-foreground">Show org-wide rankings to signed-in users</p>
              </div>
              <Switch
                id="show_public_leaderboard"
                checked={form.show_public_leaderboard}
                onCheckedChange={(v) => setForm((f) => ({ ...f, show_public_leaderboard: v }))}
              />
            </div>
          </div>
          <div className="flex justify-end border-t border-border/60 bg-muted/20 px-6 py-4">
            <Button
              className="gap-2 rounded-lg"
              onClick={() => void saveKeys(PRODUCT_KEYS, 'product')}
              disabled={savingKey !== null}
            >
              {savingKey === 'product' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save product & access
            </Button>
          </div>
        </Card>
          ) : null}

          {section === 'integrations' ? (
            <Card className="rounded-xl border-border/60 shadow-sm">
              <div className="border-b border-border/60 px-6 py-4">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Payments & integrations</h3>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Configure <strong>Razorpay</strong> credentials below. Keys are stored encrypted at
                  rest in MongoDB and read by every payment endpoint — no redeploy required.
                  Resend / SendGrid lives in{' '}
                  <Link href={platformSettingsHref('mail')} className="font-medium text-primary underline-offset-4 hover:underline">
                    Mail & email APIs
                  </Link>
                  .
                </p>
              </div>
              <div className="space-y-6 px-6 py-5">

                {/* Razorpay — primary payment gateway */}
                <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4" data-testid="rzp-section">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Razorpay (primary)</p>
                    {secretsMeta.has_razorpay_key_id && secretsMeta.has_razorpay_key_secret ? (
                      <span className="rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                        ✓ Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/15 text-amber-300 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                        Not configured
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Get test keys at{' '}
                    <Link
                      href="https://dashboard.razorpay.com/app/keys"
                      target="_blank"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      Razorpay Dashboard → Settings → API Keys
                    </Link>
                    . Use <code className="rounded bg-muted px-1">rzp_test_…</code> for development.
                  </p>
                  <div>
                    <Label htmlFor="sec_rzp_id">Key ID</Label>
                    {secretsMeta.has_razorpay_key_id ? (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        Current: {String(secretsMeta.razorpay_key_id_masked ?? '—')}
                      </p>
                    ) : null}
                    <Input
                      id="sec_rzp_id"
                      autoComplete="off"
                      value={secretsDraft.razorpay_key_id}
                      onChange={(e) =>
                        setSecretsDraft((d) => ({ ...d, razorpay_key_id: e.target.value }))
                      }
                      className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm"
                      placeholder="rzp_test_xxxxxxxxxxxx"
                      data-testid="rzp-key-id-input"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sec_rzp_sk">Key secret</Label>
                    {secretsMeta.has_razorpay_key_secret ? (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        Current: {String(secretsMeta.razorpay_key_secret_masked ?? '—')}
                      </p>
                    ) : null}
                    <Input
                      id="sec_rzp_sk"
                      type="password"
                      autoComplete="off"
                      value={secretsDraft.razorpay_key_secret}
                      onChange={(e) =>
                        setSecretsDraft((d) => ({ ...d, razorpay_key_secret: e.target.value }))
                      }
                      className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm"
                      placeholder="••••••••••••••••••••"
                      data-testid="rzp-key-secret-input"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sec_rzp_wh">Webhook signing secret (optional)</Label>
                    {secretsMeta.has_razorpay_webhook_secret ? (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        Current: {String(secretsMeta.razorpay_webhook_secret_masked ?? '—')}
                      </p>
                    ) : null}
                    <Input
                      id="sec_rzp_wh"
                      type="password"
                      autoComplete="off"
                      value={secretsDraft.razorpay_webhook_secret}
                      onChange={(e) =>
                        setSecretsDraft((d) => ({ ...d, razorpay_webhook_secret: e.target.value }))
                      }
                      className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm"
                      placeholder="paste from Razorpay → Webhooks page"
                      data-testid="rzp-webhook-input"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Webhook URL to register in Razorpay:{' '}
                    <code className="rounded bg-muted px-1">
                      {typeof window !== 'undefined'
                        ? `${window.location.origin}/api/billing/webhook`
                        : '<your-domain>/api/billing/webhook'}
                    </code>
                  </p>
                </div>

                <Alert className="rounded-lg border-border/60 bg-muted/20">
                  <Mail className="h-4 w-4" />
                  <AlertTitle className="text-sm">Transactional email (Resend / SendGrid)</AlertTitle>
                  <AlertDescription className="text-xs text-muted-foreground">
                    Configure delivery method and API keys in{' '}
                    <Link
                      href={platformSettingsHref('mail')}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Mail & invitations
                    </Link>
                    . This avoids duplicate fields and keeps invite mail settings in one place.
                  </AlertDescription>
                </Alert>

                <div className="space-y-3 opacity-70">
                  <p className="text-sm font-medium text-foreground">Stripe (legacy)</p>
                  <p className="text-xs text-muted-foreground">
                    Kept for historical webhooks only. Razorpay is the active gateway.
                  </p>
                  {secretsMeta.has_stripe_secret_key ? (
                    <p className="font-mono text-xs text-muted-foreground">
                      Secret key: {String(secretsMeta.stripe_secret_key_masked ?? '—')}
                    </p>
                  ) : null}
                  <div>
                    <Label htmlFor="sec_stripe_sk">Stripe secret key</Label>
                    <Input
                      id="sec_stripe_sk"
                      type="password"
                      autoComplete="off"
                      value={secretsDraft.stripe_secret_key}
                      onChange={(e) =>
                        setSecretsDraft((d) => ({ ...d, stripe_secret_key: e.target.value }))
                      }
                      className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm"
                      placeholder="sk_live_… or sk_test_…"
                    />
                  </div>
                  {secretsMeta.has_stripe_webhook_secret ? (
                    <p className="font-mono text-xs text-muted-foreground">
                      Webhook secret: {String(secretsMeta.stripe_webhook_secret_masked ?? '—')}
                    </p>
                  ) : null}
                  <div>
                    <Label htmlFor="sec_stripe_wh">Stripe webhook signing secret</Label>
                    <Input
                      id="sec_stripe_wh"
                      type="password"
                      autoComplete="off"
                      value={secretsDraft.stripe_webhook_secret}
                      onChange={(e) =>
                        setSecretsDraft((d) => ({ ...d, stripe_webhook_secret: e.target.value }))
                      }
                      className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm"
                      placeholder="whsec_…"
                    />
                  </div>
                </div>

                <div className="space-y-4 border-t border-border/40 pt-6">
                  <p className="text-sm font-medium text-foreground">Stripe Checkout price IDs</p>
                  <p className="text-xs text-muted-foreground">
                    Paste the <code className="rounded bg-muted px-1">price_…</code> id for each plan/interval from the
                    Stripe Dashboard (or run <code className="rounded bg-muted px-1">npm run stripe:bootstrap</code>).
                    Host env <code className="rounded bg-muted px-1">STRIPE_PRICE_*</code> overrides these when set.
                  </p>
                  <PricingCatalogStripeHint />
                  {(String(secretsMeta.stripe_price_pro_monthly ?? '').trim() &&
                    !isStripePriceId(secretsMeta.stripe_price_pro_monthly)) ||
                  (String(secretsMeta.stripe_price_pro_yearly ?? '').trim() &&
                    !isStripePriceId(secretsMeta.stripe_price_pro_yearly)) ||
                  (String(secretsMeta.stripe_price_enterprise_monthly ?? '').trim() &&
                    !isStripePriceId(secretsMeta.stripe_price_enterprise_monthly)) ||
                  (String(secretsMeta.stripe_price_enterprise_yearly ?? '').trim() &&
                    !isStripePriceId(secretsMeta.stripe_price_enterprise_yearly)) ? (
                    <Alert variant="destructive" className="border-destructive/40">
                      <AlertTitle className="text-sm">Invalid stored price IDs</AlertTitle>
                      <AlertDescription className="text-xs">
                        Replace non-Stripe values below with real <code className="rounded bg-muted px-1">price_…</code>{' '}
                        IDs and save.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="sec_price_pro_m">Pro — monthly</Label>
                      <Input
                        id="sec_price_pro_m"
                        value={secretsDraft.stripe_price_pro_monthly}
                        onChange={(e) =>
                          setSecretsDraft((d) => ({ ...d, stripe_price_pro_monthly: e.target.value }))
                        }
                        placeholder="price_xxxxxxxxxxxxxxxx"
                        spellCheck={false}
                        className="mt-1.5 font-mono text-xs"
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Stored:{' '}
                        {isStripePriceId(secretsMeta.stripe_price_pro_monthly) ? (
                          <span className="font-mono text-foreground">
                            {String(secretsMeta.stripe_price_pro_monthly).trim()}
                          </span>
                        ) : String(secretsMeta.stripe_price_pro_monthly ?? '').trim() ? (
                          <span className="text-destructive">invalid</span>
                        ) : (
                          '—'
                        )}
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="sec_price_pro_y">Pro — yearly</Label>
                      <Input
                        id="sec_price_pro_y"
                        value={secretsDraft.stripe_price_pro_yearly}
                        onChange={(e) =>
                          setSecretsDraft((d) => ({ ...d, stripe_price_pro_yearly: e.target.value }))
                        }
                        placeholder="price_xxxxxxxxxxxxxxxx"
                        spellCheck={false}
                        className="mt-1.5 font-mono text-xs"
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Stored:{' '}
                        {isStripePriceId(secretsMeta.stripe_price_pro_yearly) ? (
                          <span className="font-mono text-foreground">
                            {String(secretsMeta.stripe_price_pro_yearly).trim()}
                          </span>
                        ) : String(secretsMeta.stripe_price_pro_yearly ?? '').trim() ? (
                          <span className="text-destructive">invalid</span>
                        ) : (
                          '—'
                        )}
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="sec_price_ent_m">Enterprise — monthly</Label>
                      <Input
                        id="sec_price_ent_m"
                        value={secretsDraft.stripe_price_enterprise_monthly}
                        onChange={(e) =>
                          setSecretsDraft((d) => ({
                            ...d,
                            stripe_price_enterprise_monthly: e.target.value,
                          }))
                        }
                        placeholder="price_xxxxxxxxxxxxxxxx"
                        spellCheck={false}
                        className="mt-1.5 font-mono text-xs"
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Stored:{' '}
                        {isStripePriceId(secretsMeta.stripe_price_enterprise_monthly) ? (
                          <span className="font-mono text-foreground">
                            {String(secretsMeta.stripe_price_enterprise_monthly).trim()}
                          </span>
                        ) : String(secretsMeta.stripe_price_enterprise_monthly ?? '').trim() ? (
                          <span className="text-destructive">invalid</span>
                        ) : (
                          '—'
                        )}
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="sec_price_ent_y">Enterprise — yearly</Label>
                      <Input
                        id="sec_price_ent_y"
                        value={secretsDraft.stripe_price_enterprise_yearly}
                        onChange={(e) =>
                          setSecretsDraft((d) => ({
                            ...d,
                            stripe_price_enterprise_yearly: e.target.value,
                          }))
                        }
                        placeholder="price_xxxxxxxxxxxxxxxx"
                        spellCheck={false}
                        className="mt-1.5 font-mono text-xs"
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Stored:{' '}
                        {isStripePriceId(secretsMeta.stripe_price_enterprise_yearly) ? (
                          <span className="font-mono text-foreground">
                            {String(secretsMeta.stripe_price_enterprise_yearly).trim()}
                          </span>
                        ) : String(secretsMeta.stripe_price_enterprise_yearly ?? '').trim() ? (
                          <span className="text-destructive">invalid</span>
                        ) : (
                          '—'
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end border-t border-border/60 bg-muted/20 px-6 py-4">
                <Button
                  className="gap-2 rounded-lg"
                  onClick={() => void saveSecrets()}
                  disabled={savingKey !== null}
                >
                  {savingKey === 'integrations' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Stripe & billing
                </Button>
              </div>
            </Card>
          ) : null}
      </div>
    </div>
  )
}

export default function SystemSettings() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading settings…
        </div>
      }
    >
      <SystemSettingsInner />
    </Suspense>
  )
}
