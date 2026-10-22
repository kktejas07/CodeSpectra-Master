'use client'
import { useOrigin } from '@/hooks/use-browser-value'
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
  Upload,
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
import { LlmSettingsTabs } from '@/components/dashboard/settings/llm-settings-tabs'
import { RedisSettingsSection } from '@/components/dashboard/settings/redis-section'
import { StorageSettingsSection } from '@/components/admin/storage-settings-section'
import { WhatsAppSettingsSection } from '@/components/dashboard/settings/whatsapp-section'
import { SeoSettingsSection } from '@/components/dashboard/settings/seo-section'
import { KycSettingsSection } from '@/components/dashboard/settings/kyc-section'
import { HiringIntegrationsSection } from '@/components/dashboard/settings/hiring-integrations-section'
import { AnalyticsSettingsSection } from '@/components/dashboard/settings/analytics-section'
import { useToast } from '@/lib/toast-context'
import { SkeletonCard, SkeletonText } from '@/components/ui/skeleton-boneyard'
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
import { emailTemplatesFor, hackathonEmailTemplatesFor } from '@/lib/email-templates'
import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n/config'
import { csrfFetch } from '@/lib/csrf-fetch'
import { PageHeader } from '@/components/app/page-kit'
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
import { useAdminT } from '@/lib/i18n/admin'

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
const PRODUCT_KEYS: GeneralKey[] = ['require_email_verification', 'show_public_leaderboard', 'enforce_admin_2fa', 'admin_2fa_grace_days', 'identity_media_retention_days', 'bgv_simulated_vendor']
const CERTIFICATE_KEYS: GeneralKey[] = ['certificate_template']
const EMAIL_PROVISION_KEYS: GeneralKey[] = ['admin_new_user_email_delivery']
const MEDIA_KEYS: GeneralKey[] = ['video_player_primary_color', 'video_player_autoplay', 'video_player_muted', 'video_player_captions_default', 'video_player_logo_url', 'video_player_logo_link_url', 'video_player_default_speed', 'video_player_transcript', 'video_player_chapters', 'video_player_autoplay_next', 'video_player_pip']

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
  webpush_vapid_public_key: string
  webpush_vapid_private_key: string
  webpush_vapid_subject: string
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
  deepseek_api_key: string
  cerebras_api_key: string
  mistral_api_key: string
  cohere_api_key: string
  fireworks_api_key: string
  xai_api_key: string
  replicate_api_key: string
  elevenlabs_api_key: string
  assemblyai_api_key: string
  deepgram_api_key: string
  deepinfra_api_key: string
  novita_api_key: string
  stability_api_key: string
  fal_api_key: string
  ai21_api_key: string
  kimi_api_key: string
  lemonfox_api_key: string
  huggingface_api_key: string
  cloudflare_workers_api_key: string
  sambanova_api_key: string
  nscale_api_key: string
  chutes_api_key: string
  modelscope_api_key: string
  langchain_api_key: string
  langfuse_api_key: string
  pinecone_api_key: string
  qdrant_api_key: string
  tavily_api_key: string
  firecrawl_api_key: string
  serper_api_key: string
  jina_api_key: string
  exa_api_key: string
  notion_api_key: string
  slack_api_key: string
  google_knowledge_graph_api_key: string
  browserbase_api_key: string
  brightdata_api_key: string
  scrapingbee_api_key: string
  typesafe_api_key: string
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
  webpush_vapid_public_key: '',
  webpush_vapid_private_key: '',
  webpush_vapid_subject: '',
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
  deepseek_api_key: '',
  cerebras_api_key: '',
  mistral_api_key: '',
  cohere_api_key: '',
  fireworks_api_key: '',
  xai_api_key: '',
  replicate_api_key: '',
  elevenlabs_api_key: '',
  assemblyai_api_key: '',
  deepgram_api_key: '',
  deepinfra_api_key: '',
  novita_api_key: '',
  stability_api_key: '',
  fal_api_key: '',
  ai21_api_key: '',
  kimi_api_key: '',
  lemonfox_api_key: '',
  huggingface_api_key: '',
  cloudflare_workers_api_key: '',
  sambanova_api_key: '',
  nscale_api_key: '',
  chutes_api_key: '',
  modelscope_api_key: '',
  langchain_api_key: '',
  langfuse_api_key: '',
  pinecone_api_key: '',
  qdrant_api_key: '',
  tavily_api_key: '',
  firecrawl_api_key: '',
  serper_api_key: '',
  jina_api_key: '',
  exa_api_key: '',
  notion_api_key: '',
  slack_api_key: '',
  google_knowledge_graph_api_key: '',
  browserbase_api_key: '',
  brightdata_api_key: '',
  scrapingbee_api_key: '',
  typesafe_api_key: '',
  internal_backend_secret: '',
})

/** W4-10: the browser origin, read after mount ('<APP_URL>' until then). */
function AppOrigin() {
  return <>{useOrigin('<APP_URL>')}</>
}

function EmailTemplatesSection() {
  const { t: tx, locale } = useAdminT()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  // Emails go out in each recipient's language (lib/i18n/recipient.ts); preview any of them.
  const [previewLocale, setPreviewLocale] = useState<Locale>(locale)
  const emailTemplates = emailTemplatesFor(previewLocale)
  const hackathonEmailTemplates = hackathonEmailTemplatesFor(previewLocale)

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
      <div className="flex flex-wrap items-center gap-2 md:col-span-2">
        <label htmlFor="email-preview-locale" className="text-sm font-medium text-foreground">{tx('settings.previewLanguage')}</label>
        <select id="email-preview-locale" value={previewLocale} onChange={(e) => setPreviewLocale(e.target.value as Locale)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_META[l].native}</option>)}
        </select>
        <p className="w-full text-xs text-muted-foreground">{tx('settings.previewLanguageHint')}</p>
      </div>
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
                {expanded[tpl.id] ? tx('settings.hide') : tx('settings.preview')}
              </Button>
            </div>
            {expanded[tpl.id] && preview && (
              <div className="mt-4 rounded-lg border border-border/40 bg-background overflow-hidden">
                <div className="border-b border-border/40 bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
                  {tx('settings.subject', { subject: preview.subject })}
                </div>
                <div className="p-4 max-h-100 overflow-y-auto">
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
  const { t: tx } = useAdminT()
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
    postal_webhook_public_key: '',
    postal_webhook_secret: '',
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

  const handleExcelImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const data = await file.arrayBuffer()
      const { readSpreadsheetRows } = await import('@/lib/xlsx-lite')
      const rows = readSpreadsheetRows(data)

      // Map provider names/URLs to secret keys
      const providerMap: Record<string, string> = {
        // By name
        'openai': 'openai_api_key',
        'anthropic': 'anthropic_api_key',
        'google gemini': 'gemini_api_key',
        'gemini': 'gemini_api_key',
        'groq': 'groq_api_key',
        'openrouter': 'openrouter_api_key',
        'nvidia': 'nvidia_api_key',
        'opencode': 'opencode_api_key',
        'deepseek': 'deepseek_api_key',
        'cerebras': 'cerebras_api_key',
        'mistral': 'mistral_api_key',
        'cohere': 'cohere_api_key',
        'fireworks': 'fireworks_api_key',
        'xai': 'xai_api_key',
        'replicate': 'replicate_api_key',
        'elevenlabs': 'elevenlabs_api_key',
        'assemblyai': 'assemblyai_api_key',
        'deepgram': 'deepgram_api_key',
        'deepinfra': 'deepinfra_api_key',
        'novita': 'novita_api_key',
        'stability ai': 'stability_api_key',
        'stability': 'stability_api_key',
        'fal.ai': 'fal_api_key',
        'fal': 'fal_api_key',
        'ai21': 'ai21_api_key',
        'kimi': 'kimi_api_key',
        'lemonfox': 'lemonfox_api_key',
        'hugging face': 'huggingface_api_key',
        'huggingface': 'huggingface_api_key',
        'cloudflare workers ai': 'cloudflare_workers_api_key',
        'cloudflare': 'cloudflare_workers_api_key',
        'sambanova': 'sambanova_api_key',
        'nscale': 'nscale_api_key',
        'chutes': 'chutes_api_key',
        'modelscope': 'modelscope_api_key',
        'langchain': 'langchain_api_key',
        'langfuse': 'langfuse_api_key',
        'pinecone': 'pinecone_api_key',
        'qdrant': 'qdrant_api_key',
        'tavily': 'tavily_api_key',
        'firecrawl': 'firecrawl_api_key',
        'serper': 'serper_api_key',
        'jina ai': 'jina_api_key',
        'jina': 'jina_api_key',
        'exa': 'exa_api_key',
        'notion': 'notion_api_key',
        'slack': 'slack_api_key',
        'google knowledge graph': 'google_knowledge_graph_api_key',
        'browserbase': 'browserbase_api_key',
        'bright data': 'brightdata_api_key',
        'brightdata': 'brightdata_api_key',
        'scrapingbee': 'scrapingbee_api_key',
        // By URL/domain
        'aistudio.google.com': 'gemini_api_key',
        'console.groq.com': 'groq_api_key',
        'cloud.cerebras.ai': 'cerebras_api_key',
        'console.mistral.ai': 'mistral_api_key',
        'huggingface.co': 'huggingface_api_key',
        'openrouter.ai': 'openrouter_api_key',
        'github.com': 'openrouter_api_key',
        'build.nvidia.com': 'nvidia_api_key',
        'workers.ai': 'cloudflare_workers_api_key',
        'platform.deepseek.com': 'deepseek_api_key',
        'console.x.ai': 'xai_api_key',
        'console.anthropic.com': 'anthropic_api_key',
        'platform.openai.com': 'openai_api_key',
        'dashboard.cohere.com': 'cohere_api_key',
        'ai21.com': 'ai21_api_key',
        'bailian.console.alibabacloud.com': 'deepseek_api_key',
        'deepinfra.com': 'deepinfra_api_key',
        'fireworks.ai': 'fireworks_api_key',
        'novita.ai': 'novita_api_key',
        'replicate.com': 'replicate_api_key',
        'tavily.com': 'tavily_api_key',
        'serper.dev': 'serper_api_key',
        'exa.ai': 'exa_api_key',
        'jina.ai': 'jina_api_key',
        'firecrawl.dev': 'firecrawl_api_key',
        'console.deepgram.com': 'deepgram_api_key',
        'assemblyai.com': 'assemblyai_api_key',
        'elevenlabs.io': 'elevenlabs_api_key',
        'lemonfox.ai': 'lemonfox_api_key',
        'platform.stability.ai': 'stability_api_key',
        'ollama.com': 'openrouter_api_key',
        'platform.kimi.ai': 'kimi_api_key',
        'huggingface.co/docs/inference-providers': 'huggingface_api_key',
        'cloud.sambanova.com': 'sambanova_api_key',
        'skillboss.com': 'openrouter_api_key',
        'aionlabs.ai': 'openrouter_api_key',
      }

      let imported = 0
      const skipped: string[] = []
      const importedKeys: string[] = []

      for (const row of rows) {
        if (!Array.isArray(row)) continue
        
        // Skip empty rows
        const firstCell = String(row[0] || '').trim()
        const secondCell = String(row[1] || '').trim()
        if (!firstCell && !secondCell) continue
        
        // Skip header rows
        if (firstCell.toLowerCase() === 'provider' || firstCell.toLowerCase() === 'name' || firstCell.toLowerCase() === 's.no') continue
        
        // Get provider name and API key
        let providerName = ''
        let apiKey = ''
        
        if (row.length >= 3) {
          providerName = String(row[1] || '').trim()
          apiKey = String(row[2] || '').trim()
        } else if (row.length >= 2) {
          providerName = String(row[0] || '').trim()
          apiKey = String(row[1] || '').trim()
        }
        
        if (!providerName || !apiKey) continue
        
        // Skip entries that are clearly not API keys
        const lowerKey = apiKey.toLowerCase()
        if (lowerKey.includes('issue') || lowerKey.includes('problem') || lowerKey.includes('login') ||
            lowerKey.includes('asking') || lowerKey.includes('need subscription') ||
            lowerKey.includes('buy credits') || lowerKey.includes('not found') ||
            lowerKey.includes('no login') || lowerKey.includes('no api key') ||
            lowerKey.includes('there is no') || lowerKey.includes('site can') ||
            lowerKey.includes('password:') || lowerKey.length < 10) continue

        // Normalize provider name for matching
        const normalizedName = providerName.toLowerCase()
          .replace(/^https?:\/\//, '')  // Strip protocol
          .replace(/\s.*$/, '')  // Strip everything after first space
          .replace(/\{.*$/, '')  // Strip everything after {
          .replace(/\/.*$/, '')  // Strip path
          .trim()
        
        const secretKey = providerMap[normalizedName] || providerMap[providerName.toLowerCase().replace(/\s.*$/, '').trim()]

        if (secretKey) {
          // Append key instead of overwriting (supports multiple keys per provider)
          setSecretsDraft((d) => {
            const existing = (d as any)[secretKey] || ''
            const existingKeys = existing ? existing.split(',').map((k: string) => k.trim()).filter(Boolean) : []
            // Avoid duplicate keys
            if (!existingKeys.includes(apiKey)) {
              existingKeys.push(apiKey)
            }
            return { ...d, [secretKey]: existingKeys.join(', ') }
          })
          importedKeys.push(secretKey)
          imported++
        } else {
          skipped.push(providerName)
        }
      }

      if (imported > 0) {
        addToast({
          type: 'success',
          title: `Imported ${imported} API key${imported > 1 ? 's' : ''}`,
          message: `Keys for: ${importedKeys.join(', ')}${skipped.length > 0 ? `\nSkipped: ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '...' : ''}` : ''}`,
        })
      } else {
        addToast({ type: 'error', title: tx('settings.noMatchingProvidersFound'), message: tx('settings.checkThatYourFileHas') })
      }
    } catch (err) {
      addToast({ type: 'error', title: tx('settings.failedToParseExcelFile'), message: err instanceof Error ? err.message : 'Invalid file format' })
    }

    e.target.value = ''
  }, [addToast])

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
        addToast({ type: 'error', title: "Couldn't reload saved keys", message: secJson.error || `HTTP ${secRes.status}. Refresh the page to try again.` })
      }
    } catch {
      addToast({ type: 'error', title: "Couldn't reload saved keys", message: tx('settings.checkYourConnectionAndRefresh') })
    }
  }, [addToast])

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
        'webpush_vapid_public_key', 'webpush_vapid_subject',
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
        'postal_server', 'postal_from_email', 'postal_webhook_public_key',
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
        addToast({ type: 'success', title: tx('settings.sectionSaved') })
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
        addToast({ type: 'error', title: tx('settings.nothingToSave'), message: tx('settings.enterAtLeastOneValue') })
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
      addToast({ type: 'success', title: tx('settings.integrationsSaved') })
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
      if (mailSecretsDraft.postal_webhook_public_key.trim())
        secBody.postal_webhook_public_key = mailSecretsDraft.postal_webhook_public_key.trim()
      if (mailSecretsDraft.postal_webhook_secret.trim())
        secBody.postal_webhook_secret = mailSecretsDraft.postal_webhook_secret.trim()
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
      addToast({ type: 'success', title: tx('settings.gamificationSettingsSaved') })
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
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonText lines={4} />
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader
        illustration="settings"
        className="mb-0"
        title={tx('settings.platformSettings')}
        description={tx('settings.managePlatformBrandingEmailDelivery')}
        icon={<SettingsIcon />}
      />

      {loadError ? (
        <Alert variant="destructive" className="border-destructive/40">
          <AlertTitle>{tx('settings.couldNotLoadSavedSettings')}</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="min-w-0 space-y-6">
          {section === 'branding' ? (
        <div className="space-y-6">
        <Card className="rounded-3xl border-border/70 shadow-sm">
          <div className="border-b border-border/60 px-6 py-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Branding & support</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{tx('settings.platformNameTaglineLogoSupport')}</p>
          </div>
          <div className="space-y-4 px-6 py-5">
            <div>
              <Label htmlFor="platform_name">{tx('settings.platformName')}</Label>
              <Input
                id="platform_name"
                value={form.platform_name}
                onChange={(e) => setForm((f) => ({ ...f, platform_name: e.target.value }))}
                className="mt-1.5 h-10 rounded-lg border-border/60 bg-background"
              />
            </div>
            <div>
              <Label htmlFor="platform_tagline">{tx('settings.taglineOptional')}</Label>
              <Input
                id="platform_tagline"
                value={form.platform_tagline}
                onChange={(e) => setForm((f) => ({ ...f, platform_tagline: e.target.value }))}
                className="mt-1.5 h-10 rounded-lg border-border/60 bg-background"
                placeholder={tx('settings.shipQualitySoftwareWithConfidence')}
              />
            </div>
            <div>
              <Label htmlFor="logo_upload">{tx('settings.logoOptional')}</Label>
              <input
                id="logo_upload"
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="mt-1.5 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 2 * 1024 * 1024) { addToast({ type: 'info', title: tx('settings.notification'), message: tx('settings.imageMustBeUnder2mb') }); return }
                  const reader = new FileReader()
                  reader.onload = (ev) => setForm((f) => ({ ...f, logo_url: ev.target?.result as string || '' }))
                  reader.readAsDataURL(file)
                }}
              />
              {form.logo_url ? (
                <div className="mt-2 flex items-center gap-3">
                  <img src={form.logo_url} alt="logo preview" className="h-10 w-auto rounded border object-contain" />
                  <button onClick={() => setForm((f) => ({ ...f, logo_url: '' }))} className="text-xs text-destructive hover:underline">{tx('settings.remove')}</button>
                </div>
              ) : null}
            </div>
            <div>
              <Label htmlFor="favicon_upload">{tx('settings.faviconOptional')}</Label>
              <input
                id="favicon_upload"
                type="file"
                accept="image/png,image/x-icon,image/svg+xml,image/webp"
                className="mt-1.5 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 1 * 1024 * 1024) { addToast({ type: 'info', title: tx('settings.notification'), message: tx('settings.faviconMustBeUnder1mb') }); return }
                  const reader = new FileReader()
                  reader.onload = (ev) => setForm((f) => ({ ...f, favicon_url: ev.target?.result as string || '' }))
                  reader.readAsDataURL(file)
                }}
              />
              {form.favicon_url ? (
                <div className="mt-2 flex items-center gap-3">
                  <img src={form.favicon_url} alt="favicon preview" className="h-8 w-8 rounded border object-contain" />
                  <button onClick={() => setForm((f) => ({ ...f, favicon_url: '' }))} className="text-xs text-destructive hover:underline">{tx('settings.remove')}</button>
                </div>
              ) : null}
            </div>
            <div>
              <Label htmlFor="support_email">{tx('settings.supportEmail')}</Label>
              <Input
                id="support_email"
                type="email"
                value={form.support_email}
                onChange={(e) => setForm((f) => ({ ...f, support_email: e.target.value }))}
                className="mt-1.5 h-10 rounded-lg border-border/60 bg-background"
              />
            </div>
            <div>
              <Label htmlFor="support_link_url">{tx('settings.helpCenterOrStatusUrl')}</Label>
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
              <Label htmlFor="timezone">{tx('settings.defaultTimezone')}</Label>
              <Select
                value={form.timezone || 'UTC'}
                onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
              >
                <SelectTrigger id="timezone" className="mt-1.5 h-10 w-full rounded-lg border-border/60 text-sm">
                  <SelectValue placeholder={tx('settings.selectTimezone')} />
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
              <Label htmlFor="default_locale">{tx('settings.defaultLanguage')}</Label>
              <Select
                value={form.default_locale}
                onValueChange={(v) => setForm((f) => ({ ...f, default_locale: v }))}
              >
                <SelectTrigger id="default_locale" className="mt-1.5 h-10 w-full rounded-lg border-border/60">
                  <SelectValue placeholder={tx('settings.selectLocale')} />
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
              <Label htmlFor="platform_currency">{tx('settings.platformCurrency')}</Label>
              <Select
                value={form.platform_currency || 'USD'}
                onValueChange={(v) => setForm((f) => ({ ...f, platform_currency: v }))}
              >
                <SelectTrigger id="platform_currency" className="mt-1.5 h-10 w-full rounded-lg border-border/60 text-sm">
                  <SelectValue placeholder={tx('settings.selectCurrency')} />
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
              <p className="text-sm font-semibold text-foreground mb-3">{tx('settings.companyAndLegal')}</p>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="company_name">{tx('settings.companyName')}</Label>
                  <Input
                    id="company_name"
                    value={form.company_name}
                    onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                    className="mt-1.5 h-10 rounded-lg border-border/60 bg-background"
                    placeholder="CodeSpectra"
                  />
                </div>
                <div>
                  <Label htmlFor="website_url">{tx('settings.websiteUrl')}</Label>
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
                  <Label htmlFor="company_address">{tx('settings.companyAddress')}</Label>
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
                  <Label htmlFor="copyright_text">{tx('settings.copyrightText')}</Label>
                  <Input
                    id="copyright_text"
                    value={form.copyright_text}
                    onChange={(e) => setForm((f) => ({ ...f, copyright_text: e.target.value }))}
                    className="mt-1.5 h-10 rounded-lg border-border/60 bg-background"
                    placeholder="© 2026 CodeSpectra. All rights reserved."
                  />
                </div>
                <div>
                  <Label htmlFor="privacy_policy_url">{tx('settings.privacyPolicyUrl')}</Label>
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
                  <Label htmlFor="terms_of_service_url">{tx('settings.termsOfServiceUrl')}</Label>
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
              {tx('settings.saveBranding')}
            </Button>
          </div>
        </Card>
        </div>
      ) : null}

      {section === 'media' ? (
        <Card className="rounded-3xl border-border/70 bg-card p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{tx('settings.mediaPlayerSettings')}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {tx('settings.configureGlobalDefaultsForThe')}
              </p>
            </div>
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Video className="h-5 w-5" />
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <Label htmlFor="video_player_primary_color">{tx('settings.primaryThemeColorHex')}</Label>
              <Input
                id="video_player_primary_color"
                value={form.video_player_primary_color}
                onChange={(e) => setForm((f) => ({ ...f, video_player_primary_color: e.target.value }))}
                className="mt-1.5 h-10 rounded-lg border-border/60 bg-background"
                placeholder="#2F5BE7"
              />
            </div>
            <div>
              <Label htmlFor="video_player_default_speed">{tx('settings.defaultPlaybackSpeed')}</Label>
              <Input
                id="video_player_default_speed"
                type="number"
                min={0.25}
                max={4}
                step={0.25}
                value={form.video_player_default_speed}
                onChange={(e) => setForm((f) => ({ ...f, video_player_default_speed: Number(e.target.value) || 1 }))}
                className="mt-1.5 h-10 rounded-lg border-border/60 bg-background"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Applies when the viewer has no saved speed (their last choice is remembered per browser).
              </p>
            </div>
            <div>
              <Label htmlFor="video_player_transcript">{tx('settings.transcriptPanel')}</Label>
              <Select
                value={form.video_player_transcript}
                onValueChange={(v) => setForm((f) => ({ ...f, video_player_transcript: v as typeof f.video_player_transcript }))}
              >
                <SelectTrigger id="video_player_transcript" className="mt-1.5 h-10 w-full rounded-lg border-border/60">
                  <SelectValue placeholder={tx('settings.selectTranscriptMode')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">{tx('settings.openExpandedUnderThePlayer')}</SelectItem>
                  <SelectItem value="closed">{tx('settings.closedCollapsedViewerCanExpand')}</SelectItem>
                  <SelectItem value="off">{tx('settings.offHiddenEntirely')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col justify-center space-y-4">
              <div className="flex items-center justify-between mt-6">
                <div className="space-y-0.5">
                  <Label>{tx('settings.autoplayByDefault')}</Label>
                  <p className="text-sm text-muted-foreground">{tx('settings.startVideosAutomaticallyWhenLoaded')}</p>
                </div>
                <Switch
                  checked={form.video_player_autoplay}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, video_player_autoplay: c }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{tx('settings.mutedByDefault')}</Label>
                  <p className="text-sm text-muted-foreground">{tx('settings.startVideosWithSoundOff')}</p>
                </div>
                <Switch
                  checked={form.video_player_muted}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, video_player_muted: c }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{tx('settings.autoStartCaptions')}</Label>
                  <p className="text-sm text-muted-foreground">{tx('settings.turnEnglishSubtitlesOnBy')}</p>
                </div>
                <Switch
                  checked={form.video_player_captions_default}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, video_player_captions_default: c }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{tx('settings.chaptersTrack')}</Label>
                  <p className="text-sm text-muted-foreground">{tx('settings.showAChaptersMenuIn')}</p>
                </div>
                <Switch
                  checked={form.video_player_chapters}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, video_player_chapters: c }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{tx('settings.autoplayNextLesson')}</Label>
                  <p className="text-sm text-muted-foreground">{tx('settings.whenALessonEndsShow')}</p>
                </div>
                <Switch
                  checked={form.video_player_autoplay_next}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, video_player_autoplay_next: c }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{tx('settings.pictureInPictureButton')}</Label>
                  <p className="text-sm text-muted-foreground">{tx('settings.showThePipButtonIn')}</p>
                </div>
                <Switch
                  checked={form.video_player_pip}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, video_player_pip: c }))}
                />
              </div>
            </div>
          </div>
          <div className="mt-6 space-y-4 border-t border-border/40 pt-5">
            <p className="text-sm font-semibold text-foreground">{tx('settings.brandingOverlay')}</p>
            <div>
              <Label htmlFor="video_player_logo_url">{tx('settings.playerLogoWatermarkUrl')}</Label>
              <Input
                id="video_player_logo_url"
                type="url"
                value={form.video_player_logo_url}
                onChange={(e) => setForm((f) => ({ ...f, video_player_logo_url: e.target.value }))}
                className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm"
                placeholder="https://codespectra.ai/logo.png"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Shown in the player controls (top-left). Leave empty to hide.
              </p>
            </div>
            <div>
              <Label htmlFor="video_player_logo_link_url">{tx('settings.logoLinkUrlOptional')}</Label>
              <Input
                id="video_player_logo_link_url"
                type="url"
                value={form.video_player_logo_link_url}
                onChange={(e) => setForm((f) => ({ ...f, video_player_logo_link_url: e.target.value }))}
                className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm"
                placeholder="https://codespectra.ai"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {tx('settings.whereThePlayerLogoLinks')}
              </p>
            </div>
            {form.video_player_logo_url ? (
              <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-3">
                <img src={form.video_player_logo_url} alt="player logo preview" className="h-8 w-auto rounded object-contain" />
                <p className="text-xs text-muted-foreground">{tx('settings.logoPreview')}</p>
              </div>
            ) : null}
          </div>
          <div className="mt-6 flex justify-end">
            <Button
              className="gap-2 rounded-lg"
              onClick={() => void saveKeys(MEDIA_KEYS, 'media')}
              disabled={savingKey !== null}
            >
              {savingKey === 'media' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {tx('settings.saveMediaSettings')}
            </Button>
          </div>
        </Card>
      ) : null}

      {section === 'cloudflare' ? (
        <CloudflareSettingsSection />
      ) : null}

            {section === 'redis' ? (
              <RedisSettingsSection />
            ) : null}

            {section === 'storage' ? (
              <StorageSettingsSection />
            ) : null}

            {section === 'whatsapp' ? (
              <WhatsAppSettingsSection />
            ) : null}

            {section === 'hiring' ? (
              <HiringIntegrationsSection />
            ) : null}

            {section === 'analytics' ? (
              <AnalyticsSettingsSection />
            ) : null}

            {section === 'seo' ? (
              <SeoSettingsSection />
            ) : null}

           {section === 'mail' ? (
        <Card className="rounded-3xl border-border/70 shadow-sm">
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
              <Label htmlFor="admin_new_user_email_delivery">{tx('settings.deliveryMethod')}</Label>
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
                  <SelectValue placeholder={tx('settings.selectDelivery')} />
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
                {tx('settings.allTransactionalEmailsAreSent')}
              </p>
            </div>

            <Alert className="rounded-lg border-border/60 bg-muted/20">
              <AlertTitle className="text-sm">{tx('settings.emailTemplates')}</AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                Templates are configured in{' '}
                <Link
                  href={platformSettingsHref('email-templates')}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {tx('settings.emailTemplates')}
                </Link>
                . Set <code className="rounded bg-muted px-1 text-xs">NEXT_PUBLIC_APP_URL</code> for correct invite links.
              </AlertDescription>
            </Alert>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/15 p-4 md:col-span-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Postal</p>
                  {secretsMeta.has_postal_api_key || secretsMeta.postal_server ? (
                    <span className="rounded-full bg-green-500/15 text-green-700 dark:text-green-300 px-2 py-0.5 text-[11px] font-medium">{tx('settings.active')}</span>
                  ) : (
                    <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium">{tx('settings.notConfigured')}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {tx('settings.selfHostedPostalMailServer')}
                </p>
                {secretsMeta.has_postal_api_key ? (
                  <p className="font-mono text-xs text-muted-foreground">
                    Current key: {String(secretsMeta.postal_api_key_masked ?? '—')}
                  </p>
                ) : null}
                <div>
                  <Label htmlFor="mail_postal_server">{tx('settings.postalServerUrl')}</Label>
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
                  <Label htmlFor="mail_postal_key">{tx('settings.postalApiKey')}</Label>
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
                    <button aria-label={tx('settings.toggleVisibility')}
                      type="button"
                      tabIndex={-1}
                      onClick={() => handleRevealToggle('postal_api_key')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title={tx('settings.toggleVisibility')}
                    >
                      {visibleFields.postal_api_key ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="mail_postal_from">{tx('settings.fromAddress')}</Label>
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
                <div className="sm:col-span-2">
                  <Label htmlFor="mail_postal_webhook_key">{tx('settings.webhookSigningKeyPublic')}</Label>
                  <Input
                    id="mail_postal_webhook_key"
                    type="text"
                    autoComplete="off"
                    placeholder={tx('settings.pasteThePublicKeyFrom')}
                    value={mailSecretsDraft.postal_webhook_public_key}
                    onChange={(e) =>
                      setMailSecretsDraft((d) => ({ ...d, postal_webhook_public_key: e.target.value }))
                    }
                    className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Used to check delivery and bounce webhooks sent to /api/webhooks/postal. Instead of the key you can set a shared secret below and add ?secret=… to the webhook URL in Postal.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="mail_postal_webhook_secret">{tx('settings.webhookSharedSecretOptional')}</Label>
                  <Input
                    id="mail_postal_webhook_secret"
                    type="password"
                    autoComplete="off"
                    placeholder={secretsMeta.has_postal_webhook_secret ? 'Secret saved — enter a new value to replace' : 'Optional'}
                    value={mailSecretsDraft.postal_webhook_secret}
                    onChange={(e) =>
                      setMailSecretsDraft((d) => ({ ...d, postal_webhook_secret: e.target.value }))
                    }
                    className="mt-1.5 h-10 rounded-lg border-border/60 bg-background font-mono text-sm"
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
        <Card className="rounded-3xl border-border/70 shadow-sm">
          <div className="border-b border-border/60 px-6 py-4">
            <div className="flex items-center gap-2">
              <Sliders className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">{tx('settings.operations')}</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{tx('settings.registrationsEmailAndMaintenance')}</p>
          </div>
          <div className="space-y-0 divide-y divide-border/60 px-6 py-5">
            <div className="flex items-center justify-between gap-4 py-4">
              <div className="space-y-0.5">
                <Label htmlFor="allow_registration" className="text-foreground">
                  {tx('settings.allowRegistrations')}
                </Label>
                <p className="text-sm text-muted-foreground">{tx('settings.newUsersCanCreateAccounts')}</p>
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
                  {tx('settings.platformEmailNotifications')}
                </Label>
                <p className="text-sm text-muted-foreground">{tx('settings.systemLevelEmailsWhenMail')}</p>
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
                  {tx('settings.maintenanceMode')}
                </Label>
                <p className="text-sm text-muted-foreground">Only superadmins can sign in; everyone else sees a maintenance page</p>
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
                <p className="text-sm text-muted-foreground">{tx('settings.showSingleSignOnSaml')}</p>
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
                  {tx('settings.askCodespectraChatbot')}
                </Label>
                <p className="text-sm text-muted-foreground">{tx('settings.enableTheGlobalAiCoding')}</p>
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
              {tx('settings.saveOperations')}
            </Button>
          </div>
        </Card>
          ) : null}

          {section === 'product' ? (
        <Card className="rounded-3xl border-border/70 shadow-sm">
          <div className="border-b border-border/60 px-6 py-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Product & access</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {tx('settings.signUpFlowsLeaderboardVisibility')}
            </p>
          </div>
          <div className="grid gap-0 divide-y divide-border/60 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <div className="flex items-center justify-between gap-4 p-6">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="require_email_verification" className="text-foreground">
                  {tx('settings.requireEmailVerification')}
                </Label>
                <p className="text-sm text-muted-foreground">{tx('settings.emailSignUpsMustClick')}</p>
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
                  {tx('settings.publicLeaderboard')}
                </Label>
                <p className="text-sm text-muted-foreground">{tx('settings.showOrgWideRankingsTo')}</p>
              </div>
              <Switch
                id="show_public_leaderboard"
                checked={form.show_public_leaderboard}
                onCheckedChange={(v) => setForm((f) => ({ ...f, show_public_leaderboard: v }))}
              />
            </div>
            <div className="flex items-center justify-between gap-4 p-6">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="enforce_admin_2fa" className="text-foreground">
                  {tx('settings.require2faForAdmins')}
                </Label>
                <p className="text-sm text-muted-foreground">{tx('settings.superadminsAndOrganisationAdminsMust')}</p>
              </div>
              <Switch
                id="enforce_admin_2fa"
                checked={form.enforce_admin_2fa}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enforce_admin_2fa: v }))}
              />
            </div>
            <div className="flex items-center justify-between gap-4 p-6">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="admin_2fa_grace_days" className="text-foreground">
                  2FA grace period (days)
                </Label>
                <p className="text-sm text-muted-foreground">{tx('settings.howLongAnAdminCan')}</p>
              </div>
              <Input
                id="admin_2fa_grace_days"
                type="number"
                min={0}
                max={90}
                className="w-24 rounded-lg tabular-nums"
                value={String(form.admin_2fa_grace_days ?? 14)}
                onChange={(e) => setForm((f) => ({ ...f, admin_2fa_grace_days: Number(e.target.value) }))}
              />
            </div>
            <div className="flex items-center justify-between gap-4 p-6">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="identity_media_retention_days" className="text-foreground">
                  Keep ID photos, selfies and session recordings (days)
                </Label>
                <p className="text-sm text-muted-foreground">{tx('settings.examIdentityPhotosFaceScans')}</p>
              </div>
              <Input
                id="identity_media_retention_days"
                type="number"
                min={1}
                max={3650}
                className="w-24 rounded-lg tabular-nums"
                value={String(form.identity_media_retention_days ?? 180)}
                onChange={(e) => setForm((f) => ({ ...f, identity_media_retention_days: Number(e.target.value) }))}
              />
            </div>
            <div className="flex items-center justify-between gap-4 p-6">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="bgv_simulated_vendor" className="text-foreground">
                  {tx('settings.demoBackgroundCheckVendor')}
                </Label>
                <p className="text-sm text-muted-foreground">{tx('settings.offerTheSimulatedVendorFake')}</p>
              </div>
              <Switch
                id="bgv_simulated_vendor"
                checked={form.bgv_simulated_vendor}
                onCheckedChange={(v) => setForm((f) => ({ ...f, bgv_simulated_vendor: v }))}
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
        <Card className="rounded-3xl border-border/70 shadow-sm">
          <div className="border-b border-border/60 px-6 py-4">
            <div className="flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">{tx('settings.certificates')}</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {tx('settings.chooseTheDefaultCertificateTemplate')}
            </p>
          </div>
          <div className="space-y-6 p-6">
            <div className="space-y-4">
              <div className="min-w-0 space-y-0.5">
                <Label className="text-foreground">{tx('settings.defaultTemplate')}</Label>
                <p className="text-sm text-muted-foreground">{tx('settings.thisTemplateIsUsedWhen')}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                            t.key === 'modern' ? 'bg-primary' : 'bg-neutral-800'
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
                  {tx('settings.preview')}
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
              <DialogContent className="max-w-[95vw]! w-350! max-h-[95vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Certificate Preview — {TEMPLATES.find((t) => t.key === previewTemplate)?.label || previewTemplate}</DialogTitle>
                  <DialogDescription>
                    {tx('settings.thisIsHowTheCertificate')}
                  </DialogDescription>
                </DialogHeader>
                {previewTemplate && (
                  <div className="w-full max-w-275 mx-auto">
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
              {tx('settings.saveCertificateSettings')}
            </Button>
          </div>
        </Card>
          ) : null}

          {section === 'integrations' ? (
            <Card className="rounded-3xl border-border/70 shadow-sm">
              <div className="border-b border-border/60 px-6 py-4">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">{tx('settings.integrations')}</h3>
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
                    <p className="text-sm font-semibold text-foreground">{tx('settings.trustedOriginsCorsCsrf')}</p>
                    <div className="flex items-center gap-2">
                      {secretsMeta.trusted_origins_extra ? (
                        <span className="rounded-full bg-green-500/15 text-green-700 dark:text-green-300 px-2 py-0.5 text-[11px] font-medium">{tx('settings.active')}</span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium">{tx('settings.notConfigured')}</span>
                      )}
                      <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[11px] font-medium">{tx('settings.dynamic')}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tx('settings.controlsWhichExternalDomainsAre')}
                    CORS (Cross-Origin Resource Sharing) governs browser-initiated requests from other sites.
                    CSRF (Cross-Site Request Forgery) tokens protect state-changing operations like login and signup.
                    Add any staging, preview, or custom-domain URLs that need to reach <code className="rounded bg-muted px-1">/api/auth/*</code>.
                    {tx('settings.onePerLineOrComma')}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Trailing slashes stripped. Only <code>http://</code> and <code>https://</code> origins accepted.
                    {tx('settings.yourProductionDomainIsAutomatically')}
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
                    <p className="text-sm font-semibold text-foreground">{tx('settings.codeExecutionBackendPiston')}</p>
                    <div className="flex items-center gap-2">
                      {secretsMeta.piston_url ? (
                        <span className="rounded-full bg-green-500/15 text-green-700 dark:text-green-300 px-2 py-0.5 text-[11px] font-medium">{tx('settings.active')}</span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium">{tx('settings.inProcess')}</span>
                      )}
                      <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[11px] font-medium">{tx('settings.dynamic')}</span>
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
                      <label className="text-xs font-medium text-muted-foreground">
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
                      <label className="text-xs font-medium text-muted-foreground">
                        {tx('settings.maxConcurrentJobs')}
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
                    <p className="text-sm font-semibold text-foreground">{tx('settings.githubAppPatToken')}</p>
                    <div className="flex items-center gap-2">
                      {secretsMeta.has_github_app_token ? (
                        <span className="rounded-full bg-green-500/15 text-green-700 dark:text-green-300 px-2 py-0.5 text-[11px] font-medium">{tx('settings.active')}</span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium">{tx('settings.notConfigured')}</span>
                      )}
                      <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[11px] font-medium">{tx('settings.dynamic')}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Personal access token used by the AI code-review bot to{' '}
                    <strong>{tx('settings.postReviewCommentsBackTo')}</strong>. Needs{' '}
                    <code>pull_requests:write</code> on the repos you want reviewed.
                    {tx('settings.withoutThisReviewsAreSaved')}
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
                    <button aria-label={tx('settings.toggleVisibility')}
                      type="button"
                      tabIndex={-1}
                      onClick={() => handleRevealToggle('github_app_token')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title={tx('settings.toggleVisibility')}
                    >
                      {visibleFields.github_app_token ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Internal backend auth secret (frontend copy of INTERNAL_BACKEND_SECRET) */}
                <div className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-4" data-testid="internal-secret-section">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{tx('settings.internalBackendAuthSecret')}</p>
                    <div className="flex items-center gap-2">
                      {secretsMeta.has_internal_backend_secret ? (
                        <span className="rounded-full bg-green-500/15 text-green-700 dark:text-green-300 px-2 py-0.5 text-[11px] font-medium">{tx('settings.active')}</span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium">{tx('settings.notConfigured')}</span>
                      )}
                      <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[11px] font-medium">{tx('settings.dynamic')}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Shared secret sent as <code>x-internal-secret</code> on server-to-server calls
                    to the FastAPI backend (<code>/internal/*</code> {tx('settings.routes')} <strong>Must match the
                    backend's <code>INTERNAL_BACKEND_SECRET</code> {tx('settings.environmentVariable')}</strong> set in
                    {tx('settings.dokployThisFieldOnlyControls')}
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
                      placeholder={tx('settings.leaveBlankToKeepDokploy')}
                      className="font-mono pr-10"
                      autoComplete="off"
                    />
                    <button aria-label={tx('settings.toggleVisibility')}
                      type="button"
                      tabIndex={-1}
                      onClick={() => handleRevealToggle('internal_backend_secret')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title={tx('settings.toggleVisibility')}
                    >
                      {visibleFields.internal_backend_secret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* TypeSafe Jev (grade verification second opinion) */}
                <div className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-4" data-testid="jev-section">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{tx('settings.secondOpinionGradeCheck')} <span className="font-normal text-muted-foreground">(TypeSafe Jev)</span></p>
                    <div className="flex items-center gap-2">
                      {secretsMeta.has_typesafe_api_key ? (
                        <span className="rounded-full bg-green-500/15 text-green-700 dark:text-green-300 px-2 py-0.5 text-[11px] font-medium">{tx('settings.active')}</span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium">{tx('settings.notConfigured')}</span>
                      )}
                      <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[11px] font-medium">{tx('settings.dynamic')}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A second AI model (TypeSafe Jev) double-checks each AI grade on written and
                    code answers. If it disagrees, the answer is flagged for a person to review. It
                    never changes a score on its own. Get a key from{' '}
                    <code>console.typesafe.ai → Settings → Keys</code>. Without a key, written
                    answers are still graded, but every one is flagged for a person to review.
                    Recruiters see this as &ldquo;Second-opinion check&rdquo; on results pages.
                  </p>
                  {secretsMeta.has_typesafe_api_key ? (
                    <p className="font-mono text-[11px] text-muted-foreground">
                      Current key: {String(secretsMeta.typesafe_api_key_masked ?? '—')}
                    </p>
                  ) : null}
                  <div className="relative">
                    <Input
                      id="sec_typesafe_api_key"
                      type={visibleFields.typesafe_api_key ? 'text' : 'password'}
                      value={visibleFields.typesafe_api_key ? (revealedValues.typesafe_api_key ?? '') : '••••••••'}
                      onChange={(e) =>
                        setSecretsDraft((d) => ({ ...d, typesafe_api_key: e.target.value }))
                      }
                      placeholder="ts_…  (leave blank to keep saved key)"
                      className="font-mono pr-10"
                      data-testid="jev-key-input"
                      autoComplete="off"
                    />
                    <button aria-label={tx('settings.toggleVisibility')}
                      type="button"
                      tabIndex={-1}
                      onClick={() => handleRevealToggle('typesafe_api_key')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title={tx('settings.toggleVisibility')}
                    >
                      {visibleFields.typesafe_api_key ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* GitHub OAuth App (per-user "Connect GitHub" flow) */}
                <div className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-4" data-testid="github-oauth-section">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{tx('settings.githubOauthAppPerUser')}</p>
                    <div className="flex items-center gap-2">
                      {secretsMeta.github_client_id ? (
                        <span className="rounded-full bg-green-500/15 text-green-700 dark:text-green-300 px-2 py-0.5 text-[11px] font-medium">{tx('settings.active')}</span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium">{tx('settings.notConfigured')}</span>
                      )}
                      <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[11px] font-medium">{tx('settings.dynamic')}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tx('settings.letsEachUserAuthoriseCodespectra')}
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
                      <AppOrigin />
                      /api/github/oauth/callback
                    </code>
                    .
                  </p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">
                        Client ID
                      </label>
                      <Input aria-label={tx('settings.clientId')}
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
                      <label className="text-xs font-medium text-muted-foreground">
                        {tx('settings.clientSecret')}
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
                        <button aria-label={tx('settings.toggleVisibility')}
                          type="button"
                          tabIndex={-1}
                          onClick={() => handleRevealToggle('github_client_secret')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title={tx('settings.toggleVisibility')}
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
                      <p className="text-sm font-semibold text-foreground">{tx('settings.firebaseAuthSdk')}</p>
                    </div>
                    {secretsMeta.firebase_api_key &&
                    secretsMeta.firebase_auth_domain &&
                    secretsMeta.firebase_project_id &&
                    secretsMeta.firebase_app_id ? (
                      <span className="rounded-full bg-green-500/15 text-green-700 dark:text-green-300 px-2.5 py-0.5 text-[11px] font-medium">
                        ✓ Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2.5 py-0.5 text-[11px] font-medium">
                        {tx('settings.notConfigured')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {tx('settings.clientSideFirebaseConfigUsed')}
                    browser — no build-time env vars or redeploy needed. Find these values in your{' '}
                    <a
                      href="https://console.firebase.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {tx('settings.firebaseConsoleProjectSettingsGeneral')}
                    </a>
                    . Admin SDK credentials (service account) must still be set as environment variables on the server.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[
                      { key: 'firebase_api_key', label: 'API key', ph: 'AIzaSy…' },
                      { key: 'firebase_auth_domain', label: 'Auth domain', ph: 'your-project.firebaseapp.com' },
                      { key: 'firebase_project_id', label: 'Project ID', ph: 'your-project' },
                      { key: 'firebase_storage_bucket', label: 'Storage bucket', ph: 'your-project.appspot.com' },
                      { key: 'firebase_messaging_sender_id', label: 'Messaging sender ID', ph: '123456789012' },
                      { key: 'firebase_app_id', label: 'App ID', ph: '1:123456789012:web:abc123' },
                      { key: 'firebase_vapid_key', label: 'Web push VAPID key', ph: 'BL…' },
                      // PWA web push (docs/pwa.md): generate with `npx web-push generate-vapid-keys`
                      { key: 'webpush_vapid_public_key', label: 'App push public key (VAPID)', ph: 'BP…' },
                      { key: 'webpush_vapid_private_key', label: 'App push private key (VAPID)', ph: 'secret' },
                      { key: 'webpush_vapid_subject', label: 'App push contact', ph: 'mailto:support@codespectra.ai' },
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
                          <button aria-label={tx('settings.toggleVisibility')}
                            type="button"
                            tabIndex={-1}
                            onClick={() => toggleVisible(key)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title={tx('settings.toggleVisibility')}
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
                  {tx('settings.saveIntegrations')}
                </Button>
              </div>
            </Card>
          ) : null}
          {section === 'payments' ? (
            <Card className="rounded-3xl border-border/70 shadow-sm">
              <div className="border-b border-border/60 px-6 py-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Payments &amp; billing</h3>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Configure <strong>PhonePe</strong> {tx('settings.indiaPrimary')} <strong>Razorpay</strong>{tx('settings.andLegacy')} <strong>Stripe</strong> credentials below. Keys are stored encrypted at
                  rest in MongoDB and read by every payment endpoint — no redeploy required.
                </p>
              </div>
              <div className="space-y-6 px-6 py-5">

                {/* Razorpay — primary payment gateway */}
                <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4" data-testid="rzp-section">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{tx('settings.razorpayPrimary')}</p>
                    {secretsMeta.has_razorpay_key_id && secretsMeta.has_razorpay_key_secret ? (
                      <span className="rounded-full bg-green-500/15 text-green-700 dark:text-green-300 px-2 py-0.5 text-[11px] font-medium">
                        ✓ Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium">
                        {tx('settings.notConfigured')}
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
                      {tx('settings.razorpayDashboardSettingsApiKeys')}
                    </Link>
                    . Use <code className="rounded bg-muted px-1">rzp_test_…</code> for development.
                  </p>
                  <div>
                    <Label htmlFor="pay_rzp_id">{tx('settings.keyId')}</Label>
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
                      <button aria-label={tx('settings.toggleVisibility')}
                        type="button"
                        tabIndex={-1}
                        onClick={() => handleRevealToggle('razorpay_key_id')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title={tx('settings.toggleVisibility')}
                      >
                        {visibleFields.razorpay_key_id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="pay_rzp_sk">{tx('settings.keySecret')}</Label>
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
                      <button aria-label={tx('settings.toggleVisibility')}
                        type="button"
                        tabIndex={-1}
                        onClick={() => handleRevealToggle('razorpay_key_secret')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title={tx('settings.toggleVisibility')}
                      >
                        {visibleFields.razorpay_key_secret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="pay_rzp_wh">{tx('settings.webhookSigningSecretOptional')}</Label>
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
                        placeholder={tx('settings.pasteFromRazorpayWebhooksPage')}
                        data-testid="rzp-webhook-input"
                      />
                      <button aria-label={tx('settings.toggleVisibility')}
                        type="button"
                        tabIndex={-1}
                        onClick={() => handleRevealToggle('razorpay_webhook_secret')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title={tx('settings.toggleVisibility')}
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
                    <p className="text-sm font-semibold text-foreground">PhonePe (UPI & cards)</p>
                    {secretsMeta.phonepe_merchant_id ? (
                      <span className="rounded-full bg-green-500/15 text-green-700 dark:text-green-300 px-2 py-0.5 text-[11px] font-medium">
                        ✓ Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium">
                        {tx('settings.notConfigured')}
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
                      {tx('settings.phonepeDeveloperPortal')}
                    </Link>
                    . Use merchant ID from your PhonePe account dashboard.
                  </p>
                  <div>
                    <Label htmlFor="pay_phonepe_mid">{tx('settings.merchantId')}</Label>
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
                      <button aria-label={tx('settings.toggleVisibility')}
                        type="button"
                        tabIndex={-1}
                        onClick={() => handleRevealToggle('phonepe_merchant_id')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title={tx('settings.toggleVisibility')}
                      >
                        {visibleFields.phonepe_merchant_id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="pay_phonepe_sk">{tx('settings.saltKey')}</Label>
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
                      <button aria-label={tx('settings.toggleVisibility')}
                        type="button"
                        tabIndex={-1}
                        onClick={() => handleRevealToggle('phonepe_salt_key')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title={tx('settings.toggleVisibility')}
                      >
                        {visibleFields.phonepe_salt_key ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="pay_phonepe_si">{tx('settings.saltIndex')}</Label>
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
                    <Label htmlFor="pay_phonepe_wh">{tx('settings.webhookSecretOptional')}</Label>
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
                      <button aria-label={tx('settings.toggleVisibility')}
                        type="button"
                        tabIndex={-1}
                        onClick={() => handleRevealToggle('phonepe_webhook_secret')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title={tx('settings.toggleVisibility')}
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
                    <p className="text-sm font-semibold text-foreground">{tx('settings.stripeLegacy')}</p>
                    <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium">
                      {tx('settings.legacy')}
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
                    <Label htmlFor="pay_stripe_sk">{tx('settings.stripeSecretKey')}</Label>
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
                      <button aria-label={tx('settings.toggleVisibility')}
                        type="button"
                        tabIndex={-1}
                        onClick={() => handleRevealToggle('stripe_secret_key')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title={tx('settings.toggleVisibility')}
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
                    <Label htmlFor="pay_stripe_wh">{tx('settings.stripeWebhookSigningSecret')}</Label>
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
                      <button aria-label={tx('settings.toggleVisibility')}
                        type="button"
                        tabIndex={-1}
                        onClick={() => handleRevealToggle('stripe_webhook_secret')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title={tx('settings.toggleVisibility')}
                      >
                        {visibleFields.stripe_webhook_secret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Stripe Checkout price IDs */}
                <div className="space-y-4 border-t border-border/40 pt-6">
                  <p className="text-sm font-medium text-foreground">{tx('settings.stripeCheckoutPriceIds')}</p>
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
                      <AlertTitle className="text-sm">{tx('settings.invalidStoredPriceIds')}</AlertTitle>
                      <AlertDescription className="text-xs">
                        Replace non-Stripe values below with real <code className="rounded bg-muted px-1">price_…</code>{' '}
                        {tx('settings.idsAndSave')}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="pay_price_pro_m">{tx('settings.proMonthly')}</Label>
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
                      <Label htmlFor="pay_price_pro_y">{tx('settings.proYearly')}</Label>
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
                      <Label htmlFor="pay_price_ent_m">{tx('settings.enterpriseMonthly')}</Label>
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
                      <Label htmlFor="pay_price_ent_y">{tx('settings.enterpriseYearly')}</Label>
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
                  {tx('settings.savePayments')}
                </Button>
              </div>
            </Card>
          ) : null}

          {section === 'llm' ? (
            <div className="space-y-0" data-testid="llm-section">
              <Card className="rounded-3xl border-border/70 p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">AI & LLM configuration</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-6">
                  {tx('settings.configureApiKeysViewUsage')}
                </p>
              </Card>
              <LlmSettingsTabs />
            </div>
          ) : section === 'gamification' ? (
            <Card className="rounded-3xl border-border/70 shadow-sm">
              <div className="border-b border-border/60 px-6 py-4">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Gamification & XP</h3>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {tx('settings.configureExperiencePointsLevelThresholds')}
                </p>
              </div>
              <div className="space-y-6 px-6 py-5">
                <div className="space-y-4">
                  <p className="text-sm font-semibold text-foreground">{tx('settings.xpRewards')}</p>
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
                  <p className="text-sm font-semibold text-foreground">{tx('settings.levelThresholds')}</p>
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
                        <Input aria-label="XP"
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
                  <p className="text-sm font-semibold text-foreground">{tx('settings.streakSettings')}</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">{tx('settings.streakXpMultiplier')}</Label>
                      <p className="text-xs text-muted-foreground">{tx('settings.dailyLoginXpIsMultiplied')}</p>
                      <Input aria-label={tx('settings.streakXpMultiplier')}
                        type="number"
                        step="0.1"
                        value={String(gamification.streak_multiplier ?? 1.5)}
                        onChange={(e) => setGamification((g) => ({ ...g, streak_multiplier: Number(e.target.value) || 1 }))}
                        className="mt-1.5 h-9 rounded-lg border-border/60 bg-background text-sm"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 pt-5">
                      <div className="space-y-0.5">
                        <Label className="text-xs">{tx('settings.streakFreezeEnabled')}</Label>
                        <p className="text-xs text-muted-foreground">Users earn a freeze every 7 streak days (up to 2); each one covers a missed day</p>
                      </div>
                      <Switch
                        checked={Boolean(gamification.streak_freeze_enabled ?? true)}
                        onCheckedChange={(v) => setGamification((g) => ({ ...g, streak_freeze_enabled: v }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-sm font-semibold text-foreground">{tx('settings.referral')}</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">{tx('settings.referralXpBonus')}</Label>
                      <Input aria-label={tx('settings.referralXpBonus')}
                        type="number"
                        value={String(gamification.referral_xp_bonus ?? 500)}
                        onChange={(e) => setGamification((g) => ({ ...g, referral_xp_bonus: Number(e.target.value) || 0 }))}
                        className="mt-1.5 h-9 rounded-lg border-border/60 bg-background text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{tx('settings.referralCommission')}</Label>
                      <Input aria-label={tx('settings.referralCommission')}
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
                  <p className="text-sm font-semibold text-foreground">{tx('settings.badges')}</p>
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
                  {tx('settings.saveGamification')}
                </Button>
              </div>
            </Card>
          ) : section === 'email-templates' ? (
            <Card className="rounded-3xl border-border/70 shadow-sm">
              <div className="border-b border-border/60 px-6 py-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">{tx('settings.emailTemplates')}</h3>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {tx('settings.previewAndManageTransactionalEmail')}
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
  const { t: tx } = useAdminT()
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {tx('settings.loadingSettings')}
        </div>
      }
    >
      <SystemSettingsInner />
    </Suspense>
  )
}


