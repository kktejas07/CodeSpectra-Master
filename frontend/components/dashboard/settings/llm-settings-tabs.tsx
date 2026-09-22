'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Eye, EyeOff, Save, Loader2, Upload, Zap, Activity, DollarSign, 
  TrendingUp, RefreshCw, CheckCircle, XCircle, Key, BarChart3,
  ChevronDown, ChevronRight, Trash2, Plus, Edit2, Globe, Brain,
  Search, Database, Wifi, Image, Puzzle, Cpu
} from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'

interface ProviderKey {
  id: string
  label: string
  placeholder: string
  url: string
  urlLabel: string
  desc: string
  key: string
  icon: any
  category: 'llm' | 'speech' | 'vector' | 'search' | 'obs' | 'integration' | 'image' | 'other'
  categoryLabel: string
}

interface UsageStats {
  model: string
  provider: string
  requests: number
  tokens: number
  cost: number
  avgLatency: number
  successRate: number
}

// Mirrors ProbeResult in lib/ai/provider-health.ts (local copy keeps this
// client component free of server-only import chains).
interface HealthRow {
  provider: string
  model: string
  secretKey: string
  free: boolean
  status: 'ok' | 'rate_limited' | 'bad_key' | 'dead_model' | 'no_key' | 'error'
  latencyMs: number | null
  keys: number
  error?: string
  quota?: { limit: number | null; usage: number | null } | null
  rateLimitedUntil?: number | null
}

const HEALTH_META: Record<HealthRow['status'], { label: string; dot: string; pill: string; hint: string }> = {
  ok: { label: 'Working', dot: 'bg-emerald-500', pill: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', hint: 'Live probe succeeded' },
  rate_limited: { label: 'Rate limited', dot: 'bg-amber-500', pill: 'bg-amber-500/10 text-amber-600 border-amber-500/20', hint: 'Out of credits / throttled — waits out, then retries automatically' },
  bad_key: { label: 'Bad key', dot: 'bg-red-500', pill: 'bg-red-500/10 text-red-600 border-red-500/20', hint: 'Key rejected (401/403) — replace it in the API Keys tab' },
  dead_model: { label: 'Dead model', dot: 'bg-red-500', pill: 'bg-red-500/10 text-red-600 border-red-500/20', hint: 'Model retired/unknown — update the fallback chain model ID' },
  no_key: { label: 'No key', dot: 'bg-muted-foreground', pill: 'bg-muted text-muted-foreground border-border', hint: 'Add a key in the API Keys tab to enable this provider' },
  error: { label: 'Error', dot: 'bg-red-500', pill: 'bg-red-500/10 text-red-600 border-red-500/20', hint: 'Probe failed — expand for details' },
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

const PROVIDERS: ProviderKey[] = [
  // LLM Providers
  { id: 'gemini', label: 'Google Gemini', placeholder: 'AIza...', url: 'https://aistudio.google.com/apikey', urlLabel: 'Google AI Studio', desc: 'Free tier. Code analysis, hints, fast completions.', key: 'gemini_api_key', icon: Brain, category: 'llm', categoryLabel: 'LLM Providers' },
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...', url: 'https://platform.openai.com/api-keys', urlLabel: 'OpenAI Platform', desc: 'Paid. GPT-4o, GPT-4-turbo, o1, o3 models.', key: 'openai_api_key', icon: Brain, category: 'llm', categoryLabel: 'LLM Providers' },
  { id: 'anthropic', label: 'Anthropic Claude', placeholder: 'sk-ant-...', url: 'https://console.anthropic.com', urlLabel: 'Anthropic Console', desc: 'Paid. Deep code review, agentic fixes, and chat.', key: 'anthropic_api_key', icon: Brain, category: 'llm', categoryLabel: 'LLM Providers' },
  { id: 'groq', label: 'Groq', placeholder: 'gsk_...', url: 'https://console.groq.com/keys', urlLabel: 'Groq Console', desc: 'Free tier. Ultra-fast inference. Llama, Mixtral, Gemma.', key: 'groq_api_key', icon: Zap, category: 'llm', categoryLabel: 'LLM Providers' },
  { id: 'openrouter', label: 'OpenRouter', placeholder: 'sk-or-...', url: 'https://openrouter.ai/keys', urlLabel: 'OpenRouter Keys', desc: 'Free & paid. 300+ models including free tiers.', key: 'openrouter_api_key', icon: Puzzle, category: 'llm', categoryLabel: 'LLM Providers' },
  { id: 'nvidia', label: 'NVIDIA NIM', placeholder: 'nvapi-...', url: 'https://build.nvidia.com', urlLabel: 'NVIDIA NIM', desc: 'Paid. Llama 3.1, Mistral, Nemotron models.', key: 'nvidia_api_key', icon: Cpu, category: 'llm', categoryLabel: 'LLM Providers' },
  { id: 'deepseek', label: 'DeepSeek', placeholder: 'sk-...', url: 'https://platform.deepseek.com', urlLabel: 'DeepSeek Platform', desc: 'Paid. DeepSeek V3, R1 reasoning models.', key: 'deepseek_api_key', icon: Brain, category: 'llm', categoryLabel: 'LLM Providers' },
  { id: 'cerebras', label: 'Cerebras', placeholder: 'csk-...', url: 'https://cloud.cerebras.ai', urlLabel: 'Cerebras Cloud', desc: 'Paid. Ultra-fast inference on Cerebras wafer-scale.', key: 'cerebras_api_key', icon: Zap, category: 'llm', categoryLabel: 'LLM Providers' },
  { id: 'mistral', label: 'Mistral AI', placeholder: '...', url: 'https://console.mistral.ai', urlLabel: 'Mistral Console', desc: 'Paid. Mistral Large, Mixtral, Codestral.', key: 'mistral_api_key', icon: Brain, category: 'llm', categoryLabel: 'LLM Providers' },
  { id: 'cohere', label: 'Cohere', placeholder: 'cohere_...', url: 'https://dashboard.cohere.com', urlLabel: 'Cohere Dashboard', desc: 'Paid. Command R+, embeddings, rerank.', key: 'cohere_api_key', icon: Brain, category: 'llm', categoryLabel: 'LLM Providers' },
  { id: 'fireworks', label: 'Fireworks AI', placeholder: 'fw_...', url: 'https://fireworks.ai', urlLabel: 'Fireworks AI', desc: 'Paid. Fast inference for open-source models.', key: 'fireworks_api_key', icon: Zap, category: 'llm', categoryLabel: 'LLM Providers' },
  { id: 'xai', label: 'xAI (Grok)', placeholder: 'xai-...', url: 'https://console.x.ai', urlLabel: 'xAI Console', desc: 'Paid. Grok-2, Grok-3 models.', key: 'xai_api_key', icon: Brain, category: 'llm', categoryLabel: 'LLM Providers' },
  { id: 'replicate', label: 'Replicate', placeholder: 'r8_...', url: 'https://replicate.com', urlLabel: 'Replicate', desc: 'Paid. Run open-source models via API.', key: 'replicate_api_key', icon: Cpu, category: 'llm', categoryLabel: 'LLM Providers' },
  { id: 'huggingface', label: 'Hugging Face', placeholder: 'hf_...', url: 'https://huggingface.co/settings/tokens', urlLabel: 'HF Tokens', desc: 'Free & paid. Access 500k+ models.', key: 'huggingface_api_key', icon: Brain, category: 'llm', categoryLabel: 'LLM Providers' },
  // Speech & Voice
  { id: 'elevenlabs', label: 'ElevenLabs', placeholder: 'sk_...', url: 'https://elevenlabs.io', urlLabel: 'ElevenLabs', desc: 'Paid. Text-to-speech, voice cloning.', key: 'elevenlabs_api_key', icon: Wifi, category: 'speech', categoryLabel: 'Speech & Voice' },
  { id: 'assemblyai', label: 'AssemblyAI', placeholder: '...', url: 'https://www.assemblyai.com', urlLabel: 'AssemblyAI', desc: 'Paid. Speech-to-text, transcription.', key: 'assemblyai_api_key', icon: Wifi, category: 'speech', categoryLabel: 'Speech & Voice' },
  { id: 'deepgram', label: 'Deepgram', placeholder: '...', url: 'https://console.deepgram.com', urlLabel: 'Deepgram Console', desc: 'Paid. Speech-to-text, voice AI.', key: 'deepgram_api_key', icon: Wifi, category: 'speech', categoryLabel: 'Speech & Voice' },
  // Vector Databases
  { id: 'pinecone', label: 'Pinecone', placeholder: 'pcsk_...', url: 'https://app.pinecone.io', urlLabel: 'Pinecone Console', desc: 'Paid. Vector database for embeddings.', key: 'pinecone_api_key', icon: Database, category: 'vector', categoryLabel: 'Vector DBs' },
  { id: 'qdrant', label: 'Qdrant', placeholder: '...', url: 'https://cloud.qdrant.io', urlLabel: 'Qdrant Cloud', desc: 'Free & paid. Vector search engine.', key: 'qdrant_api_key', icon: Database, category: 'vector', categoryLabel: 'Vector DBs' },
  // Search & Web
  { id: 'tavily', label: 'Tavily', placeholder: 'tvly-...', url: 'https://tavily.com', urlLabel: 'Tavily', desc: 'Paid. Web search for AI agents.', key: 'tavily_api_key', icon: Search, category: 'search', categoryLabel: 'Search & Web' },
  { id: 'firecrawl', label: 'Firecrawl', placeholder: 'fc-...', url: 'https://firecrawl.dev', urlLabel: 'Firecrawl', desc: 'Paid. Web scraping for AI.', key: 'firecrawl_api_key', icon: Search, category: 'search', categoryLabel: 'Search & Web' },
  { id: 'serper', label: 'Serper', placeholder: '...', url: 'https://serper.dev', urlLabel: 'Serper', desc: 'Paid. Google search API for AI.', key: 'serper_api_key', icon: Search, category: 'search', categoryLabel: 'Search & Web' },
  { id: 'jina', label: 'Jina AI', placeholder: 'jina_...', url: 'https://jina.ai', urlLabel: 'Jina AI', desc: 'Free & paid. Embeddings, reader, search.', key: 'jina_api_key', icon: Search, category: 'search', categoryLabel: 'Search & Web' },
  { id: 'exa', label: 'Exa', placeholder: '...', url: 'https://exa.ai', urlLabel: 'Exa', desc: 'Paid. Neural search engine.', key: 'exa_api_key', icon: Search, category: 'search', categoryLabel: 'Search & Web' },
  // Observability
  { id: 'langchain', label: 'LangChain Hub', placeholder: 'lsv2_...', url: 'https://smith.langchain.com', urlLabel: 'LangSmith', desc: 'Paid. LLM observability, prompts, chains.', key: 'langchain_api_key', icon: Activity, category: 'obs', categoryLabel: 'Observability' },
  { id: 'langfuse', label: 'Langfuse', placeholder: 'sk-lf-...', url: 'https://langfuse.com', urlLabel: 'Langfuse', desc: 'Free & paid. LLM observability & tracing.', key: 'langfuse_api_key', icon: Activity, category: 'obs', categoryLabel: 'Observability' },
  // Integrations
  { id: 'notion', label: 'Notion', placeholder: 'ntn_...', url: 'https://www.notion.so/my-integrations', urlLabel: 'Notion Integrations', desc: 'Paid. Notion API for AI apps.', key: 'notion_api_key', icon: Puzzle, category: 'integration', categoryLabel: 'Integrations' },
  { id: 'slack', label: 'Slack', placeholder: 'xapp-...', url: 'https://api.slack.com/apps', urlLabel: 'Slack API', desc: 'Paid. Slack integration for AI bots.', key: 'slack_api_key', icon: Puzzle, category: 'integration', categoryLabel: 'Integrations' },
  // Image & Video
  { id: 'stability', label: 'Stability AI', placeholder: 'sk-...', url: 'https://platform.stability.ai', urlLabel: 'Stability AI', desc: 'Paid. Stable Diffusion, image generation.', key: 'stability_api_key', icon: Image, category: 'image', categoryLabel: 'Image & Video' },
  { id: 'fal', label: 'Fal.ai', placeholder: '...', url: 'https://fal.ai', urlLabel: 'Fal.ai', desc: 'Paid. Fast AI inference, image/video models.', key: 'fal_api_key', icon: Image, category: 'image', categoryLabel: 'Image & Video' },
  // Other
  { id: 'deepinfra', label: 'DeepInfra', placeholder: '...', url: 'https://deepinfra.com', urlLabel: 'DeepInfra', desc: 'Paid. Serverless inference for open models.', key: 'deepinfra_api_key', icon: Cpu, category: 'other', categoryLabel: 'Other' },
  { id: 'novita', label: 'Novita AI', placeholder: 'sk_...', url: 'https://novita.ai', urlLabel: 'Novita AI', desc: 'Paid. LLM inference, image generation.', key: 'novita_api_key', icon: Cpu, category: 'other', categoryLabel: 'Other' },
  { id: 'ai21', label: 'AI21 Labs', placeholder: '...', url: 'https://www.ai21.com', urlLabel: 'AI21 Labs', desc: 'Paid. Jamba, language models.', key: 'ai21_api_key', icon: Brain, category: 'other', categoryLabel: 'Other' },
  { id: 'kimi', label: 'Kimi (Moonshot)', placeholder: '...', url: 'https://platform.moonshot.cn', urlLabel: 'Moonshot Platform', desc: 'Paid. Kimi long-context models.', key: 'kimi_api_key', icon: Brain, category: 'other', categoryLabel: 'Other' },
  { id: 'lemonfox', label: 'Lemonfox', placeholder: '...', url: 'https://lemonfox.ai', urlLabel: 'Lemonfox', desc: 'Paid. Fast inference for open models.', key: 'lemonfox_api_key', icon: Cpu, category: 'other', categoryLabel: 'Other' },
  { id: 'cloudflare_workers', label: 'Cloudflare Workers AI', placeholder: 'cfat_...', url: 'https://dash.cloudflare.com', urlLabel: 'Cloudflare Dashboard', desc: 'Paid. AI inference on Cloudflare network.', key: 'cloudflare_workers_api_key', icon: Globe, category: 'other', categoryLabel: 'Other' },
  { id: 'sambanova', label: 'SambaNova', placeholder: '...', url: 'https://cloud.sambanova.ai', urlLabel: 'SambaNova Cloud', desc: 'Paid. Fast inference on SambaNova RDU.', key: 'sambanova_api_key', icon: Cpu, category: 'other', categoryLabel: 'Other' },
  { id: 'nscale', label: 'nScale', placeholder: '...', url: 'https://nscale.com', urlLabel: 'nScale', desc: 'Paid. Managed inference platform.', key: 'nscale_api_key', icon: Cpu, category: 'other', categoryLabel: 'Other' },
  { id: 'chutes', label: 'Chutes', placeholder: 'cpk_...', url: 'https://chutes.ai', urlLabel: 'Chutes AI', desc: 'Paid. Serverless AI inference.', key: 'chutes_api_key', icon: Cpu, category: 'other', categoryLabel: 'Other' },
  { id: 'modelscope', label: 'ModelScope', placeholder: '...', url: 'https://modelscope.cn', urlLabel: 'ModelScope', desc: 'Free & paid. Chinese AI model hub.', key: 'modelscope_api_key', icon: Brain, category: 'other', categoryLabel: 'Other' },
  { id: 'google_knowledge', label: 'Google Knowledge Graph', placeholder: 'AIza...', url: 'https://console.cloud.google.com', urlLabel: 'GCP Console', desc: 'Free tier. Knowledge Graph Search API.', key: 'google_knowledge_graph_api_key', icon: Search, category: 'other', categoryLabel: 'Other' },
  { id: 'browserbase', label: 'Browserbase', placeholder: 'bb_...', url: 'https://browserbase.com', urlLabel: 'Browserbase', desc: 'Paid. Headless browser for AI agents.', key: 'browserbase_api_key', icon: Globe, category: 'other', categoryLabel: 'Other' },
  { id: 'brightdata', label: 'Bright Data', placeholder: '...', url: 'https://brightdata.com', urlLabel: 'Bright Data', desc: 'Paid. Web data platform, proxies.', key: 'brightdata_api_key', icon: Globe, category: 'other', categoryLabel: 'Other' },
  { id: 'scrapingbee', label: 'ScrapingBee', placeholder: '...', url: 'https://www.scrapingbee.com', urlLabel: 'ScrapingBee', desc: 'Paid. Web scraping API.', key: 'scrapingbee_api_key', icon: Globe, category: 'other', categoryLabel: 'Other' },
]

// Group providers by category
function groupByCategory(providers: ProviderKey[]): Record<string, ProviderKey[]> {
  const groups: Record<string, ProviderKey[]> = {}
  for (const p of providers) {
    if (!groups[p.categoryLabel]) groups[p.categoryLabel] = []
    groups[p.categoryLabel].push(p)
  }
  return groups
}

export function LlmSettingsTabs() {
  const addToast = useToast()
  const [activeTab, setActiveTab] = useState('keys')
  const [secretsDraft, setSecretsDraft] = useState<Record<string, string>>({})
  // ponytail: GET /api/admin/server-secrets NEVER returns raw secret values
  // (only `<key>_masked` + `has_<key>`), so the draft can only ever hold NEW
  // keys. savedInfo tracks what's actually in the database, otherwise every
  // card permanently shows "Not set" and saves silently overwrite stored keys.
  const [savedInfo, setSavedInfo] = useState<Record<string, { has: boolean; masked: string | null; count: number }>>({})
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({})
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [usageStats, setUsageStats] = useState<UsageStats[]>([])
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState<{ provider: string; index: number; value: string } | null>(null)
  // ponytail: probe results from GET/POST /api/admin/llm-health (cached doc —
  // loads instantly, "Test all" refreshes with live 1-token probes).
  const [health, setHealth] = useState<{ checkedAt: string | null; results: HealthRow[] }>({ checkedAt: null, results: [] })
  const [healthTesting, setHealthTesting] = useState(false)

  const loadHealth = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/llm-health', { credentials: 'include' })
      const d = await r.json().catch(() => ({}))
      if (r.ok) setHealth({ checkedAt: d.checkedAt ?? null, results: Array.isArray(d.results) ? d.results : [] })
    } catch {}
  }, [])

  useEffect(() => { void loadHealth() }, [loadHealth])

  const runHealthTest = useCallback(async () => {
    setHealthTesting(true)
    try {
      const res = await csrfFetch('/api/admin/llm-health', { method: 'POST', credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Health check failed')
      setHealth({ checkedAt: json.checkedAt ?? null, results: Array.isArray(json.results) ? json.results : [] })
      const ok = (json.results || []).filter((r: HealthRow) => r.status === 'ok').length
      addToast({ type: ok > 0 ? 'success' : 'error', title: `${ok}/${(json.results || []).length} providers working` })
    } catch (e) {
      addToast({ type: 'error', title: 'Health check failed', message: e instanceof Error ? e.message : 'Unknown error' })
    } finally {
      setHealthTesting(false)
    }
  }, [addToast])

  // Apply GET meta to per-provider saved-state (the raw secretsMeta is not
  // needed — GET never returns raw secret values, only has_/masked flags).
  const applySecretsMeta = useCallback((sec: Record<string, unknown>) => {
    const info: Record<string, { has: boolean; masked: string | null; count: number }> = {}
    for (const p of PROVIDERS) {
      info[p.key] = {
        has: Boolean(sec[`has_${p.key}`]),
        masked: typeof sec[`${p.key}_masked`] === 'string' ? (sec[`${p.key}_masked`] as string) : null,
        count: typeof sec[`${p.key}_count`] === 'number' ? sec[`${p.key}_count`] as number : (sec[`has_${p.key}`] ? 1 : 0),
      }
    }
    setSavedInfo(info)
  }, [])

  // Load secrets
  useEffect(() => {
    fetch('/api/admin/server-secrets', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        applySecretsMeta((d.secrets || d) as Record<string, unknown>)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [applySecretsMeta])

  // Load usage stats
  const loadUsage = useCallback(() => {
    fetch('/api/admin/platform/ai-usage', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const summary = d.summary || d
        if (summary.byModel) {
          setUsageStats(summary.byModel)
        } else if (summary.byFeature) {
          setUsageStats(summary.byFeature.map((f: any) => ({
            model: f.feature || 'unknown',
            provider: 'mixed',
            requests: f.requests || 0,
            tokens: f.totalTokens || 0,
            cost: 0,
            avgLatency: f.avgLatencyMs || 0,
            successRate: 100,
          })))
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadUsage()
    const interval = setInterval(loadUsage, 60000) // Auto-refresh every 60s
    return () => clearInterval(interval)
  }, [loadUsage])

  const handleRevealToggle = useCallback(async (key: string) => {
    if (visibleFields[key]) {
      setVisibleFields((v) => ({ ...v, [key]: false }))
      setRevealedValues((v) => { const n = { ...v }; delete n[key]; return n })
    } else {
      const res = await fetch(`/api/admin/server-secrets/reveal?key=${key}`, { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.value) setRevealedValues((v) => ({ ...v, [key]: json.value }))
      setVisibleFields((v) => ({ ...v, [key]: true }))
    }
  }, [visibleFields])

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    // ponytail: accept MULTIPLE files at once (select several Excel/CSV exports
    // in the picker) — keys from every file are appended to the draft.
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    let imported = 0
    const skipped: string[] = []
    const importedKeys: string[] = []
    try {
      const XLSX = await import('xlsx')
      for (const file of files) {
        const data = await file.arrayBuffer()
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        if (!firstSheet) continue
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { header: 1 })
      const providerMap: Record<string, string> = {
        'openai': 'openai_api_key', 'anthropic': 'anthropic_api_key', 'google gemini': 'gemini_api_key', 'gemini': 'gemini_api_key',
        'groq': 'groq_api_key', 'openrouter': 'openrouter_api_key', 'nvidia': 'nvidia_api_key', 'deepseek': 'deepseek_api_key',
        'cerebras': 'cerebras_api_key', 'mistral': 'mistral_api_key', 'cohere': 'cohere_api_key', 'fireworks': 'fireworks_api_key',
        'xai': 'xai_api_key', 'replicate': 'replicate_api_key', 'aistudio.google.com': 'gemini_api_key', 'console.groq.com': 'groq_api_key',
        'platform.openai.com': 'openai_api_key', 'console.anthropic.com': 'anthropic_api_key', 'build.nvidia.com': 'nvidia_api_key',
        'platform.deepseek.com': 'deepseek_api_key', 'console.x.ai': 'xai_api_key', 'dashboard.cohere.com': 'cohere_api_key',
        'deepinfra.com': 'deepinfra_api_key', 'fireworks.ai': 'fireworks_api_key', 'novita.ai': 'novita_api_key',
        'replicate.com': 'replicate_api_key', 'tavily.com': 'tavily_api_key', 'serper.dev': 'serper_api_key',
        'exa.ai': 'exa_api_key', 'jina.ai': 'jina_api_key', 'firecrawl.dev': 'firecrawl_api_key',
        'console.deepgram.com': 'deepgram_api_key', 'assemblyai.com': 'assemblyai_api_key',
        'elevenlabs.io': 'elevenlabs_api_key', 'lemonfox.ai': 'lemonfox_api_key',
        'platform.stability.ai': 'stability_api_key', 'fal.ai': 'fal_api_key', 'huggingface.co': 'huggingface_api_key',
        'cloud.cerebras.ai': 'cerebras_api_key', 'console.mistral.ai': 'mistral_api_key',
        'openrouter.ai': 'openrouter_api_key', 'github.com': 'openrouter_api_key',
        'workers.ai': 'cloudflare_workers_api_key', 'platform.kimi.ai': 'kimi_api_key',
        'cloud.sambanova.com': 'sambanova_api_key', 'ollama.com': 'openrouter_api_key',
      }
      for (const row of rows) {
        if (!Array.isArray(row)) continue
        const firstCell = String(row[0] || '').trim()
        if (firstCell.toLowerCase() === 'provider' || firstCell.toLowerCase() === 'name') continue
        let providerName = row.length >= 3 ? String(row[1] || '').trim() : String(row[0] || '').trim()
        let apiKey = row.length >= 3 ? String(row[2] || '').trim() : String(row[1] || '').trim()
        if (!providerName || !apiKey) continue
        const lk = apiKey.toLowerCase()
        if (lk.includes('issue') || lk.includes('problem') || lk.includes('login') || lk.includes('asking') || lk.includes('need subscription') || lk.includes('buy credits') || lk.includes('not found') || lk.includes('no login') || lk.includes('no api key') || lk.includes('there is no') || lk.includes('site can') || lk.includes('password:') || apiKey.length < 10) continue
        const normalizedName = providerName.toLowerCase().replace(/^https?:\/\//, '').replace(/\s.*$/, '').replace(/\{.*$/, '').replace(/\/.*$/, '').trim()
        const secretKey = providerMap[normalizedName] || providerMap[providerName.toLowerCase().replace(/\s.*$/, '').trim()]
        if (secretKey) {
          setSecretsDraft((d) => { const existing = d[secretKey] || ''; const keys = existing ? existing.split(',').map((k: string) => k.trim()).filter(Boolean) : []; if (!keys.includes(apiKey)) keys.push(apiKey); return { ...d, [secretKey]: keys.join(', ') } })
          imported++
        } else skipped.push(`${providerName} (${file.name})`)
        }
      }
      if (imported > 0) addToast({ type: 'success', title: `Imported ${imported} key${imported > 1 ? 's' : ''} from ${files.length} file${files.length > 1 ? 's' : ''}`, message: 'Click "Save Keys" to persist.' })
      else addToast({ type: 'error', title: 'No matching providers found' })
    } catch (err) { addToast({ type: 'error', title: 'Failed to parse file' }) }
    e.target.value = ''
  }, [addToast])

  const saveKeys = useCallback(async () => {
    setSaving(true)
    try {
      const body: Record<string, string> = {}
      for (const [k, v] of Object.entries(secretsDraft)) {
        const newKeys = String(v).split(',').map((s) => s.trim()).filter(Boolean)
        if (newKeys.length === 0) continue
        if (savedInfo[k]?.has) {
          // ponytail: merge with stored keys via reveal — PATCH overwrites the
          // whole field, so sending only the new keys would silently wipe the
          // previously saved ones for this provider.
          try {
            const r = await fetch(`/api/admin/server-secrets/reveal?key=${encodeURIComponent(k)}`, { credentials: 'include' })
            const j = await r.json().catch(() => ({}))
            const stored = typeof j.value === 'string' ? j.value.split(',').map((s: string) => s.trim()).filter(Boolean) : []
            for (const nk of newKeys) if (!stored.includes(nk)) stored.push(nk)
            body[k] = stored.join(', ')
          } catch {
            body[k] = newKeys.join(', ')
          }
        } else {
          body[k] = newKeys.join(', ')
        }
      }
      if (Object.keys(body).length === 0) { addToast({ type: 'error', title: 'Nothing to save' }); setSaving(false); return }
      const res = await csrfFetch('/api/admin/server-secrets', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Save failed')
      const secRes = await fetch('/api/admin/server-secrets', { credentials: 'include' })
      const secJson = await secRes.json().catch(() => ({}))
      if (secRes.ok) applySecretsMeta((secJson.secrets || secJson) as Record<string, unknown>)
      // Everything in the draft is now persisted — clear it so the saved
      // section (masked) becomes the single source of truth on screen.
      setSecretsDraft({})
      addToast({ type: 'success', title: 'Keys saved successfully' })
    } catch (e) { addToast({ type: 'error', title: 'Save failed', message: e instanceof Error ? e.message : 'Unknown error' }) }
    finally { setSaving(false) }
  }, [secretsDraft, savedInfo, applySecretsMeta, addToast])

  // Delete ALL saved keys for a provider (draft-only deleteKey can't reach
  // stored values since raw secrets are never sent to the browser).
  const clearSavedKeys = useCallback(async (providerKey: string, label: string) => {
    if (!window.confirm(`Remove all saved keys for ${label}? Running AI features that need this provider will stop working until you add a key again.`)) return
    try {
      const res = await csrfFetch('/api/admin/server-secrets', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [providerKey]: null }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Delete failed')
      setSecretsDraft((d) => { const n = { ...d }; delete n[providerKey]; return n })
      const secRes = await fetch('/api/admin/server-secrets', { credentials: 'include' })
      const secJson = await secRes.json().catch(() => ({}))
      if (secRes.ok) applySecretsMeta((secJson.secrets || secJson) as Record<string, unknown>)
      addToast({ type: 'success', title: `Saved keys cleared for ${label}` })
    } catch (e) { addToast({ type: 'error', title: 'Delete failed', message: e instanceof Error ? e.message : 'Unknown error' }) }
  }, [applySecretsMeta, addToast])

  const deleteKey = useCallback((providerKey: string, index: number) => {
    setSecretsDraft((d) => {
      const existing = d[providerKey] || ''
      const keys = existing.split(',').map((k: string) => k.trim()).filter(Boolean)
      keys.splice(index, 1)
      return { ...d, [providerKey]: keys.join(', ') }
    })
    addToast({ type: 'success', title: 'Key removed' })
  }, [addToast])

  const getKeyCount = (key: string) => {
    const val = secretsDraft[key] || ''
    return val ? val.split(',').filter(k => k.trim()).length : 0
  }

  const getKeys = (key: string) => {
    const val = secretsDraft[key] || ''
    return val ? val.split(',').map(k => k.trim()).filter(Boolean) : []
  }

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>

  const groupedProviders = groupByCategory(PROVIDERS)

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="keys" className="flex items-center gap-2"><Key className="h-4 w-4" /> API Keys</TabsTrigger>
        <TabsTrigger value="health" className="flex items-center gap-2"><Activity className="h-4 w-4" /> Health</TabsTrigger>
        <TabsTrigger value="usage" className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Usage Stats</TabsTrigger>
        <TabsTrigger value="routing" className="flex items-center gap-2"><Zap className="h-4 w-4" /> Routing</TabsTrigger>
      </TabsList>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* API KEYS TAB */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <TabsContent value="keys" className="space-y-6">
        {/* Import & Save bar */}
        <Card className="p-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border/60 bg-background hover:bg-muted/50 cursor-pointer transition-colors text-sm font-medium">
            <Upload className="h-4 w-4" /> Import from Excel/CSV
            <input type="file" accept=".xlsx,.xls,.csv" multiple className="hidden" onChange={handleImport} />
          </label>
          <div className="flex-1" />
          <Button onClick={saveKeys} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            Save Keys
          </Button>
        </Card>

        {/* Provider category cards */}
        {Object.entries(groupedProviders).map(([catLabel, providers]) => {
          const activeCount = providers.filter(p => getKeyCount(p.key) > 0 || savedInfo[p.key]?.has).length
          return (
            <div key={catLabel} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <h4 className="text-sm font-semibold text-foreground">{catLabel}</h4>
                <Badge variant="secondary" className="text-[10px]">{activeCount}/{providers.length} active</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {providers.map(p => {
                  const draftCount = getKeyCount(p.key)
                  const saved = savedInfo[p.key]
                  const hasKey = draftCount > 0 || !!saved?.has
                  const isExpanded = expandedProvider === p.id
                  const Icon = p.icon
                  return (
                    <Card key={p.id} className={cn("p-4 transition-all cursor-pointer hover:border-primary/30", isExpanded && "border-primary/50 ring-1 ring-primary/20")} onClick={() => setExpandedProvider(isExpanded ? null : p.id)}>
                      <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg", hasKey ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold truncate">{p.label}</p>
                            {draftCount > 0 && (
                              <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/20">
                                {draftCount} new — unsaved
                              </Badge>
                            )}
                            {saved?.has && (
                              <Badge
                                variant="outline"
                                className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                title={saved.masked ? `${saved.count || 1} key(s) stored: ${saved.masked}` : 'Stored in database'}
                              >
                                Saved{saved.count > 1 ? ` · ${saved.count} keys` : ''}
                              </Badge>
                            )}
                            {!saved?.has && draftCount === 0 && (
                              <Badge variant="outline" className="text-[9px] text-muted-foreground">Not set</Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">{p.desc}</p>
                        </div>
                        <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
                      </div>

                      {/* Expanded panel - keys list */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-border/50 space-y-3" onClick={(e) => e.stopPropagation()}>
                          {saved?.has && (
                            <div className="flex items-center gap-2 p-2 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-mono truncate">{saved.masked || '••••••••'}</p>
                                <p className="text-[10px] text-muted-foreground">Saved in database — used by AI features</p>
                              </div>
                              <button onClick={() => clearSavedKeys(p.key, p.label)} className="text-destructive hover:text-destructive/80 p-1" title="Remove all saved keys for this provider">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          {getKeys(p.key).length > 0 ? (
                            <div className="space-y-2">
                              {getKeys(p.key).map((k, idx) => (
                                <div key={idx} className="flex items-center gap-2 p-2 rounded-md bg-muted/30 border border-border/30">
                                  <div className="flex-1 min-w-0">
                                    <input
                                      type={(visibleFields as any)[`${p.key}_${idx}`] ? 'text' : 'password'}
                                      value={(visibleFields as any)[`${p.key}_${idx}`] ? (revealedValues[`${p.key}_${idx}`] ?? k) : '••••••••••••'}
                                      readOnly
                                      className="w-full bg-transparent text-xs font-mono border-none p-0 focus:outline-none"
                                    />
                                  </div>
                                  <button onClick={() => {
                                    const key = `${p.key}_${idx}`
                                    if (visibleFields[key]) {
                                      setVisibleFields(v => ({ ...v, [key]: false }))
                                    } else {
                                      setRevealedValues(v => ({ ...v, [key]: k }))
                                      setVisibleFields(v => ({ ...v, [key]: true }))
                                    }
                                  }} className="text-muted-foreground hover:text-foreground p-1">
                                    {(visibleFields as any)[`${p.key}_${idx}`] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                  </button>
                                  <button onClick={() => deleteKey(p.key, idx)} className="text-destructive hover:text-destructive/80 p-1">
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground text-center py-2">{saved?.has ? 'No new keys — add one below, then Save Keys' : 'No keys configured'}</p>
                          )}
                          <div className="flex gap-2">
                            <Input
                              type="password"
                              placeholder={p.placeholder}
                              className="flex-1 h-8 text-xs font-mono"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                                  const val = (e.target as HTMLInputElement).value.trim()
                                  setSecretsDraft(d => {
                                    const existing = d[p.key] || ''
                                    const keys = existing ? existing.split(',').map(k => k.trim()).filter(Boolean) : []
                                    if (!keys.includes(val)) keys.push(val)
                                    return { ...d, [p.key]: keys.join(', ') }
                                  })
                                  ;(e.target as HTMLInputElement).value = ''
                                }
                              }}
                            />
                            <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline shrink-0 self-center">
                              Get Key →
                            </a>
                          </div>
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            </div>
          )
        })}
      </TabsContent>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* USAGE STATS TAB */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <TabsContent value="usage" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold">Model Usage Statistics</h4>
            <p className="text-xs text-muted-foreground">Auto-refreshes every 60 seconds</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadUsage}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
        </div>
        {usageStats.length > 0 ? (
          <Card className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Model</th>
                    <th className="text-left p-3 font-medium">Provider</th>
                    <th className="text-right p-3 font-medium">Requests</th>
                    <th className="text-right p-3 font-medium">Tokens</th>
                    <th className="text-right p-3 font-medium">Cost</th>
                    <th className="text-right p-3 font-medium">Avg Latency</th>
                    <th className="text-right p-3 font-medium">Success</th>
                  </tr>
                </thead>
                <tbody>
                  {usageStats.map((s, i) => (
                    <tr key={i} className="border-t border-border/30 hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">{s.model}</td>
                      <td className="p-3"><Badge variant="outline" className="text-[9px]">{s.provider}</Badge></td>
                      <td className="p-3 text-right font-medium">{s.requests.toLocaleString()}</td>
                      <td className="p-3 text-right">{s.tokens.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono text-emerald-500">${s.cost.toFixed(4)}</td>
                      <td className="p-3 text-right">{s.avgLatency}ms</td>
                      <td className="p-3 text-right">
                        <span className={s.successRate >= 95 ? 'text-emerald-500 font-medium' : s.successRate >= 80 ? 'text-amber-500 font-medium' : 'text-red-500 font-medium'}>
                          {s.successRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card className="p-8 text-center text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No usage data yet. Data will appear after AI requests are made.</p>
          </Card>
        )}
      </TabsContent>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ROUTING TAB */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <TabsContent value="routing" className="space-y-6">
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h4 className="text-sm font-semibold">Provider Fallback Chain</h4>
          </div>
          <p className="text-xs text-muted-foreground">When a provider fails or hits rate limits, the system automatically tries the next provider.</p>
          <div className="flex flex-wrap items-center gap-2">
            {['Gemini', 'Groq', 'OpenRouter', 'OpenAI', 'Anthropic', 'NVIDIA', 'DeepSeek'].map((p, i) => (
              <div key={p} className="flex items-center gap-1">
                <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border",
                  getKeyCount(PROVIDERS.find(pr => pr.label.includes(p))?.key || '') > 0
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-muted border-border text-muted-foreground"
                )}>
                  <span className="font-bold">{i + 1}</span> {p}
                  {getKeyCount(PROVIDERS.find(pr => pr.label.includes(p))?.key || '') > 0 && <CheckCircle className="h-3 w-3 text-emerald-500" />}
                </div>
                {i < 6 && <span className="text-muted-foreground">→</span>}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h4 className="text-sm font-semibold">Round-Robin Rotation</h4>
          </div>
          <p className="text-xs text-muted-foreground">When multiple keys are configured for a provider (comma-separated), the system rotates through them evenly to distribute load.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {['gemini', 'openai', 'anthropic', 'groq', 'openrouter', 'nvidia'].map(p => {
              const keys = getKeys(`${p}_api_key`)
              return keys.length > 1 ? (
                <div key={p} className="p-3 rounded-lg bg-muted/30 border border-border/30">
                  <p className="text-xs font-semibold capitalize mb-1">{p}</p>
                  <div className="flex gap-1">
                    {keys.map((_, i) => (
                      <div key={i} className={cn("h-2 w-8 rounded-full", i === 0 ? "bg-primary" : "bg-primary/30")} title={`Key ${i + 1}`} />
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{keys.length} keys rotating</p>
                </div>
              ) : null
            })}
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            <h4 className="text-sm font-semibold">How Routing Works</h4>
          </div>
          <div className="text-xs text-muted-foreground space-y-2">
            <p><strong>1. Round-Robin:</strong> Requests cycle through configured keys evenly.</p>
            <p><strong>2. Rate Limit Detection:</strong> When a key hits 429, it's marked unavailable for 60 seconds.</p>
            <p><strong>3. Provider Fallback:</strong> When all keys for a provider are exhausted, moves to the next provider in the chain.</p>
            <p><strong>4. Auto-Recovery:</strong> Rate-limited keys automatically become available again after the cooldown period.</p>
          </div>
        </Card>
      </TabsContent>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* HEALTH TAB — live per-provider probe results */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <TabsContent value="health" className="space-y-4">
        <Card className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${
              health.results.length === 0 ? 'bg-muted-foreground'
              : health.results.every(r => r.status === 'ok') ? 'bg-emerald-500'
              : health.results.some(r => r.status === 'ok') ? 'bg-amber-500' : 'bg-red-500'
            }`} />
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {health.results.length === 0
                  ? 'Not checked yet'
                  : `${health.results.filter(r => r.status === 'ok').length}/${health.results.length} providers working`}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {health.checkedAt ? `Last checked ${timeAgo(health.checkedAt)}` : 'Run a live probe to verify every key + model'} · 1-token completion per provider through the production path
              </p>
            </div>
          </div>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => void loadHealth()}><RefreshCw className="h-4 w-4 mr-1" /> Reload</Button>
          <Button size="sm" onClick={() => void runHealthTest()} disabled={healthTesting}>
            {healthTesting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Activity className="mr-1 h-4 w-4" />}
            {healthTesting ? 'Probing…' : 'Test all providers'}
          </Button>
        </Card>

        {health.results.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No probe data yet. Click “Test all providers” — each chain model gets a 1-token live completion.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {health.results.map((r) => {
              const meta = HEALTH_META[r.status]
              const label = PROVIDERS.find(p => p.key === r.secretKey)?.label
                || (r.provider.charAt(0).toUpperCase() + r.provider.slice(1))
              const cooldownSec = typeof r.rateLimitedUntil === 'number' && r.rateLimitedUntil > Date.now()
                ? Math.ceil((r.rateLimitedUntil - Date.now()) / 1000)
                : 0
              return (
                <Card key={`${r.provider}/${r.model}`} className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${meta.dot}`} />
                    <p className="text-sm font-semibold truncate flex-1">{label}</p>
                    {r.free && <Badge variant="outline" className="text-[9px] text-muted-foreground">free tier</Badge>}
                    <Badge variant="outline" className={`text-[9px] ${meta.pill}`}>{meta.label}</Badge>
                  </div>
                  <p className="text-[11px] font-mono text-muted-foreground truncate" title={r.model}>{r.model}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>{r.keys} key{r.keys === 1 ? '' : 's'}</span>
                    {typeof r.latencyMs === 'number' && <span>{(r.latencyMs / 1000).toFixed(1)}s probe</span>}
                    {r.quota && typeof r.quota.limit === 'number' && typeof r.quota.usage === 'number' && (
                      <span title="OpenRouter credit usage (genuine vendor data)">
                        ${r.quota.usage.toFixed(2)} / ${r.quota.limit.toFixed(2)} used
                      </span>
                    )}
                    {cooldownSec > 0 && <span className="text-amber-600">cooldown {cooldownSec}s</span>}
                  </div>
                  {r.status !== 'ok' && (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      <span className="font-medium text-foreground">{meta.hint}</span>
                      {r.error && <span className="block font-mono mt-0.5 break-words">{r.error}</span>}
                    </p>
                  )}
                </Card>
              )
            })}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
          Quotas: only OpenRouter exposes real credit usage via API (shown when available). Other vendors publish no quota endpoint,
          so limits are tracked as observed traffic in Usage Stats. If every row is red, course generation and all AI features are down —
          fix the topmost failing provider first; the fallback chain tries them in this order.
        </p>
      </TabsContent>
    </Tabs>
  )
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

function Info({ className }: { className?: string }) {
  return <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
}