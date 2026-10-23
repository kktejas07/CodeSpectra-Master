/**
 * Dynamic integration secrets stored in MongoDB (`platform_settings` collection
 * under key `secrets`). Read by API routes (Razorpay, email providers, …) so
 * admins can rotate credentials from `/dashboard/admin/settings` without
 * touching .env files or redeploying.
 *
 * Fallback chain at runtime:
 *   1. value from MongoDB cache (admin-saved)
 *   2. value from process.env
 *
 * SECRET_FIELDS are AES-GCM encrypted at rest (lib/secrets-crypto.ts, key from
 * SECRETS_ENCRYPTION_KEY env). Reads decrypt transparently; plain-text values
 * left from before encryption are re-written encrypted on first read (lazy
 * migration) and on every write. Callers always see plain values.
 */
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { decryptSecretsRecord, decryptWithOneKey, encryptSecretValue, encryptSecretsRecord, isEncryptedSecret, secretsEncryptionKey } from '@/lib/secrets-crypto'
import { SECRET_FIELDS } from '@/lib/server-secrets-fields'

export const SERVER_SECRETS_PLATFORM_KEY = 'secrets'

export type ServerSecretsRecord = {
  // --- Postal -----------------------------------------------------------
  postal_server?: string
  postal_api_key?: string
  postal_from_email?: string
  postal_webhook_secret?: string
  postal_webhook_public_key?: string // RSA public key Postal signs webhooks with (not secret)
  // --- Razorpay -----------------------------------------------------------
  razorpay_key_id?: string
  razorpay_key_secret?: string
  razorpay_webhook_secret?: string
  // --- Better Auth runtime trusted origins (comma- or newline-separated) --
  trusted_origins_extra?: string
  // --- Code execution backend (Piston-compatible URL, no trailing slash) -
  piston_url?: string
  piston_run_timeout_ms?: string
  piston_max_concurrent?: string
  // --- GitHub App (PR-comment posting) -----------------------------------
  github_app_token?: string
  // --- GitHub OAuth App (lets users connect their account) ---------------
  github_client_id?: string
  github_client_secret?: string
  // --- Legacy Stripe (kept for back-compat reads only) -------------------
  stripe_secret_key?: string
  stripe_webhook_secret?: string
  stripe_price_pro_monthly?: string
  stripe_price_pro_yearly?: string
  stripe_price_enterprise_monthly?: string
  stripe_price_enterprise_yearly?: string
  // --- Firebase client config (superadmin settings UI, no redeploy) ----
  firebase_api_key?: string
  firebase_auth_domain?: string
  firebase_project_id?: string
  firebase_storage_bucket?: string
  firebase_messaging_sender_id?: string
  firebase_app_id?: string
  firebase_vapid_key?: string
  // --- Android app (Play Integrity) — lib/mobile/play-integrity.ts ----------
  play_integrity_service_account_json?: string
  android_package_names?: string
  android_cert_sha256?: string
  android_sha256_cert_fingerprints?: string // CORE-043 assetlinks.json
  // --- iOS app (App Attest / DeviceCheck) — lib/mobile/app-attest.ts ---------
  apple_team_id?: string
  ios_bundle_ids?: string
  ios_app_attest_allow_development?: string
  apple_app_attest_root_ca_pem?: string
  apple_devicecheck_key_id?: string
  apple_devicecheck_private_key?: string
  // --- Web push (VAPID, PWA — docs/pwa.md). Env fallback VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT.
  webpush_vapid_public_key?: string
  webpush_vapid_private_key?: string
  webpush_vapid_subject?: string
  // --- AI / LLM providers ------------------------------------------------
  anthropic_api_key?: string    // Direct Anthropic key (Claude)
  gemini_api_key?: string       // Direct Google key (Gemini — has free tier)
  openai_api_key?: string       // Direct OpenAI key (GPT — used by interview service)
  openrouter_api_key?: string   // OpenRouter API key
  opencode_api_key?: string     // OpenCode API key
  groq_api_key?: string           // Groq API key (fast inference)
  nvidia_api_key?: string        // NVIDIA NIM API key
  // --- Extended AI providers (offered in Settings → LLM; saved via server-secrets PATCH) --
  deepseek_api_key?: string
  cerebras_api_key?: string
  mistral_api_key?: string
  cohere_api_key?: string
  fireworks_api_key?: string
  xai_api_key?: string
  replicate_api_key?: string
  huggingface_api_key?: string
  elevenlabs_api_key?: string
  assemblyai_api_key?: string
  deepgram_api_key?: string
  pinecone_api_key?: string
  qdrant_api_key?: string
  tavily_api_key?: string
  firecrawl_api_key?: string
  serper_api_key?: string
  jina_api_key?: string
  exa_api_key?: string
  langchain_api_key?: string
  langfuse_api_key?: string
  notion_api_key?: string
  slack_api_key?: string
  stability_api_key?: string
  fal_api_key?: string
  deepinfra_api_key?: string
  novita_api_key?: string
  ai21_api_key?: string
  kimi_api_key?: string
  lemonfox_api_key?: string
  cloudflare_workers_api_key?: string
  sambanova_api_key?: string
  nscale_api_key?: string
  chutes_api_key?: string
  modelscope_api_key?: string
  google_knowledge_graph_api_key?: string
  browserbase_api_key?: string
  brightdata_api_key?: string
  scrapingbee_api_key?: string
  // --- Upstash Redis (rate limiting) -------------------------------------
  upstash_redis_rest_url?: string
  upstash_redis_rest_token?: string
  // --- Session signing (frontend JWT fallback when SESSION_SECRET env is missing) ----
  session_secret?: string
  // --- Cloudflare --------------------------------------------------------
  cloudflare_zone_id?: string
  cloudflare_api_token?: string
  r2_account_id?: string
  r2_access_key_id?: string
  r2_secret_access_key?: string
  r2_bucket?: string
  s3_provider?: string
  s3_endpoint?: string
  s3_region?: string
  s3_bucket?: string
  s3_access_key_id?: string
  s3_secret_access_key?: string
  // --- Private uploads bucket (lib/storage/config.ts; env UPLOADS_S3_*) ----
  uploads_s3_bucket?: string
  uploads_s3_region?: string
  uploads_s3_endpoint?: string           // empty = AWS S3
  uploads_s3_force_path_style?: string   // 'true' for MinIO
  uploads_s3_access_key_id?: string      // empty = IAM role / default chain
  uploads_s3_secret_access_key?: string
  uploads_s3_kms_key_id?: string
  uploads_s3_sse?: string                // AES256 | aws:kms | none
  uploads_s3_pending_tag?: string        // 'false' on R2 (no object tagging)
  uploads_allow_unscanned?: string       // comma-separated storage features (admin override, default none)
  // --- PhonePe -----------------------------------------------------------
  phonepe_merchant_id?: string
  phonepe_salt_key?: string
  phonepe_salt_index?: string
  phonepe_webhook_secret?: string
  // --- OpenWA / WhatsApp -------------------------------------------------
  openwa_base_url?: string        // e.g. https://your-openwa-server.com
  openwa_api_key?: string         // API key for authentication
  openwa_session_id?: string      // WhatsApp session ID
  openwa_default_country_code?: string // e.g. 91 for India
  openwa_max_concurrency?: string // Max concurrent sends (default: 3)
  openwa_send_delay_ms?: string   // Delay between sends in ms (default: 400)
  // --- ATS bot screening (lib/ats/screening/config.ts) ---------------------
  meta_whatsapp_access_token?: string   // System-user token with whatsapp_business_messaging (+ calling)
  meta_whatsapp_app_secret?: string     // Verifies X-Hub-Signature-256 on the webhook
  meta_whatsapp_verify_token?: string   // Webhook GET hub.verify_token
  meta_whatsapp_phone_number_id?: string // Platform default sender
  meta_whatsapp_waba_id?: string
  meta_whatsapp_graph_version?: string  // default v23.0
  meta_whatsapp_template_chat?: string  // approved template: consent + start chat screening
  meta_whatsapp_template_call?: string  // approved template: consent for a screening call
  meta_whatsapp_template_language?: string
  meta_whatsapp_call_mode?: string      // 'sip' (default) | 'graph'
  meta_whatsapp_template_status?: string // approved template: ATS stage update (4 body vars)
  vapi_api_key?: string
  vapi_webhook_secret?: string
  vapi_phone_number_ids?: string        // "IN=<id>, US=<id>, *=<id>"
  vapi_whatsapp_trunk_number_id?: string // Vapi BYO SIP trunk number → wa.meta.vc
  voice_agent_sip_uri?: string          // SIP server set on WhatsApp numbers (sip:agent.example.com:5061)
  voice_agent_webhook_url?: string      // generic SIP agent dialer (e.g. LiveKit agent service)
  voice_agent_webhook_secret?: string
  twilio_auth_token?: string
  exotel_webhook_token?: string
  // --- ATS meetings: platform OAuth apps (lib/ats/interviews/integrations.ts) --
  ats_google_client_id?: string
  ats_google_client_secret?: string
  ats_microsoft_client_id?: string
  ats_microsoft_client_secret?: string
  ats_microsoft_tenant?: string         // directory ID/domain; default 'common'
  // --- ATS built-in video (lib/ats/interviews/livekit.ts) --------------------
  livekit_url?: string                  // wss://… (browser-facing)
  livekit_api_key?: string
  livekit_api_secret?: string
  // --- Internal backend auth (frontend-side copy of INTERNAL_BACKEND_SECRET) --
  // Sent as `x-internal-secret` on server->server calls to the FastAPI backend.
  // Must match the backend's INTERNAL_BACKEND_SECRET env var (set in Dokploy).
  internal_backend_secret?: string
  // --- TypeSafe Jev (grade verification — Settings → AI & LLM) --------------
  typesafe_api_key?: string
  // --- Custom OpenAI-compatible gateway (Settings → AI & LLM) -------------
  custom_api_key?: string
  custom_endpoint?: string
  custom_model?: string
  // --- Analytics & tracking (Settings → Analytics; public browser ids, validated in lib/analytics/integrations.ts)
  ga4_measurement_id?: string
  gtm_container_id?: string
  posthog_project_key?: string
  posthog_host?: string
  clarity_project_id?: string
  meta_pixel_id?: string
  linkedin_partner_id?: string
  analytics_retention_days?: string
  analytics_custom_events?: string
  // --- Knowledge vector store (lib/rag/vector-store; env PGVECTOR_URL / RAG_VECTOR_STORE)
  pgvector_url?: string
  rag_vector_store?: string
}

interface PlatformSettingDoc {
  key: string
  value: Record<string, unknown>
  updated_at: string
}

async function settingsCol(): Promise<Collection<PlatformSettingDoc>> {
  return (await getMongoDb()).collection<PlatformSettingDoc>('platform_settings')
}

let cached: ServerSecretsRecord | null = null
let cacheValid = false
let cacheAt = 0
let inflight: Promise<ServerSecretsRecord | null> | null = null
// ponytail: 30s TTL so the course-worker process sees SuperAdmin storage changes without a restart
const CACHE_MS = 30_000

export function invalidateServerSecretsCache(): void {
  cached = null
  cacheValid = false
  cacheAt = 0
  inflight = null
}

export async function warmServerSecretsCache(): Promise<ServerSecretsRecord> {
  if (cacheValid && cached !== null && Date.now() - cacheAt < CACHE_MS) return cached
  if (inflight) {
    const result = await inflight
    return result || {}
  }
  const p = (async () => {
    try {
      const col = await settingsCol()
      const doc = await col.findOne({ key: SERVER_SECRETS_PLATFORM_KEY })
      const stored = (doc?.value as Record<string, unknown>) || {}
      const { plain, needsMigration } = decryptSecretsRecord(stored, SECRET_FIELDS as string[])
      cached = plain as ServerSecretsRecord
      if (needsMigration) void migratePlaintextSecrets(col, stored, plain as Record<string, unknown>)
    } catch (e) {
      console.error('[CodeSpectra] server secrets load:', e)
      cached = {}
    } finally {
      cacheValid = true
      cacheAt = Date.now()
    }
    return cached!
  })()
  inflight = p
  const result = await p
  inflight = null
  return result
}

let migrating = false
/** Lazy migration: encrypt plain-text secret values left from older builds. */
async function migratePlaintextSecrets(col: Collection<PlatformSettingDoc>, stored: Record<string, unknown>, plain: Record<string, unknown> = {}): Promise<void> {
  if (migrating) return
  migrating = true
  try {
    const sealed = encryptSecretsRecord(stored, SECRET_FIELDS as string[])
    const $set: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(sealed)) {
      if (v !== stored[k]) $set[`value.${k}`] = v
    }
    // SEC-018: values still sealed with the legacy session-derived key are
    // re-sealed with SECRETS_ENCRYPTION_KEY.
    const key = secretsEncryptionKey()
    if (key) {
      for (const [k, v] of Object.entries(stored)) {
        if (isEncryptedSecret(v) && decryptWithOneKey(v, key) === null && typeof plain[k] === 'string' && plain[k]) {
          $set[`value.${k}`] = encryptSecretValue(plain[k] as string, key)
        }
      }
    }
    if (Object.keys($set).length === 0) return
    // Per-field compare-and-set: never overwrite a value another write changed meanwhile.
    const filter: Record<string, unknown> = { key: SERVER_SECRETS_PLATFORM_KEY }
    for (const k of Object.keys($set)) filter[k] = stored[k.slice(6)]
    await col.updateOne(filter as never, { $set })
    console.log(`[secrets] encrypted ${Object.keys($set).length} stored secret(s) at rest`)
  } catch (e) {
    console.error('[secrets] at-rest migration failed:', e instanceof Error ? e.message : e)
  } finally {
    migrating = false
  }
}

export function getServerSecretsFromCache(): ServerSecretsRecord {
  if (cacheValid && cached !== null) return cached
  return {}
}

/**
 * Load secrets from cache (warming first if needed). Async — call from API
 * routes that need to read the current values.
 */
export async function readServerSecrets(): Promise<ServerSecretsRecord> {
  return warmServerSecretsCache()
}

/**
 * Persist new server secrets and invalidate the in-memory cache. Returns the
 * merged record (existing values are preserved if not supplied in `patch`).
 */
export async function writeServerSecrets(
  patch: Partial<ServerSecretsRecord>,
): Promise<ServerSecretsRecord> {
  const col = await settingsCol()
  const existing = await col.findOne({ key: SERVER_SECRETS_PLATFORM_KEY })
  // Merge on the STORED form so values we can't decrypt (key rotated) are
  // kept rather than silently wiped by an unrelated save.
  const prev = (existing?.value as Record<string, unknown>) || {}
  const next: Record<string, unknown> = { ...prev }
  for (const [k, v] of Object.entries(patch) as [keyof ServerSecretsRecord, unknown][]) {
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
      delete next[k]
    } else if (typeof v === 'string') {
      next[k] = v.trim()
    }
  }
  const key = secretsEncryptionKey()
  const sealed = encryptSecretsRecord(next, SECRET_FIELDS as string[], key)
  await col.updateOne(
    { key: SERVER_SECRETS_PLATFORM_KEY },
    { $set: { value: sealed, updated_at: new Date().toISOString() } },
    { upsert: true },
  )
  invalidateServerSecretsCache()
  return decryptSecretsRecord(sealed, SECRET_FIELDS as string[], key).plain as ServerSecretsRecord
}

/** Mask API keys for admin UI (never return full secrets). */
export function maskSecret(value: string | undefined | null): string | null {
  const v = (value || '').trim()
  if (!v) return null
  // Comma-separated multi-key support: mask each key individually
  const parts = v.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length > 1) {
    return parts.map(p => {
      if (p.length <= 8) return '••••••••'
      return `${p.slice(0, 4)}••••${p.slice(-4)}`
    }).join(', ')
  }
  if (v.length <= 8) return '••••••••'
  return `${v.slice(0, 4)}••••${v.slice(-4)}`
}

/**
 * True when a value looks like a UI-masked secret (contains the bullet char
 * produced by `maskSecret`). Used to avoid persisting or sending the mask back
 * to the server, which would corrupt the stored key or break HTTP headers.
 */
export function isMaskedSecret(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.includes('•')
}

/**
 * Returns the normalised list of additional trusted origins configured by the
 * admin in MongoDB. Strips whitespace + trailing slashes; lowercases scheme/host
 * for tolerant matching.
 */
export async function readTrustedOrigins(): Promise<string[]> {
  const secrets = await readServerSecrets()
  const raw = (secrets.trusted_origins_extra || '').trim()
  if (!raw) return []
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => s.length > 0 && /^https?:\/\//i.test(s))
}
