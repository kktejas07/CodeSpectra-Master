'use client'
import { AiAnalyticsDashboard } from "./AiAnalyticsDashboard"

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
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
  Flame,
  Eye,
  EyeOff,
  CreditCard,
  FileText,
  Sparkles,
  Key,
  ClipboardList,
  NotebookText,
  FileCheck,
  Users as UsersIcon,
  ShieldCheck,
  Hand,
  FileSearch,
  Zap,
  CheckCircle2,
  XCircle,
  ScrollText,
  Trophy,
  Video,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePageGuard } from '@/lib/use-page-guard'
import { CloudflareSettingsSection } from '@/components/dashboard/settings/cloudflare-section'
import { RedisSettingsSection } from '@/components/dashboard/settings/redis-section'
import { WhatsAppSettingsSection } from '@/components/dashboard/settings/whatsapp-section'
import KycSettingsSection from '@/app/dashboard/admin/settings/kyc/page'
import { useToast } from '@/lib/toast-context'
import GitHubConnectButton from '@/components/integrations/github-connect-button'
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
import { emailTemplates, hackathonEmailTemplates } from '@/lib/email-templates'
import { csrfFetch } from '@/lib/csrf-fetch'
import {
  CertificateRenderer,
  TEMPLATES,
  type CertificateData,
  type TemplateKey,
} from '@/components/cert/CertificateTemplates'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

const CERT_PREVIEW_DATA: CertificateData = {
  candidateName: 'Alex Johnson',
  certificationTitle: 'Full-Stack Web Development',
  level: 'Advanced',
  source: 'CodeSpectra Open Curriculum',
  score: 92,
  issuedAt: new Date().toISOString(),
  verifyUrl: 'https://codespectra.ai/verify/abc123',
  verifyToken: 'CERT-ABC123',
}

type General = GeneralPlatformSettings
type GeneralKey = keyof General

const defaults: General = GENERAL_PLATFORM_DEFAULTS

const locales = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'de', label: 'Deutsch' },
]

const currencies = [
  { id: 'USD', label: 'USD — US Dollar ($)' },
  { id: 'INR', label: 'INR — Indian Rupee (₹)' },
  { id: 'EUR', label: 'EUR — Euro (€)' },
  { id: 'GBP', label: 'GBP — British Pound (£)' },
  { id: 'CAD', label: 'CAD — Canadian Dollar' },
  { id: 'AUD', label: 'AUD — Australian Dollar' },
  { id: 'SGD', label: 'SGD — Singapore Dollar' },
  { id: 'JPY', label: 'JPY — Japanese Yen' },
]

const BRANDING_KEYS: GeneralKey[] = [
  'platform_name',
  'platform_tagline',
  'logo_url',
  'favicon_url',
  'support_email',
  'support_link_url',
  'timezone',
  'default_locale',
  'platform_currency',
  'company_name',
  'copyright_text',
  'company_address',
  'website_url',
  'privacy_policy_url',
  'terms_of_service_url',
]
const OPS_KEYS: GeneralKey[] = ['allow_registration', 'email_notifications', 'maintenance_mode', 'enable_sso_login', 'enable_chatbot']
const PRODUCT_KEYS: GeneralKey[] = ['require_email_verification', 'show_public_leaderboard']
const CERTIFICATE_KEYS: GeneralKey[] = ['certificate_template']
const EMAIL_PROVISION_KEYS: GeneralKey[] = ['admin_new_user_email_delivery']
const MEDIA_KEYS: GeneralKey[] = ['video_player_primary_color', 'video_player_autoplay', 'video_player_muted']

const DELIVERY_LABELS: Record<(typeof ADMIN_NEW_USER_EMAIL_DELIVERIES)[number], string> = {
  postal_recovery: 'Postal — password reset link',
  postal_magiclink: 'Postal — magic sign-in link',
}

type SecretsDraft = {
  razorpay_key_id: string
  razorpay_key_secret: string
  razorpay_webhook_secret: string
  trusted_origins_extra: string
  piston_url: string
  piston_run_timeout_ms: string
  piston_max_concurrent: string
  github_app_token: string
  github_client_id: string
  github_client_secret: string
  stripe_secret_key: string
  stripe_webhook_secret: string
  stripe_price_pro_monthly: string
  stripe_price_pro_yearly: string
  stripe_price_enterprise_monthly: string
  stripe_price_enterprise_yearly: string
  firebase_api_key: string
  firebase_auth_domain: string
  firebase_project_id: string
  firebase_storage_bucket: string
  firebase_messaging_sender_id: string
  firebase_app_id: string
  firebase_vapid_key: string
  cloudflare_zone_id: string
  cloudflare_api_token: string
  phonepe_merchant_id: string
  phonepe_salt_key: string
  phonepe_salt_index: string
  phonepe_webhook_secret: string
  gemini_api_key: string
  anthropic_api_key: string
  openai_api_key: string
  groq_api_key: string
  opencode_api_key: string
  openrouter_api_key: string
  nvidia_api_key: string
  internal_backend_secret: string
}

const emptySecretsDraft = (): SecretsDraft => ({
  razorpay_key_id: '',
  razorpay_key_secret: '',
  razorpay_webhook_secret: '',
  trusted_origins_extra: '',
  piston_url: '',
  piston_run_timeout_ms: '',
  piston_max_concurrent: '',
  github_app_token: '',
  github_client_id: '',
  github_client_secret: '',
  stripe_secret_key: '',
  stripe_webhook_secret: '',
  stripe_price_pro_monthly: '',
  stripe_price_pro_yearly: '',
  stripe_price_enterprise_monthly: '',
  stripe_price_enterprise_yearly: '',
  firebase_api_key: '',
  firebase_auth_domain: '',
  firebase_project_id: '',
  firebase_storage_bucket: '',
  firebase_messaging_sender_id: '',
  firebase_app_id: '',
  firebase_vapid_key: '',
  cloudflare_zone_id: '',
  cloudflare_api_token: '',
  phonepe_merchant_id: '',
  phonepe_salt_key: '',
  phonepe_salt_index: '1',
  phonepe_webhook_secret: '',
  gemini_api_key: '',
  anthropic_api_key: '',
  openai_api_key: '',
  groq_api_key: '',
  opencode_api_key: '',
  openrouter_api_key: '',
  nvidia_api_key: '',
  internal_backend_secret: '',
})

function EmailTemplatesSection() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const TEMPLATES: { id: string; label: string; desc: string; sample: Record<string, unknown>; icon: React.ReactNode }[] = [
    { id: 'welcomeEmail' as const, label: 'Welcome email', desc: 'Sent after user registration', sample: { name: 'John' }, icon: <Hand className="h-5 w-5" /> },
    { id: 'loginNotification' as const, label: 'Login notification', desc: 'Sent when a new sign-in is detected on the account', sample: { name: 'John', deviceInfo: 'Chrome on Mac', location: 'Mumbai, India', time: 'Jul 25, 2026 10:30 AM' }, icon: <Eye className="h-5 w-5" /> },
    { id: 'jobApplicationConfirmation' as const, label: 'Job application confirmation', desc: 'Sent when a user applies to a job', sample: { jobTitle: 'Software Engineer', companyName: 'Acme Inc', applicantName: 'Jane' }, icon: <FileSearch className="h-5 w-5" /> },
    { id: 'examStartedNotification' as const, label: 'Assessment started', desc: 'Sent when a user starts an assessment', sample: { examTitle: 'JavaScript Fundamentals', candidateName: 'Jane' }, icon: <NotebookText className="h-5 w-5" /> },
    { id: 'subscriptionConfirmation' as const, label: 'Subscription confirmation', desc: 'Sent after successful subscription', sample: { planName: 'Pro', amount: 2999 }, icon: <Sparkles className="h-5 w-5" /> },
    { id: 'invoiceNotification' as const, label: 'Invoice notification', desc: 'Sent when a new invoice is generated', sample: { invoiceId: 'INV-001', amount: 2999, planName: 'Pro' }, icon: <FileText className="h-5 w-5" /> },
    { id: 'phonePePaymentSuccess' as const, label: 'PhonePe payment success', desc: 'Sent after a successful PhonePe UPI payment', sample: { planName: 'Pro', amount: 2999, transactionId: 'TXN123456789' }, icon: <CreditCard className="h-5 w-5" /> },
    { id: 'phonePePaymentFailed' as const, label: 'PhonePe payment failed', desc: 'Sent when a PhonePe payment fails', sample: { planName: 'Pro', amount: 2999, reason: 'Insufficient funds' }, icon: <KeyRound className="h-5 w-5" /> },
    { id: 'passwordReset' as const, label: 'Password reset', desc: 'Sent when user requests a password reset', sample: {}, icon: <Key className="h-5 w-5" /> },
    { id: 'emailVerification' as const, label: 'Email verification', desc: 'Sent to verify email address', sample: {}, icon: <Mail className="h-5 w-5" /> },
    { id: 'teamInvite' as const, label: 'Team invitation', desc: 'Sent when added to a team', sample: { teamName: 'Engineering', invitedByName: 'Alice' }, icon: <UsersIcon className="h-5 w-5" /> },
    { id: 'twoFactorBackup' as const, label: '2FA backup codes', desc: 'Sent when 2FA is enabled', sample: {}, icon: <ShieldCheck className="h-5 w-5" /> },
    { id: 'hackathonResultsReleased' as const, label: 'Hackathon results released', desc: 'Sent when hackathon results are published', sample: { eventName: 'CodeSprint 2026', teamName: 'Alpha Coders', rank: 3, totalTeams: 50, score: 920, resultsUrl: 'https://codespectra.ai/hackathons/sprint2026/results' }, icon: <Flame className="h-5 w-5" /> },
  ]

  return (
    <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
      {TEMPLATES.map((tpl) => {
        const preview = tpl.id === 'hackathonResultsReleased'
          ? (hackathonEmailTemplates.resultsReleased as any)(tpl.sample)
          : (emailTemplates[tpl.id as keyof typeof emailTemplates] as any)(...Object.values(tpl.sample))
        return (
          <div key={tpl.id} className="rounded-lg border border-border/60 bg-card/40 p-4 hover:border-primary/20 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-muted-foreground">{tpl.icon}</span>
                <div>
                  <p className="text-sm font-medium text-foreground">{tpl.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{tpl.desc}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={() => setExpanded((v) => ({ ...v, [tpl.id]: !v[tpl.id] }))}
              >
                {expanded[tpl.id] ? 'Hide' : 'Preview'}
              </Button>
            </div>
            {expanded[tpl.id] && preview && (
              <div className="mt-4 rounded-lg border border-border/40 bg-background overflow-hidden">
                <div className="border-b border-border/40 bg-muted/20 px-4 py-2 text-xs text-muted-foreground font-mono">
                  Subject: {preview.subject}
                </div>
                <div className="p-4 max-h-[400px] overflow-y-auto">
                  <div
                    className="prose prose-sm max-w-none dark:prose-invert [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mb-1"
                    dangerouslySetInnerHTML={{ __html: preview.html }}
                  />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SystemSettingsInner() {
  const gate = usePageGuard('/dashboard/admin/settings')
  const searchParams = useSearchParams()
  const section: PlatformSettingsSection = parsePlatformSettingsSection(
    searchParams.get('section')
  )
  const addToast = useToast()
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<
    'branding' | 'ops' | 'product' | 'mail' | 'integrations' | 'payments' | 'certificates' | 'gamification' | 'redis' | 'media' | null
  >(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState<General>(defaults)
  const [secretsMeta, setSecretsMeta] = useState<Record<string, unknown>>({})
  const [secretsDraft, setSecretsDraft] = useState<SecretsDraft>(() => emptySecretsDraft())
  const [mailSecretsDraft, setMailSecretsDraft] = useState({
    postal_server: '',
    postal_api_key: '',
    postal_from_email: '',
  })

  const GAMIFICATION_DEFAULTS: Record<string, unknown> = {
    xp_submission_easy: 10,
    xp_submission_medium: 25,
    xp_submission_hard: 50,
    xp_first_blood: 25,
    xp_exam_pass: 50,
    xp_cert_pass: 100,
    xp_codeathon: 20,
    xp_hackathon: 100,
    xp_daily_login: 5,
    xp_streak_7day: 25,
    xp_streak_30day: 100,
    level_2_xp: 100,
    level_5_xp: 500,
    level_10_xp: 2000,
    level_20_xp: 8000,
    level_50_xp: 50000,
    streak_multiplier: 1.5,
    streak_freeze_enabled: true,
    referral_xp_bonus: 500,
    referral_commission_percent: 10,
    badge_hackathon_enabled: true,
    badge_exam_enabled: true,
    badge_cert_enabled: true,
    badge_streak_enabled: true,
  }
  const [gamification, setGamification] = useState<Record<string, unknown>>(GAMIFICATION_DEFAULTS)

  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({})
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({})
  const [previewTemplate, setPreviewTemplate] = useState<TemplateKey | null>(null)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const handleRevealToggle = useCallback(async (key: string) => {
    if (visibleFields[key]) {
      clearTimeout(timers.current[key])
      delete timers.current[key]
      setVisibleFields((v) => ({ ...v, [key]: false }))
      setRevealedValues((v) => { const n = { ...v }; delete n[key]; return n })
    } else {
      const res = await fetch(`/api/admin/server-secrets/reveal?key=${key}`, { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.value) {
        setRevealedValues((v) => ({ ...v, [key]: json.value }))
      }
      setVisibleFields((v) => ({ ...v, [key]: true }))
      clearTimeout(timers.current[key])
      timers.current[key] = setTimeout(() => {
        setVisibleFields((v) => ({ ...v, [key]: false }))
        setRevealedValues((v) => { const n = { ...v }; delete n[key]; return n })
        delete timers.current[key]
      }, 30_000)
    }
  }, [visibleFields])

  const toggleVisible = useCallback((key: string) => {
    setVisibleFields((v) => ({ ...v, [key]: !v[key] }))
  }, [])

  useEffect(() => {
    return () => { Object.values(timers.current).forEach(clearTimeout) }
  }, [])

  useEffect(() => {
    if (!gate.ready) return
    const run = async () => {
      const [res, secRes, gamRes] = await Promise.all([
        fetch('/api/admin/platform-settings', { credentials: 'include' }),
        fetch('/api/admin/server-secrets', { credentials: 'include' }),
        fetch('/api/admin/platform-settings?section=gamification', { credentials: 'include' }),
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
      if (gamRes.ok) {
        const gamJson = await gamRes.json().catch(() => ({}))
        if (gamJson.settings) {
          setGamification({ ...GAMIFICATION_DEFAULTS, ...gamJson.settings })
        }
      }
      setLoading(false)
    }
    void run()
  }, [gate.ready, addToast])

  const reloadSecrets = useCallback(async () => {
    try {
      const secRes = await fetch('/api/admin/server-secrets', { credentials: 'include' })
      const secJson = await secRes.json().catch(() => ({}))
      if (secRes.ok && secJson.secrets) {
        setSecretsMeta(secJson.secrets as Record<string, unknown>)
        // Pre-populate draft with visible plain values for immediate feedback
        const meta = secJson.secrets as Record<string, unknown>
        setSecretsDraft((d) => ({
          ...d,
          piston_url: typeof meta.piston_url === 'string' ? meta.piston_url : d.piston_url || '',
          piston_run_timeout_ms: typeof meta.piston_run_timeout_ms === 'string' ? meta.piston_run_timeout_ms : d.piston_run_timeout_ms || '',
          piston_max_concurrent: typeof meta.piston_max_concurrent === 'string' ? meta.piston_max_concurrent : d.piston_max_concurrent || '',
        }))
      } else if (!secRes.ok) {
        console.error('[reloadSecrets] HTTP', secRes.status)
      }
    } catch (e) {
      console.error('[reloadSecrets] fetch error:', e)
    }
  }, [])

  useEffect(() => {
    if (loading) return
    // Pre-populate ALL plain-text fields from saved server secrets
    setSecretsDraft((d) => {
      const next: any = { ...d }
      const plainFields = [
        'piston_url', 'piston_run_timeout_ms', 'piston_max_concurrent',
        'stripe_price_pro_monthly', 'stripe_price_pro_yearly',
        'stripe_price_enterprise_monthly', 'stripe_price_enterprise_yearly',
        'trusted_origins_extra', 'github_client_id',
        'firebase_api_key', 'firebase_auth_domain', 'firebase_project_id',
        'firebase_storage_bucket', 'firebase_messaging_sender_id', 'firebase_app_id', 'firebase_vapid_key',
        'phonepe_salt_index', 'phonepe_merchant_id',
      ] as const
      for (const k of plainFields) {
        const v = secretsMeta[k]
        if (typeof v === 'string' && v.trim()) {
          (next as any)[k] = v.trim()
        }
      }
      return next
    })
    // Pre-populate mail secrets from saved values
    setMailSecretsDraft((d) => {
      const next = { ...d }
      const mailFields = [
        'postal_server', 'postal_from_email',
      ] as const
      for (const k of mailFields) {
        const v = secretsMeta[k]
        if (typeof v === 'string' && v.trim()) {
          (next as any)[k] = v.trim()
        }
      }
      
      // Mail secret keys are intentionally left empty — click eye icon to reveal saved values

      return next
    })
  }, [loading, secretsMeta])

  const saveKeys = useCallback(
    async (keys: GeneralKey[], section: 'branding' | 'ops' | 'product' | 'certificates' | 'media') => {
      setSavingKey(section)
      try {
        const body: Record<string, unknown> = {}
        for (const k of keys) {
          body[k] = form[k]
        }
        const res = await csrfFetch('/api/admin/platform-settings', {
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
      const res = await csrfFetch('/api/admin/server-secrets', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json.error as string) || 'Save failed')
      await reloadSecrets()
      addToast({ type: 'success', title: 'Integrations saved' })
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
      const res = await csrfFetch('/api/admin/platform-settings', {
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
      if (mailSecretsDraft.postal_server.trim()) secBody.postal_server = mailSecretsDraft.postal_server.trim()
      if (mailSecretsDraft.postal_api_key.trim()) secBody.postal_api_key = mailSecretsDraft.postal_api_key.trim()
      if (mailSecretsDraft.postal_from_email.trim())
        secBody.postal_from_email = mailSecretsDraft.postal_from_email.trim()
      if (Object.keys(secBody).length > 0) {
        const sres = await csrfFetch('/api/admin/server-secrets', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(secBody),
        })
        const sjson = await sres.json().catch(() => ({}))
        if (!sres.ok) throw new Error((sjson.error as string) || 'Secrets save failed')
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

  const saveGamification = useCallback(async () => {
    setSavingKey('gamification')
    try {
      const res = await csrfFetch('/api/admin/platform-settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'gamification', ...gamification }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          res.status === 401
            ? 'Unauthorized — sign out and sign in again so the API receives your session cookie.'
            : (json.error as string) || 'Save failed'
        throw new Error(msg)
      }
      setGamification({ ...GAMIFICATION_DEFAULTS, ...json.settings })
      addToast({ type: 'success', title: 'Gamification settings saved' })
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Save failed',
        message: e instanceof Error ? e.message : 'Unknown error',
      })
    } finally {
      setSavingKey(null)
    }
  }, [addToast, gamification])

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
              Manage platform branding, email delivery, payments, and integrations. Environment variables override stored secrets.
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
        <div className="space-y-6">
        <Card className="rounded-xl border-border/60 shadow-sm">
          <div className="border-b border-border/60 px-6 py-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Branding & support</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Platform name, tagline, logo, support contacts, and locale.</p>
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
              <Label htmlFor="logo_upload">Logo (optional)</Label>
              <input
                id="logo_upload"
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="mt-1.5 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 2 * 1024 * 1024) { addToast({ type: 'info', title: 'Notification', message: 'Image must be under 2MB' }); return }
                  const reader = new FileReader()
                  reader.onload = (ev) => setForm((f) => ({ ...f, logo_url: ev.target?.result as string || '' }))
                  reader.readAsDataURL(file)
                }}
              />
              {form.logo_url ? (
                <div className="mt-2 flex items-center gap-3">
                  <img src={form.logo_url} alt="logo preview" className="h-10 w-auto rounded border object-contain" />
                  <button onClick={() => setForm((f) => ({ ...f, logo_url: '' }))} className="text-xs text-destructive hover:underline">Remove</button>
                </div>
              ) : null}
            </div>
            <div>
              <Label htmlFor="favicon_upload">Favicon (optional)</Label>
              <input
                id="favicon_upload"
                type="file"
                accept="image/png,image/x-icon,image/svg+xml,image/webp"
                className="mt-1.5 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 1 * 1024 * 1024) { addToast({ type: 'info', title: 'Notification', message: 'Favicon must be under 1MB' }); return }
                  const reader = new FileReader()
                  reader.onload = (ev) => setForm((f) => ({ ...f, favicon_url: ev.target?.result as string || '' }))
                  reader.readAsDataURL(file)
                }}
              />
              {form.favicon_url ? (
                <div className="mt-2 flex items-center gap-3">
                  <img src={form.favicon_url} alt="favicon preview" className="h-8 w-8 rounded border object-contain" />
                  <button onClick={() => setForm((f) => ({ ...f, favicon_url: '' }))} className="text-xs text-destructive hover:underline">Remove</button>
                </div>
              ) : null}
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
              <Select
                value={form.timezone || 'UTC'}
                onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
              >
                <SelectTrigger id="timezone" className="mt-1.5 h-10 w-full rounded-lg border-border/60 font-mono text-sm">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTC">UTC (Coordinated Universal Time)</SelectItem>
                  <SelectItem value="America/New_York">America/New_York (EST/EDT)</SelectItem>
                  <SelectItem value="America/Chicago">America/Chicago (CST/CDT)</SelectItem>
                  <SelectItem value="America/Denver">America/Denver (MST/MDT)</SelectItem>
                  <SelectItem value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</SelectItem>
                  <SelectItem value="Europe/London">Europe/London (GMT/BST)</SelectItem>
                  <SelectItem value="Europe/Paris">Europe/Paris (CET/CEST)</SelectItem>
                  <SelectItem value="Europe/Berlin">Europe/Berlin (CET/CEST)</SelectItem>
                  <SelectItem value="Asia/Dubai">Asia/Dubai (GST)</SelectItem>
                  <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                  <SelectItem value="Asia/Singapore">Asia/Singapore (SGT)</SelectItem>
                  <SelectItem value="Asia/Tokyo">Asia/Tokyo (JST)</SelectItem>
                  <SelectItem value="Australia/Sydney">Australia/Sydney (AEST/AEDT)</SelectItem>
                </SelectContent>
              </Select>
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
            <div>
              <Label htmlFor="platform_currency">Platform currency</Label>
              <Select
                value={form.platform_currency || 'USD'}
                onValueChange={(v) => setForm((f) => ({ ...f, platform_currency: v }))}
              >
                <SelectTrigger id="platform_currency" className="mt-1.5 h-10 w-full rounded-lg border-border/60 font-mono text-sm">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border-t border-border/40 pt-4 mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Company & Legal</p>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="company_name">Company name</Label>
                  <Input
                    id="company_name"
                    value={form.company_name}
                    onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                    className="mt-1.5 h-10 rounded-lg border-border/60 bg-background"
                    placeholder="CodeSpectra"
                  />
                </div>
                <div>
                  <Label htmlFor="website_url">Website URL</Label>
                  <Input
                    id="website_url"
                    type="url"
                    value={form.website_url}
                    onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))}
                    className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm"
                    placeholder="https://codespectra.ai"
                  />
                </div>
                <div>
                  <Label htmlFor="company_address">Company address</Label>
                  <Textarea
                    id="company_address"
                    value={form.company_address}
                    onChange={(e) => setForm((f) => ({ ...f, company_address: e.target.value }))}
                    className="mt-1.5 rounded-lg border-border/60 bg-background text-sm"
                    placeholder="548 Market St, San Francisco, CA 94104"
                    rows={2}
                  />
                </div>
                <div>
                  <Label htmlFor="copyright_text">Copyright text</Label>
                  <Input
                    id="copyright_text"
                    value={form.copyright_text}
                    onChange={(e) => setForm((f) => ({ ...f, copyright_text: e.target.value }))}
                    className="mt-1.5 h-10 rounded-lg border-border/60 bg-background"
                    placeholder="© 2026 CodeSpectra. All rights reserved."
                  />
                </div>
                <div>
                  <Label htmlFor="privacy_policy_url">Privacy policy URL</Label>
                  <Input
                    id="privacy_policy_url"
                    type="url"
                    value={form.privacy_policy_url}
                    onChange={(e) => setForm((f) => ({ ...f, privacy_policy_url: e.target.value }))}
                    className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm"
                    placeholder="https://codespectra.ai/privacy"
                  />
                </div>
                <div>
                  <Label htmlFor="terms_of_service_url">Terms of service URL</Label>
                  <Input
                    id="terms_of_service_url"
                    type="url"
                    value={form.terms_of_service_url}
                    onChange={(e) => setForm((f) => ({ ...f, terms_of_service_url: e.target.value }))}
                    className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm"
                    placeholder="https://codespectra.ai/terms"
                  />
                </div>
              </div>
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

        <Card className="rounded-xl border-border/60 bg-card p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Media Player Settings</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Configure global defaults for the Vidstack video player.
              </p>
            </div>
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Video className="h-5 w-5" />
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <Label htmlFor="video_player_primary_color">Primary Theme Color (Hex)</Label>
              <Input
                id="video_player_primary_color"
                value={form.video_player_primary_color}
                onChange={(e) => setForm((f) => ({ ...f, video_player_primary_color: e.target.value }))}
                className="mt-1.5 h-10 rounded-lg border-border/60 bg-background"
                placeholder="#34d399"
              />
            </div>
            <div className="flex flex-col justify-center space-y-4">
              <div className="flex items-center justify-between mt-6">
                <div className="space-y-0.5">
                  <Label>Autoplay by Default</Label>
                  <p className="text-sm text-muted-foreground">Start videos automatically when loaded</p>
                </div>
                <Switch
                  checked={form.video_player_autoplay}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, video_player_autoplay: c }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Muted by Default</Label>
                  <p className="text-sm text-muted-foreground">Start videos with sound off</p>
                </div>
                <Switch
                  checked={form.video_player_muted}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, video_player_muted: c }))}
                />
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Button
              className="gap-2 rounded-lg"
              onClick={() => void saveKeys(MEDIA_KEYS, 'media')}
              disabled={savingKey !== null}
            >
              {savingKey === 'media' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save media settings
            </Button>
          </div>
        </Card>
        </div>
      ) : null}

      {section === 'cloudflare' ? (
        <CloudflareSettingsSection />
      ) : null}

            {section === 'redis' ? (
              <RedisSettingsSection />
            ) : null}

            {section === 'whatsapp' ? (
              <WhatsAppSettingsSection />
            ) : null}

           {section === 'mail' ? (
        <Card className="rounded-xl border-border/60 shadow-sm">
          <div className="border-b border-border/60 px-6 py-4">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Mail &amp; email APIs</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose how new users receive account access. Provider keys can also be configured server-side (<code className="rounded bg-muted px-1">RESEND_API_KEY</code>, etc.).
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
              <p className="mt-2 text-xs text-muted-foreground">
                All transactional emails are sent through Postal. Server env vars override saved keys.
              </p>
            </div>

            <Alert className="rounded-lg border-border/60 bg-muted/20">
              <AlertTitle className="text-sm">Email templates</AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                Templates are configured in{' '}
                <Link
                  href={platformSettingsHref('email-templates')}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Email templates
                </Link>
                . Set <code className="rounded bg-muted px-1 text-xs">NEXT_PUBLIC_APP_URL</code> for correct invite links.
              </AlertDescription>
            </Alert>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/15 p-4 md:col-span-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Postal</p>
                  {secretsMeta.has_postal_api_key || secretsMeta.postal_server ? (
                    <span className="rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[10px] uppercase font-medium">✓ Active</span>
                  ) : (
                    <span className="rounded-full bg-amber-500/15 text-amber-300 px-2 py-0.5 text-[10px] uppercase font-medium">Not configured</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Self-hosted Postal mail server. Server URL, API key, and from address.
                </p>
                {secretsMeta.has_postal_api_key ? (
                  <p className="font-mono text-xs text-muted-foreground">
                    Current key: {String(secretsMeta.postal_api_key_masked ?? '—')}
                  </p>
                ) : null}
                <div>
                  <Label htmlFor="mail_postal_server">Postal server URL</Label>
                  <Input
                    id="mail_postal_server"
                    type="url"
                    placeholder={String(secretsMeta.postal_server || 'https://postal.yourdomain.com')}
                    value={mailSecretsDraft.postal_server}
                    onChange={(e) =>
                      setMailSecretsDraft((d) => ({ ...d, postal_server: e.target.value }))
                    }
                    className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="mail_postal_key">Postal API key</Label>
                  <div className="relative">
                    <Input
                      id="mail_postal_key"
                      type={visibleFields.postal_api_key ? 'text' : 'password'}
                      autoComplete="off"
                      placeholder={secretsMeta.has_postal_api_key ? 'Key saved — enter new value to replace' : 'post_…'}
                      value={visibleFields.postal_api_key ? (revealedValues.postal_api_key ?? '') : '••••••••'}
                      onChange={(e) =>
                        setMailSecretsDraft((d) => ({ ...d, postal_api_key: e.target.value }))
                      }
                      className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm pr-10"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => handleRevealToggle('postal_api_key')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Toggle visibility"
                    >
                      {visibleFields.postal_api_key ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="mail_postal_from">From address</Label>
                  <Input
                    id="mail_postal_from"
                    type="text"
                    placeholder={String(secretsMeta.postal_from_email || 'noreply@yourdomain.com')}
                    value={mailSecretsDraft.postal_from_email}
                    onChange={(e) =>
                      setMailSecretsDraft((d) => ({ ...d, postal_from_email: e.target.value }))
                    }
                    className="mt-1.5 h-10 rounded-lg border-border/60 bg-background text-sm"
                  />
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
          <div className="space-y-0 divide-y divide-border/60 px-6 py-5">
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
                <p className="text-sm text-muted-foreground">Show maintenance notice to all users</p>
              </div>
              <Switch
                id="maintenance_mode"
                checked={form.maintenance_mode}
                onCheckedChange={(v) => setForm((f) => ({ ...f, maintenance_mode: v }))}
              />
            </div>
            <div className="flex items-center justify-between gap-4 py-4">
              <div className="space-y-0.5">
                <Label htmlFor="enable_sso_login" className="text-foreground">
                  Enterprise SSO
                </Label>
                <p className="text-sm text-muted-foreground">Show Single Sign-On (SAML/OIDC) option on the login page</p>
              </div>
              <Switch
                id="enable_sso_login"
                checked={form.enable_sso_login}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enable_sso_login: v }))}
              />
            </div>
            <div className="flex items-center justify-between gap-4 py-4">
              <div className="space-y-0.5">
                <Label htmlFor="enable_chatbot" className="text-foreground">
                  Ask CodeSpectra Chatbot
                </Label>
                <p className="text-sm text-muted-foreground">Enable the global AI coding assistant for all users</p>
              </div>
              <Switch
                id="enable_chatbot"
                checked={form.enable_chatbot}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enable_chatbot: v }))}
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
              Sign-up flows, leaderboard visibility, and verification settings.
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

          {section === 'certificates' ? (
        <Card className="rounded-xl border-border/60 shadow-sm">
          <div className="border-b border-border/60 px-6 py-4">
            <div className="flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Certificates</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose the default certificate template for all events. Preview each design before saving.
            </p>
          </div>
          <div className="space-y-6 p-6">
            <div className="space-y-4">
              <div className="min-w-0 space-y-0.5">
                <Label className="text-foreground">Default Template</Label>
                <p className="text-sm text-muted-foreground">This template is used when issuing certificates after event completion.</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {TEMPLATES.map((t) => {
                  const selected = form.certificate_template === t.key
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, certificate_template: t.key }))}
                      className={`relative rounded-lg border-2 p-4 text-left transition-all ${
                        selected
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border/60 bg-card hover:border-primary/50 hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className={`h-3 w-3 rounded-full ${
                            t.key === 'classic' ? 'bg-amber-600' :
                            t.key === 'modern' ? 'bg-emerald-500' : 'bg-neutral-800'
                          }`}
                        />
                        <span className="text-sm font-medium">{t.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{t.description}</p>
                      {selected && (
                        <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                          <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-3 pt-1">
                <p className="text-xs text-muted-foreground">
                  Selected: <span className="font-medium text-foreground">{TEMPLATES.find((t) => t.key === form.certificate_template)?.label || form.certificate_template}</span>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewTemplate(form.certificate_template as TemplateKey)}
                  className="ml-auto"
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                  Preview
                </Button>
              </div>
            </div>

            <style jsx global>{`
              .cert-sheet {
                aspect-ratio: 1123 / 794;
                width: 100%;
                min-height: 70vh;
              }
            `}</style>

            <Dialog open={!!previewTemplate} onOpenChange={(o) => { if (!o) setPreviewTemplate(null) }}>
              <DialogContent className="!max-w-[95vw] !w-[1400px] max-h-[95vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Certificate Preview — {TEMPLATES.find((t) => t.key === previewTemplate)?.label || previewTemplate}</DialogTitle>
                  <DialogDescription>
                    This is how the certificate will render with sample data. Actual certificates use real participant details.
                  </DialogDescription>
                </DialogHeader>
                {previewTemplate && (
                  <div className="w-full max-w-[1100px] mx-auto">
                    <div className="overflow-hidden rounded-lg border shadow-sm">
                      <CertificateRenderer data={CERT_PREVIEW_DATA} template={previewTemplate} />
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex justify-end border-t border-border/60 bg-muted/20 px-6 py-4">
            <Button
              className="gap-2 rounded-lg"
              onClick={() => void saveKeys(CERTIFICATE_KEYS, 'certificates')}
              disabled={savingKey !== null}
            >
              {savingKey === 'certificates' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save certificate settings
            </Button>
          </div>
        </Card>
          ) : null}

          {section === 'integrations' ? (
            <Card className="rounded-xl border-border/60 shadow-sm">
              <div className="border-b border-border/60 px-6 py-4">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Integrations</h3>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Service integrations. Payments in{' '}
                  <Link href={platformSettingsHref('payments')} className="font-medium text-primary underline-offset-4 hover:underline">
                    Payments &amp; billing
                  </Link>
                  , mail keys in{' '}
                  <Link href={platformSettingsHref('mail')} className="font-medium text-primary underline-offset-4 hover:underline">
                    Mail &amp; email APIs
                  </Link>
                  .
                </p>
              </div>
              <div className="space-y-6 px-6 py-5">

                {/* Trusted Origins editor */}
                <div className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-4" data-testid="origins-section">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Trusted origins (CORS + CSRF)</p>
                    <div className="flex items-center gap-2">
                      {secretsMeta.trusted_origins_extra ? (
                        <span className="rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[10px] uppercase font-medium">✓ Active</span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 text-amber-300 px-2 py-0.5 text-[10px] uppercase font-medium">Not configured</span>
                      )}
                      <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] uppercase tracking-wide">Dynamic</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Controls which external domains are allowed to make requests to your auth endpoints.
                    CORS (Cross-Origin Resource Sharing) governs browser-initiated requests from other sites.
                    CSRF (Cross-Site Request Forgery) tokens protect state-changing operations like login and signup.
                    Add any staging, preview, or custom-domain URLs that need to reach <code className="rounded bg-muted px-1">/api/auth/*</code>.
                    One per line or comma-separated.
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Trailing slashes stripped. Only <code>http://</code> and <code>https://</code> origins accepted.
                    Your production domain is automatically trusted.
                  </p>
                  <textarea
                    id="sec_trusted_origins"
                    rows={3}
                    value={secretsDraft.trusted_origins_extra}
                    onChange={(e) =>
                      setSecretsDraft((d) => ({ ...d, trusted_origins_extra: e.target.value }))
                    }
                    className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder={`https://staging.codespectra.com\nhttps://preview-branch.example.com`}
                    data-testid="trusted-origins-input"
                  />
                  {secretsMeta.trusted_origins_extra ? (
                    <p className="font-mono text-[11px] text-muted-foreground break-all">
                      Saved: {String(secretsMeta.trusted_origins_extra)}
                    </p>
                  ) : null}
                </div>

                {/* Piston (code execution backend) */}
                <div className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-4" data-testid="piston-section">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Code execution backend (Piston)</p>
                    <div className="flex items-center gap-2">
                      {secretsMeta.piston_url ? (
                        <span className="rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[10px] uppercase font-medium">✓ Active</span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 text-amber-300 px-2 py-0.5 text-[10px] uppercase font-medium">In-process</span>
                      )}
                      <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] uppercase tracking-wide">Dynamic</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Piston-compatible code execution server URL. Leave empty for in-process executor (python, node, tsx, bash).
                  </p>
                  <Input
                    id="sec_piston_url"
                    value={secretsDraft.piston_url}
                    onChange={(e) =>
                      setSecretsDraft((d) => ({ ...d, piston_url: e.target.value }))
                    }
                    placeholder="https://piston.your-domain.com/api/v2/piston"
                    className="font-mono"
                    data-testid="piston-url-input"
                  />
                  {secretsMeta.piston_url ? (
                    <p className="font-mono text-[11px] text-muted-foreground break-all">
                      Saved: {String(secretsMeta.piston_url)}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Currently using in-process executor (subprocess, no sandbox).
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Run timeout (ms)
                      </label>
                      <Input
                        id="sec_piston_run_timeout"
                        value={secretsDraft.piston_run_timeout_ms}
                        onChange={(e) =>
                          setSecretsDraft((d) => ({ ...d, piston_run_timeout_ms: e.target.value }))
                        }
                        placeholder="5000"
                        className="mt-1 font-mono"
                        data-testid="piston-run-timeout-input"
                      />
                      {secretsMeta.piston_run_timeout_ms ? (
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          Saved: {String(secretsMeta.piston_run_timeout_ms)}ms
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">Default: 5000ms</p>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Max concurrent jobs
                      </label>
                      <Input
                        id="sec_piston_max_concurrent"
                        value={secretsDraft.piston_max_concurrent}
                        onChange={(e) =>
                          setSecretsDraft((d) => ({ ...d, piston_max_concurrent: e.target.value }))
                        }
                        placeholder="30"
                        className="mt-1 font-mono"
                        data-testid="piston-max-concurrent-input"
                      />
                      {secretsMeta.piston_max_concurrent ? (
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          Saved: {String(secretsMeta.piston_max_concurrent)} jobs
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">Default: unlimited</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* GitHub App token */}
                <div className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-4" data-testid="github-token-section">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">GitHub App / PAT token</p>
                    <div className="flex items-center gap-2">
                      {secretsMeta.has_github_app_token ? (
                        <span className="rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[10px] uppercase font-medium">✓ Active</span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 text-amber-300 px-2 py-0.5 text-[10px] uppercase font-medium">Not configured</span>
                      )}
                      <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] uppercase tracking-wide">Dynamic</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Personal access token used by the AI code-review bot to{' '}
                    <strong>post review comments back to PRs</strong>. Needs{' '}
                    <code>pull_requests:write</code> on the repos you want reviewed.
                    Without this, reviews are saved to MongoDB but not posted to GitHub.
                  </p>
                  {secretsMeta.has_github_app_token ? (
                    <p className="font-mono text-[11px] text-muted-foreground">
                      Current key: {String(secretsMeta.github_app_token_masked ?? '—')}
                    </p>
                  ) : null}
                  <div className="relative">
                    <Input
                      id="sec_github_app_token"
                      type={visibleFields.github_app_token ? 'text' : 'password'}
                      value={visibleFields.github_app_token ? (revealedValues.github_app_token ?? '') : '••••••••'}
                      onChange={(e) =>
                        setSecretsDraft((d) => ({ ...d, github_app_token: e.target.value }))
                      }
                      placeholder="ghp_…  (or  github_pat_…)"
                      className="font-mono pr-10"
                      data-testid="github-token-input"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => handleRevealToggle('github_app_token')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Toggle visibility"
                    >
                      {visibleFields.github_app_token ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Internal backend auth secret (frontend copy of INTERNAL_BACKEND_SECRET) */}
                <div className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-4" data-testid="internal-secret-section">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Internal backend auth secret</p>
                    <div className="flex items-center gap-2">
                      {secretsMeta.has_internal_backend_secret ? (
                        <span className="rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[10px] uppercase font-medium">✓ Active</span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 text-amber-300 px-2 py-0.5 text-[10px] uppercase font-medium">Not configured</span>
                      )}
                      <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] uppercase tracking-wide">Dynamic</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Shared secret sent as <code>x-internal-secret</code> on server-to-server calls
                    to the FastAPI backend (<code>/internal/*</code> routes). <strong>Must match the
                    backend's <code>INTERNAL_BACKEND_SECRET</code> environment variable</strong> set in
                    Dokploy — this field only controls the frontend's copy and takes effect on the
                    next request after save.
                  </p>
                  {secretsMeta.has_internal_backend_secret ? (
                    <p className="font-mono text-[11px] text-muted-foreground">
                      Current key: {String(secretsMeta.internal_backend_secret_masked ?? '—')}
                    </p>
                  ) : null}
                  <div className="relative">
                    <Input
                      id="sec_internal_backend_secret"
                      type={visibleFields.internal_backend_secret ? 'text' : 'password'}
                      value={visibleFields.internal_backend_secret ? (revealedValues.internal_backend_secret ?? '') : '••••••••'}
                      onChange={(e) =>
                        setSecretsDraft((d) => ({ ...d, internal_backend_secret: e.target.value }))
                      }
                      placeholder="Leave blank to keep Dokploy env value"
                      className="font-mono pr-10"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => handleRevealToggle('internal_backend_secret')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Toggle visibility"
                    >
                      {visibleFields.internal_backend_secret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* GitHub OAuth App (per-user "Connect GitHub" flow) */}
                <div className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-4" data-testid="github-oauth-section">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">GitHub OAuth App (per-user install)</p>
                    <div className="flex items-center gap-2">
                      {secretsMeta.github_client_id ? (
                        <span className="rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[10px] uppercase font-medium">✓ Active</span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 text-amber-300 px-2 py-0.5 text-[10px] uppercase font-medium">Not configured</span>
                      )}
                      <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] uppercase tracking-wide">Dynamic</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Lets each user authorise CodeSpectra against their own GitHub
                    account (no PAT pasting). Create an OAuth App at{' '}
                    <a
                      href="https://github.com/settings/applications/new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      github.com/settings/applications/new
                    </a>{' '}
                    and set the Authorization callback URL to{' '}
                    <code className="break-all">
                      {(typeof window !== 'undefined' ? window.location.origin : '<APP_URL>')}
                      /api/github/oauth/callback
                    </code>
                    .
                  </p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Client ID
                      </label>
                      <Input
                        value={secretsDraft.github_client_id}
                        onChange={(e) =>
                          setSecretsDraft((d) => ({ ...d, github_client_id: e.target.value }))
                        }
                        placeholder="Iv1.…"
                        className="font-mono"
                        data-testid="github-client-id-input"
                      />
                      {secretsMeta.github_client_id ? (
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground break-all">
                          Saved: {String(secretsMeta.github_client_id)}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Client secret
                      </label>
                      <div className="relative">
                        <Input
                          type={visibleFields.github_client_secret ? 'text' : 'password'}
                          value={visibleFields.github_client_secret ? (revealedValues.github_client_secret ?? '') : '••••••••'}
                          onChange={(e) =>
                            setSecretsDraft((d) => ({ ...d, github_client_secret: e.target.value }))
                          }
                          placeholder="••••••••••••••••"
                          className="font-mono pr-10"
                          data-testid="github-client-secret-input"
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => handleRevealToggle('github_client_secret')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Toggle visibility"
                        >
                          {visibleFields.github_client_secret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {secretsMeta.has_github_client_secret ? (
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                          Current: {String(secretsMeta.github_client_secret_masked ?? '—')}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <GitHubConnectButton />
                </div>

                {/* Firebase client SDK config */}
                <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-5" data-testid="firebase-config-section">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                        <Flame className="h-4 w-4 text-primary" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">Firebase Auth SDK</p>
                    </div>
                    {secretsMeta.firebase_api_key &&
                    secretsMeta.firebase_auth_domain &&
                    secretsMeta.firebase_project_id &&
                    secretsMeta.firebase_app_id ? (
                      <span className="rounded-full bg-emerald-500/15 text-emerald-300 px-2.5 py-0.5 text-[10px] uppercase tracking-wide">
                        ✓ Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/15 text-amber-300 px-2.5 py-0.5 text-[10px] uppercase tracking-wide">
                        Not configured
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Client-side Firebase config used by the auth UI. Stored in MongoDB and served to the
                    browser — no build-time env vars or redeploy needed. Find these values in your{' '}
                    <a
                      href="https://console.firebase.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Firebase Console → Project settings → General → Your apps → Web app
                    </a>
                    . Admin SDK credentials (service account) must still be set as environment variables on the server.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[
                      { key: 'firebase_api_key', label: 'API Key', ph: 'AIzaSy…' },
                      { key: 'firebase_auth_domain', label: 'Auth Domain', ph: 'your-project.firebaseapp.com' },
                      { key: 'firebase_project_id', label: 'Project ID', ph: 'your-project' },
                      { key: 'firebase_storage_bucket', label: 'Storage Bucket', ph: 'your-project.appspot.com' },
                      { key: 'firebase_messaging_sender_id', label: 'Messaging Sender ID', ph: '123456789012' },
                      { key: 'firebase_app_id', label: 'App ID', ph: '1:123456789012:web:abc123' },
                      { key: 'firebase_vapid_key', label: 'Web Push VAPID Key', ph: 'BL…' },
                    ].map(({ key, label, ph }) => (
                          <div key={key} className="space-y-1.5">
                        <Label className="text-foreground">{label}</Label>
                        <div className="relative">
                          <Input
                            value={secretsDraft[key as keyof SecretsDraft] || String(secretsMeta[key] || '')}
                            onChange={(e) =>
                              setSecretsDraft((d) => ({ ...d, [key]: e.target.value }))
                            }
                            type={visibleFields[key] ? 'text' : 'password'}
                            placeholder={String(secretsMeta[key] ? '' : ph)}
                            className="h-10 rounded-lg border-border/60 bg-background font-mono text-sm pr-10"
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => toggleVisible(key)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Toggle visibility"
                          >
                            {visibleFields[key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    ))}
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
                  Save integrations
                </Button>
              </div>
            </Card>
          ) : null}
          {section === 'payments' ? (
            <Card className="rounded-xl border-border/60 shadow-sm">
              <div className="border-b border-border/60 px-6 py-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Payments &amp; billing</h3>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Configure <strong>PhonePe</strong> (India, primary), <strong>Razorpay</strong>, and legacy <strong>Stripe</strong> credentials below. Keys are stored encrypted at
                  rest in MongoDB and read by every payment endpoint — no redeploy required.
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
                    <Label htmlFor="pay_rzp_id">Key ID</Label>
                    {secretsMeta.has_razorpay_key_id ? (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        Current: {String(secretsMeta.razorpay_key_id_masked ?? '—')}
                      </p>
                    ) : null}
                    <div className="relative">
                      <Input
                        id="pay_rzp_id"
                        type={visibleFields.razorpay_key_id ? 'text' : 'password'}
                        autoComplete="off"
                        value={visibleFields.razorpay_key_id ? (revealedValues.razorpay_key_id ?? '') : '••••••••'}
                        onChange={(e) =>
                          setSecretsDraft((d) => ({ ...d, razorpay_key_id: e.target.value }))
                        }
                        className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm pr-10"
                        placeholder="rzp_test_xxxxxxxxxxxx"
                        data-testid="rzp-key-id-input"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => handleRevealToggle('razorpay_key_id')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Toggle visibility"
                      >
                        {visibleFields.razorpay_key_id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="pay_rzp_sk">Key secret</Label>
                    {secretsMeta.has_razorpay_key_secret ? (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        Current: {String(secretsMeta.razorpay_key_secret_masked ?? '—')}
                      </p>
                    ) : null}
                    <div className="relative">
                      <Input
                        id="pay_rzp_sk"
                        type={visibleFields.razorpay_key_secret ? 'text' : 'password'}
                        autoComplete="off"
                        value={visibleFields.razorpay_key_secret ? (revealedValues.razorpay_key_secret ?? '') : '••••••••'}
                        onChange={(e) =>
                          setSecretsDraft((d) => ({ ...d, razorpay_key_secret: e.target.value }))
                        }
                        className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm pr-10"
                        placeholder="••••••••••••••••••••"
                        data-testid="rzp-key-secret-input"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => handleRevealToggle('razorpay_key_secret')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Toggle visibility"
                      >
                        {visibleFields.razorpay_key_secret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="pay_rzp_wh">Webhook signing secret (optional)</Label>
                    {secretsMeta.has_razorpay_webhook_secret ? (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        Current: {String(secretsMeta.razorpay_webhook_secret_masked ?? '—')}
                      </p>
                    ) : null}
                    <div className="relative">
                      <Input
                        id="pay_rzp_wh"
                        type={visibleFields.razorpay_webhook_secret ? 'text' : 'password'}
                        autoComplete="off"
                        value={visibleFields.razorpay_webhook_secret ? (revealedValues.razorpay_webhook_secret ?? '') : '••••••••'}
                        onChange={(e) =>
                          setSecretsDraft((d) => ({ ...d, razorpay_webhook_secret: e.target.value }))
                        }
                        className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm pr-10"
                        placeholder="paste from Razorpay → Webhooks page"
                        data-testid="rzp-webhook-input"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => handleRevealToggle('razorpay_webhook_secret')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Toggle visibility"
                      >
                        {visibleFields.razorpay_webhook_secret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
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

                {/* PhonePe */}
                <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4" data-testid="phonepe-section">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">PhonePe (UPI & Cards)</p>
                    {secretsMeta.phonepe_merchant_id ? (
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
                    Get credentials from{' '}
                    <Link
                      href="https://developer.phonepe.com/"
                      target="_blank"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      PhonePe Developer Portal
                    </Link>
                    . Use merchant ID from your PhonePe account dashboard.
                  </p>
                  <div>
                    <Label htmlFor="pay_phonepe_mid">Merchant ID</Label>
                    {secretsMeta.phonepe_merchant_id ? (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        Current: {String(secretsMeta.phonepe_merchant_id ?? '—')}
                      </p>
                    ) : null}
                    <div className="relative">
                      <Input
                        id="pay_phonepe_mid"
                        type={visibleFields.phonepe_merchant_id ? 'text' : 'password'}
                        autoComplete="off"
                        value={secretsDraft.phonepe_merchant_id}
                        onChange={(e) =>
                          setSecretsDraft((d) => ({ ...d, phonepe_merchant_id: e.target.value }))
                        }
                        className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm pr-10"
                        placeholder="Mxxxxxx"
                        data-testid="phonepe-merchant-id-input"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => handleRevealToggle('phonepe_merchant_id')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Toggle visibility"
                      >
                        {visibleFields.phonepe_merchant_id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="pay_phonepe_sk">Salt Key</Label>
                    {secretsMeta.has_phonepe_salt_key ? (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        Current: {String(secretsMeta.phonepe_salt_key_masked ?? '—')}
                      </p>
                    ) : null}
                    <div className="relative">
                      <Input
                        id="pay_phonepe_sk"
                        type={visibleFields.phonepe_salt_key ? 'text' : 'password'}
                        autoComplete="off"
                        value={visibleFields.phonepe_salt_key ? (revealedValues.phonepe_salt_key ?? '') : '••••••••'}
                        onChange={(e) =>
                          setSecretsDraft((d) => ({ ...d, phonepe_salt_key: e.target.value }))
                        }
                        className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm pr-10"
                        placeholder="••••••••••••••••"
                        data-testid="phonepe-salt-key-input"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => handleRevealToggle('phonepe_salt_key')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Toggle visibility"
                      >
                        {visibleFields.phonepe_salt_key ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="pay_phonepe_si">Salt Index</Label>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      Current: {String(secretsMeta.phonepe_salt_index ?? '1')}
                    </p>
                    <Input
                      id="pay_phonepe_si"
                      type="text"
                      autoComplete="off"
                      value={secretsDraft.phonepe_salt_index}
                      onChange={(e) =>
                        setSecretsDraft((d) => ({ ...d, phonepe_salt_index: e.target.value }))
                      }
                      className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm"
                      placeholder="1"
                      data-testid="phonepe-salt-index-input"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pay_phonepe_wh">Webhook Secret (optional)</Label>
                    {secretsMeta.has_phonepe_webhook_secret ? (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        Current: {String(secretsMeta.phonepe_webhook_secret_masked ?? '—')}
                      </p>
                    ) : null}
                    <div className="relative">
                      <Input
                        id="pay_phonepe_wh"
                        type={visibleFields.phonepe_webhook_secret ? 'text' : 'password'}
                        autoComplete="off"
                        value={visibleFields.phonepe_webhook_secret ? (revealedValues.phonepe_webhook_secret ?? '') : '••••••••'}
                        onChange={(e) =>
                          setSecretsDraft((d) => ({ ...d, phonepe_webhook_secret: e.target.value }))
                        }
                        className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm pr-10"
                        placeholder="••••••••••••••••"
                        data-testid="phonepe-webhook-secret-input"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => handleRevealToggle('phonepe_webhook_secret')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Toggle visibility"
                      >
                        {visibleFields.phonepe_webhook_secret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Webhook URL to register in PhonePe:{' '}
                    <code className="rounded bg-muted px-1">
                      {typeof window !== 'undefined'
                        ? `${window.location.origin}/api/billing/phonepe-webhook`
                        : '<your-domain>/api/billing/phonepe-webhook'}
                    </code>
                  </p>
                </div>

                {/* Stripe (legacy) */}
                <div className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Stripe (legacy)</p>
                    <span className="rounded-full bg-amber-500/15 text-amber-300 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                      Legacy
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Kept for historical webhooks only. PhonePe (India) and Razorpay are the active gateways.
                  </p>
                  {secretsMeta.has_stripe_secret_key ? (
                    <p className="font-mono text-xs text-muted-foreground">
                      Secret key: {String(secretsMeta.stripe_secret_key_masked ?? '—')}
                    </p>
                  ) : null}
                  <div>
                    <Label htmlFor="pay_stripe_sk">Stripe secret key</Label>
                    <div className="relative">
                      <Input
                        id="pay_stripe_sk"
                        type={visibleFields.stripe_secret_key ? 'text' : 'password'}
                        autoComplete="off"
                        value={visibleFields.stripe_secret_key ? (revealedValues.stripe_secret_key ?? '') : '••••••••'}
                        onChange={(e) =>
                          setSecretsDraft((d) => ({ ...d, stripe_secret_key: e.target.value }))
                        }
                        className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm pr-10"
                        placeholder="sk_live_… or sk_test_…"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => handleRevealToggle('stripe_secret_key')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Toggle visibility"
                      >
                        {visibleFields.stripe_secret_key ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  {secretsMeta.has_stripe_webhook_secret ? (
                    <p className="font-mono text-xs text-muted-foreground">
                      Webhook secret: {String(secretsMeta.stripe_webhook_secret_masked ?? '—')}
                    </p>
                  ) : null}
                  <div>
                    <Label htmlFor="pay_stripe_wh">Stripe webhook signing secret</Label>
                    <div className="relative">
                      <Input
                        id="pay_stripe_wh"
                        type={visibleFields.stripe_webhook_secret ? 'text' : 'password'}
                        autoComplete="off"
                        value={visibleFields.stripe_webhook_secret ? (revealedValues.stripe_webhook_secret ?? '') : '••••••••'}
                        onChange={(e) =>
                          setSecretsDraft((d) => ({ ...d, stripe_webhook_secret: e.target.value }))
                        }
                        className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm pr-10"
                        placeholder="whsec_…"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => handleRevealToggle('stripe_webhook_secret')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Toggle visibility"
                      >
                        {visibleFields.stripe_webhook_secret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Stripe Checkout price IDs */}
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
                      <Label htmlFor="pay_price_pro_m">Pro — monthly</Label>
                      <Input
                        id="pay_price_pro_m"
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
                      <Label htmlFor="pay_price_pro_y">Pro — yearly</Label>
                      <Input
                        id="pay_price_pro_y"
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
                      <Label htmlFor="pay_price_ent_m">Enterprise — monthly</Label>
                      <Input
                        id="pay_price_ent_m"
                        value={secretsDraft.stripe_price_enterprise_monthly}
                        onChange={(e) =>
                          setSecretsDraft((d) => ({ ...d, stripe_price_enterprise_monthly: e.target.value }))
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
                      <Label htmlFor="pay_price_ent_y">Enterprise — yearly</Label>
                      <Input
                        id="pay_price_ent_y"
                        value={secretsDraft.stripe_price_enterprise_yearly}
                        onChange={(e) =>
                          setSecretsDraft((d) => ({ ...d, stripe_price_enterprise_yearly: e.target.value }))
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
                  {savingKey === 'payments' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save payments
                </Button>
              </div>
            </Card>
          ) : null}

          {section === 'llm' ? (
            <div className="space-y-0" data-testid="llm-section">
              <Card className="rounded-xl border-border/60 p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">AI & LLM API Keys</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-6">
                  Configure API keys. Add multiple keys separated by commas for automatic rotation on rate limits.
                  Failed providers auto-fallback: Gemini → Groq → OpenAI → Anthropic.
                </p>
                <div className="space-y-5">
                  {['gemini','opencode','groq','openrouter','openai','anthropic','nvidia'].map((provider) => {
                    const meta: Record<string,any> = {
                      gemini: { label: 'Google Gemini', placeholder: 'AIza...', url: 'https://aistudio.google.com/apikey', urlLabel: 'Google AI Studio', desc: 'Free tier. Used for code analysis, hints, and fast completions.', key: 'gemini_api_key' },
                      opencode: { label: 'OpenCode', placeholder: 'ock_...', url: 'https://opencode.ai/keys', urlLabel: 'OpenCode Keys', desc: 'Free & paid. Claude, GPT, Gemini, DeepSeek models. Free models: deepseek-v4-flash-free, mimo-v2.5-free, ling-3.0-flash-free.', key: 'opencode_api_key' },
                      groq: { label: 'Groq', placeholder: 'gsk_...', url: 'https://console.groq.com/keys', urlLabel: 'Groq Console', desc: 'Free tier. Ultra-fast inference. Llama 3.3, Mixtral, Gemma, DeepSeek R1.', key: 'groq_api_key' },
                      openrouter: { label: 'OpenRouter', placeholder: 'sk-or-...', url: 'https://openrouter.ai/keys', urlLabel: 'OpenRouter Keys', desc: 'Free & paid. Access 300+ models including free tiers of Gemini, Claude, Llama.', key: 'openrouter_api_key' },
                      openai: { label: 'OpenAI', placeholder: 'sk-...', url: 'https://platform.openai.com/api-keys', urlLabel: 'OpenAI Platform', desc: 'Paid. GPT-4o, GPT-4-turbo, o1, o3 models.', key: 'openai_api_key' },
                      anthropic: { label: 'Anthropic Claude', placeholder: 'sk-ant-...', url: 'https://console.anthropic.com', urlLabel: 'Anthropic Console', desc: 'Paid. Deep code review, agentic fixes, and chat.', key: 'anthropic_api_key' },
                      nvidia: { label: 'NVIDIA NIM', placeholder: 'nvapi-...', url: 'https://console.anthropic.com', urlLabel: 'NVIDIA NIM', desc: 'Paid. Llama 3.1, Mistral, Nemotron models via NVIDIA infrastructure.', key: 'nvidia_api_key' },
                    }
                    const info = meta[provider]
                    const keyValue = (secretsDraft as any)[info.key] || ""
                    const hasKey = (secretsMeta as any)['has_' + info.key]
                    return (
                      <div key={provider} className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">{info.label}</p>
                          {hasKey ? <span className="rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-xs uppercase">Active</span> : <span className="rounded-full bg-amber-500/15 text-amber-300 px-2 py-0.5 text-xs uppercase">Not Set</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">{info.desc} <a href={info.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{info.urlLabel}</a>.</p>
                        <div className="relative">
                          <Input type={(visibleFields as any)[info.key] ? 'text' : 'password'} autoComplete="off"
                            value={((visibleFields as any)[info.key] ? (revealedValues[info.key] ?? '') : '') || (hasKey ? '••••••••' : '')}
                            onChange={(e) => setSecretsDraft((d) => ({ ...d, [info.key]: e.target.value }))}
                            className="h-10 rounded-lg border-border/60 bg-background font-mono text-sm pr-10"
                            placeholder={info.placeholder + " (key1,key2 for rotation)"} />
                          <button type="button" tabIndex={-1} onClick={() => handleRevealToggle(info.key)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Toggle visibility">
                            {(visibleFields as any)[info.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Provider fallback order (auto-selects): Gemini → OpenCode → Groq → OpenRouter → OpenAI → Anthropic → NVIDIA.
                </p>
                <div className="flex justify-between mt-6 pt-4 border-t border-border/40">
                  <Button variant="outline" size="sm" onClick={async () => {
                    const providers = ['gemini','opencode','groq','openrouter','openai','anthropic','nvidia']
                    const results: React.ReactNode[] = []
                    for (const p of providers) {
                      try {
                        const r = await csrfFetch('/api/admin/llm-test', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ provider: p }) })
                        const d = await r.json()
                        results.push(
                          <span key={p} className="flex items-center gap-1">
                            {d.ok ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                            {p}{!d.ok ? `: ${d.error}` : ''}
                          </span>
                        )
                      } catch { 
                        results.push(
                          <span key={p} className="flex items-center gap-1">
                            <XCircle className="h-4 w-4 text-red-500" />
                            {p}: network error
                          </span>
                        ) 
                      }
                    }
                    addToast({ type: 'info', title: 'Key Test Results', message: <div className="flex flex-col gap-1.5 mt-2">{results}</div>, duration: 15000 })
                  }}>
                    <Zap className="h-3 w-3 mr-1" />Test All Keys
                  </Button>
                  <Button onClick={() => saveSecrets()} disabled={savingKey === "integrations"} className="gap-2">
                    {savingKey === "integrations" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Keys
                  </Button>
                </div>
              </Card>
              <AiAnalyticsDashboard />
            </div>
          ) : section === 'gamification' ? (
            <Card className="rounded-xl border-border/60 shadow-sm">
              <div className="border-b border-border/60 px-6 py-4">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Gamification & XP</h3>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Configure experience points, level thresholds, streaks, referrals, and badge awards.
                </p>
              </div>
              <div className="space-y-6 px-6 py-5">
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">XP Rewards</p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      { key: 'xp_submission_easy', label: 'Easy submission', default: 10 },
                      { key: 'xp_submission_medium', label: 'Medium submission', default: 25 },
                      { key: 'xp_submission_hard', label: 'Hard submission', default: 50 },
                      { key: 'xp_first_blood', label: 'First blood', default: 25 },
                      { key: 'xp_exam_pass', label: 'Assessment pass', default: 50 },
                      { key: 'xp_cert_pass', label: 'Certification pass', default: 100 },
                      { key: 'xp_codeathon', label: 'Codeathon', default: 20 },
                      { key: 'xp_hackathon', label: 'Hackathon', default: 100 },
                      { key: 'xp_daily_login', label: 'Daily login', default: 5 },
                      { key: 'xp_streak_7day', label: '7-day streak', default: 25 },
                      { key: 'xp_streak_30day', label: '30-day streak', default: 100 },
                    ].map(({ key, label, default: def }) => (
                      <div key={key}>
                        <Label className="text-xs">{label}</Label>
                        <Input
                          type="number"
                          value={String(gamification[key] ?? def)}
                          onChange={(e) => setGamification((g) => ({ ...g, [key]: Number(e.target.value) || 0 }))}
                          className="mt-1.5 h-9 rounded-lg border-border/60 bg-background text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Level Thresholds</p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      { key: 'level_2_xp', label: 'Level 2', default: 100 },
                      { key: 'level_5_xp', label: 'Level 5', default: 500 },
                      { key: 'level_10_xp', label: 'Level 10', default: 2000 },
                      { key: 'level_20_xp', label: 'Level 20', default: 8000 },
                      { key: 'level_50_xp', label: 'Level 50', default: 50000 },
                    ].map(({ key, label, default: def }) => (
                      <div key={key}>
                        <Label className="text-xs">{label} XP</Label>
                        <Input
                          type="number"
                          value={String(gamification[key] ?? def)}
                          onChange={(e) => setGamification((g) => ({ ...g, [key]: Number(e.target.value) || 0 }))}
                          className="mt-1.5 h-9 rounded-lg border-border/60 bg-background text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Streak Settings</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">Streak XP multiplier</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={String(gamification.streak_multiplier ?? 1.5)}
                        onChange={(e) => setGamification((g) => ({ ...g, streak_multiplier: Number(e.target.value) || 1 }))}
                        className="mt-1.5 h-9 rounded-lg border-border/60 bg-background text-sm"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 pt-5">
                      <div className="space-y-0.5">
                        <Label className="text-xs">Streak freeze enabled</Label>
                        <p className="text-xs text-muted-foreground">Allow users to freeze their streak</p>
                      </div>
                      <Switch
                        checked={Boolean(gamification.streak_freeze_enabled ?? true)}
                        onCheckedChange={(v) => setGamification((g) => ({ ...g, streak_freeze_enabled: v }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Referral</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">Referral XP bonus</Label>
                      <Input
                        type="number"
                        value={String(gamification.referral_xp_bonus ?? 500)}
                        onChange={(e) => setGamification((g) => ({ ...g, referral_xp_bonus: Number(e.target.value) || 0 }))}
                        className="mt-1.5 h-9 rounded-lg border-border/60 bg-background text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Referral commission %</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={String(gamification.referral_commission_percent ?? 10)}
                        onChange={(e) => setGamification((g) => ({ ...g, referral_commission_percent: Number(e.target.value) || 0 }))}
                        className="mt-1.5 h-9 rounded-lg border-border/60 bg-background text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Badges</p>
                  <div className="space-y-0 divide-y divide-border/60">
                    {[
                      { key: 'badge_hackathon_enabled', label: 'Hackathon badges', desc: 'Award badges for hackathon participation' },
                      { key: 'badge_exam_enabled', label: 'Assessment badges', desc: 'Award badges for passing assessments' },
                      { key: 'badge_cert_enabled', label: 'Certification badges', desc: 'Award badges for earning certifications' },
                      { key: 'badge_streak_enabled', label: 'Streak badges', desc: 'Award badges for maintaining streaks' },
                    ].map(({ key, label, desc }) => (
                      <div key={key} className="flex items-center justify-between gap-4 py-3">
                        <div className="space-y-0.5">
                          <Label className="text-xs text-foreground">{label}</Label>
                          <p className="text-xs text-muted-foreground">{desc}</p>
                        </div>
                        <Switch
                          checked={Boolean(gamification[key] ?? true)}
                          onCheckedChange={(v) => setGamification((g) => ({ ...g, [key]: v }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end border-t border-border/60 bg-muted/20 px-6 py-4">
                <Button
                  className="gap-2 rounded-lg"
                  onClick={() => void saveGamification()}
                  disabled={savingKey !== null}
                >
                  {savingKey === 'gamification' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save gamification
                </Button>
              </div>
            </Card>
          ) : section === 'email-templates' ? (
            <Card className="rounded-xl border-border/60 shadow-sm">
              <div className="border-b border-border/60 px-6 py-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Email templates</h3>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Preview and manage transactional email templates used by the platform.
                </p>
              </div>
              <EmailTemplatesSection />
              <div className="border-t border-border/60 px-6 py-3 text-xs text-muted-foreground">
                Email templates are defined in code and rendered server-side. To customise, edit{' '}
                <code className="rounded bg-muted px-1 text-xs">frontend/lib/email-templates.ts</code>.
              </div>
            </Card>
          ) : section === 'kyc' ? (
            <KycSettingsSection />
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


