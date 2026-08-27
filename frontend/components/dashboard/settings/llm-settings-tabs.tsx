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
  TrendingUp, RefreshCw, CheckCircle, XCircle, Key, BarChart3
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
  category: 'llm' | 'speech' | 'vector' | 'search' | 'obs' | 'integration' | 'image' | 'other'
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

const PROVIDERS: ProviderKey[] = [
  // LLM Providers
  { id: 'gemini', label: 'Google Gemini', placeholder: 'AIza...', url: 'https://aistudio.google.com/apikey', urlLabel: 'Google AI Studio', desc: 'Free tier. Code analysis, hints, fast completions.', key: 'gemini_api_key', category: 'llm' },
  { id: 'opencode', label: 'OpenCode', placeholder: 'ock_...', url: 'https://opencode.ai/keys', urlLabel: 'OpenCode Keys', desc: 'Free & paid. Claude, GPT, Gemini, DeepSeek models.', key: 'opencode_api_key', category: 'llm' },
  { id: 'groq', label: 'Groq', placeholder: 'gsk_...', url: 'https://console.groq.com/keys', urlLabel: 'Groq Console', desc: 'Free tier. Ultra-fast inference. Llama, Mixtral, Gemma.', key: 'groq_api_key', category: 'llm' },
  { id: 'openrouter', label: 'OpenRouter', placeholder: 'sk-or-...', url: 'https://openrouter.ai/keys', urlLabel: 'OpenRouter Keys', desc: 'Free & paid. 300+ models including free tiers.', key: 'openrouter_api_key', category: 'llm' },
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...', url: 'https://platform.openai.com/api-keys', urlLabel: 'OpenAI Platform', desc: 'Paid. GPT-4o, GPT-4-turbo, o1, o3 models.', key: 'openai_api_key', category: 'llm' },
  { id: 'anthropic', label: 'Anthropic Claude', placeholder: 'sk-ant-...', url: 'https://console.anthropic.com', urlLabel: 'Anthropic Console', desc: 'Paid. Deep code review, agentic fixes, and chat.', key: 'anthropic_api_key', category: 'llm' },
  { id: 'nvidia', label: 'NVIDIA NIM', placeholder: 'nvapi-...', url: 'https://build.nvidia.com', urlLabel: 'NVIDIA NIM', desc: 'Paid. Llama 3.1, Mistral, Nemotron models.', key: 'nvidia_api_key', category: 'llm' },
  { id: 'deepseek', label: 'DeepSeek', placeholder: 'sk-...', url: 'https://platform.deepseek.com', urlLabel: 'DeepSeek Platform', desc: 'Paid. DeepSeek V3, R1 reasoning models.', key: 'deepseek_api_key', category: 'llm' },
  { id: 'cerebras', label: 'Cerebras', placeholder: 'csk-...', url: 'https://cloud.cerebras.ai', urlLabel: 'Cerebras Cloud', desc: 'Paid. Ultra-fast inference on Cerebras wafer-scale.', key: 'cerebras_api_key', category: 'llm' },
  { id: 'mistral', label: 'Mistral AI', placeholder: '...', url: 'https://console.mistral.ai', urlLabel: 'Mistral Console', desc: 'Paid. Mistral Large, Mixtral, Codestral.', key: 'mistral_api_key', category: 'llm' },
  { id: 'cohere', label: 'Cohere', placeholder: 'cohere_...', url: 'https://dashboard.cohere.com', urlLabel: 'Cohere Dashboard', desc: 'Paid. Command R+, embeddings, rerank.', key: 'cohere_api_key', category: 'llm' },
  { id: 'fireworks', label: 'Fireworks AI', placeholder: 'fw_...', url: 'https://fireworks.ai', urlLabel: 'Fireworks AI', desc: 'Paid. Fast inference for open-source models.', key: 'fireworks_api_key', category: 'llm' },
  { id: 'xai', label: 'xAI (Grok)', placeholder: 'xai-...', url: 'https://console.x.ai', urlLabel: 'xAI Console', desc: 'Paid. Grok-2, Grok-3 models.', key: 'xai_api_key', category: 'llm' },
  { id: 'replicate', label: 'Replicate', placeholder: 'r8_...', url: 'https://replicate.com', urlLabel: 'Replicate', desc: 'Paid. Run open-source models via API.', key: 'replicate_api_key', category: 'llm' },
  // Speech & Voice
  { id: 'elevenlabs', label: 'ElevenLabs', placeholder: 'sk_...', url: 'https://elevenlabs.io', urlLabel: 'ElevenLabs', desc: 'Paid. Text-to-speech, voice cloning.', key: 'elevenlabs_api_key', category: 'speech' },
  { id: 'assemblyai', label: 'AssemblyAI', placeholder: '...', url: 'https://www.assemblyai.com', urlLabel: 'AssemblyAI', desc: 'Paid. Speech-to-text, transcription.', key: 'assemblyai_api_key', category: 'speech' },
  { id: 'deepgram', label: 'Deepgram', placeholder: '...', url: 'https://console.deepgram.com', urlLabel: 'Deepgram Console', desc: 'Paid. Speech-to-text, voice AI.', key: 'deepgram_api_key', category: 'speech' },
  // Vector Databases
  { id: 'pinecone', label: 'Pinecone', placeholder: 'pcsk_...', url: 'https://app.pinecone.io', urlLabel: 'Pinecone Console', desc: 'Paid. Vector database for embeddings.', key: 'pinecone_api_key', category: 'vector' },
  { id: 'qdrant', label: 'Qdrant', placeholder: '...', url: 'https://cloud.qdrant.io', urlLabel: 'Qdrant Cloud', desc: 'Free & paid. Vector search engine.', key: 'qdrant_api_key', category: 'vector' },
  // Search & Web
  { id: 'tavily', label: 'Tavily', placeholder: 'tvly-...', url: 'https://tavily.com', urlLabel: 'Tavily', desc: 'Paid. Web search for AI agents.', key: 'tavily_api_key', category: 'search' },
  { id: 'firecrawl', label: 'Firecrawl', placeholder: 'fc-...', url: 'https://firecrawl.dev', urlLabel: 'Firecrawl', desc: 'Paid. Web scraping for AI.', key: 'firecrawl_api_key', category: 'search' },
  { id: 'serper', label: 'Serper', placeholder: '...', url: 'https://serper.dev', urlLabel: 'Serper', desc: 'Paid. Google search API for AI.', key: 'serper_api_key', category: 'search' },
  { id: 'jina', label: 'Jina AI', placeholder: 'jina_...', url: 'https://jina.ai', urlLabel: 'Jina AI', desc: 'Free & paid. Embeddings, reader, search.', key: 'jina_api_key', category: 'search' },
  { id: 'exa', label: 'Exa', placeholder: '...', url: 'https://exa.ai', urlLabel: 'Exa', desc: 'Paid. Neural search engine.', key: 'exa_api_key', category: 'search' },
  // Observability
  { id: 'langchain', label: 'LangChain Hub', placeholder: 'lsv2_...', url: 'https://smith.langchain.com', urlLabel: 'LangSmith', desc: 'Paid. LLM observability, prompts, chains.', key: 'langchain_api_key', category: 'obs' },
  { id: 'langfuse', label: 'Langfuse', placeholder: 'sk-lf-...', url: 'https://langfuse.com', urlLabel: 'Langfuse', desc: 'Free & paid. LLM observability & tracing.', key: 'langfuse_api_key', category: 'obs' },
  // Integrations
  { id: 'notion', label: 'Notion', placeholder: 'ntn_...', url: 'https://www.notion.so/my-integrations', urlLabel: 'Notion Integrations', desc: 'Paid. Notion API for AI apps.', key: 'notion_api_key', category: 'integration' },
  { id: 'slack', label: 'Slack', placeholder: 'xapp-...', url: 'https://api.slack.com/apps', urlLabel: 'Slack API', desc: 'Paid. Slack integration for AI bots.', key: 'slack_api_key', category: 'integration' },
  // Image & Video
  { id: 'stability', label: 'Stability AI', placeholder: 'sk-...', url: 'https://platform.stability.ai', urlLabel: 'Stability AI', desc: 'Paid. Stable Diffusion, image generation.', key: 'stability_api_key', category: 'image' },
  { id: 'fal', label: 'Fal.ai', placeholder: '...', url: 'https://fal.ai', urlLabel: 'Fal.ai', desc: 'Paid. Fast AI inference, image/video models.', key: 'fal_api_key', category: 'image' },
  // Other
  { id: 'deepinfra', label: 'DeepInfra', placeholder: '...', url: 'https://deepinfra.com', urlLabel: 'DeepInfra', desc: 'Paid. Serverless inference for open models.', key: 'deepinfra_api_key', category: 'other' },
  { id: 'novita', label: 'Novita AI', placeholder: 'sk_...', url: 'https://novita.ai', urlLabel: 'Novita AI', desc: 'Paid. LLM inference, image generation.', key: 'novita_api_key', category: 'other' },
  { id: 'ai21', label: 'AI21 Labs', placeholder: '...', url: 'https://www.ai21.com', urlLabel: 'AI21 Labs', desc: 'Paid. Jamba, language models.', key: 'ai21_api_key', category: 'other' },
  { id: 'kimi', label: 'Kimi (Moonshot)', placeholder: '...', url: 'https://platform.moonshot.cn', urlLabel: 'Moonshot Platform', desc: 'Paid. Kimi long-context models.', key: 'kimi_api_key', category: 'other' },
  { id: 'lemonfox', label: 'Lemonfox', placeholder: '...', url: 'https://lemonfox.ai', urlLabel: 'Lemonfox', desc: 'Paid. Fast inference for open models.', key: 'lemonfox_api_key', category: 'other' },
  { id: 'huggingface', label: 'Hugging Face', placeholder: 'hf_...', url: 'https://huggingface.co/settings/tokens', urlLabel: 'HF Tokens', desc: 'Free & paid. Access 500k+ models.', key: 'huggingface_api_key', category: 'other' },
  { id: 'cloudflare_workers', label: 'Cloudflare Workers AI', placeholder: 'cfat_...', url: 'https://dash.cloudflare.com', urlLabel: 'Cloudflare Dashboard', desc: 'Paid. AI inference on Cloudflare network.', key: 'cloudflare_workers_api_key', category: 'other' },
  { id: 'sambanova', label: 'SambaNova', placeholder: '...', url: 'https://cloud.sambanova.ai', urlLabel: 'SambaNova Cloud', desc: 'Paid. Fast inference on SambaNova RDU.', key: 'sambanova_api_key', category: 'other' },
  { id: 'nscale', label: 'nScale', placeholder: '...', url: 'https://nscale.com', urlLabel: 'nScale', desc: 'Paid. Managed inference platform.', key: 'nscale_api_key', category: 'other' },
  { id: 'chutes', label: 'Chutes', placeholder: 'cpk_...', url: 'https://chutes.ai', urlLabel: 'Chutes AI', desc: 'Paid. Serverless AI inference.', key: 'chutes_api_key', category: 'other' },
  { id: 'modelscope', label: 'ModelScope', placeholder: '...', url: 'https://modelscope.cn', urlLabel: 'ModelScope', desc: 'Free & paid. Chinese AI model hub.', key: 'modelscope_api_key', category: 'other' },
  { id: 'google_knowledge', label: 'Google Knowledge Graph', placeholder: 'AIza...', url: 'https://console.cloud.google.com', urlLabel: 'GCP Console', desc: 'Free tier. Knowledge Graph Search API.', key: 'google_knowledge_graph_api_key', category: 'other' },
  { id: 'browserbase', label: 'Browserbase', placeholder: 'bb_...', url: 'https://browserbase.com', urlLabel: 'Browserbase', desc: 'Paid. Headless browser for AI agents.', key: 'browserbase_api_key', category: 'other' },
  { id: 'brightdata', label: 'Bright Data', placeholder: '...', url: 'https://brightdata.com', urlLabel: 'Bright Data', desc: 'Paid. Web data platform, proxies.', key: 'brightdata_api_key', category: 'other' },
  { id: 'scrapingbee', label: 'ScrapingBee', placeholder: '...', url: 'https://www.scrapingbee.com', urlLabel: 'ScrapingBee', desc: 'Paid. Web scraping API.', key: 'scrapingbee_api_key', category: 'other' },
]

export function LlmSettingsTabs() {
  const addToast = useToast()
  const [activeTab, setActiveTab] = useState('keys')
  const [secretsMeta, setSecretsMeta] = useState<Record<string, unknown>>({})
  const [secretsDraft, setSecretsDraft] = useState<Record<string, string>>({})
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({})
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [usageStats, setUsageStats] = useState<UsageStats[]>([])

  // Load secrets
  useEffect(() => {
    fetch('/api/admin/server-secrets', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const sec = d.secrets || d
        setSecretsMeta(sec)
        // Load all provider keys into draft
        const draft: Record<string, string> = {}
        for (const p of PROVIDERS) {
          draft[p.key] = sec[p.key] || ''
        }
        setSecretsDraft(draft)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Load usage stats
  useEffect(() => {
    fetch('/api/admin/platform/ai-usage', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.modelStats) setUsageStats(d.modelStats)
      })
      .catch(() => {})
  }, [])

  const handleRevealToggle = useCallback(async (key: string) => {
    if (visibleFields[key]) {
      setVisibleFields((v) => ({ ...v, [key]: false }))
      setRevealedValues((v) => { const n = { ...v }; delete n[key]; return n })
    } else {
      const res = await fetch(`/api/admin/server-secrets/reveal?key=${key}`, { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.value) {
        setRevealedValues((v) => ({ ...v, [key]: json.value }))
      }
      setVisibleFields((v) => ({ ...v, [key]: true }))
    }
  }, [visibleFields])

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const XLSX = await import('xlsx')
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { header: 1 })

      const providerMap: Record<string, string> = {
        'openai': 'openai_api_key', 'anthropic': 'anthropic_api_key',
        'google gemini': 'gemini_api_key', 'gemini': 'gemini_api_key',
        'groq': 'groq_api_key', 'openrouter': 'openrouter_api_key',
        'nvidia': 'nvidia_api_key', 'deepseek': 'deepseek_api_key',
        'cerebras': 'cerebras_api_key', 'mistral': 'mistral_api_key',
        'cohere': 'cohere_api_key', 'fireworks': 'fireworks_api_key',
        'xai': 'xai_api_key', 'replicate': 'replicate_api_key',
        'aistudio.google.com': 'gemini_api_key', 'console.groq.com': 'groq_api_key',
        'cloud.cerebras.ai': 'cerebras_api_key', 'console.mistral.ai': 'mistral_api_key',
        'huggingface.co': 'huggingface_api_key', 'openrouter.ai': 'openrouter_api_key',
        'github.com': 'openrouter_api_key', 'build.nvidia.com': 'nvidia_api_key',
        'workers.ai': 'cloudflare_workers_api_key', 'platform.deepseek.com': 'deepseek_api_key',
        'console.x.ai': 'xai_api_key', 'console.anthropic.com': 'anthropic_api_key',
        'platform.openai.com': 'openai_api_key', 'dashboard.cohere.com': 'cohere_api_key',
        'ai21.com': 'ai21_api_key', 'deepinfra.com': 'deepinfra_api_key',
        'fireworks.ai': 'fireworks_api_key', 'novita.ai': 'novita_api_key',
        'replicate.com': 'replicate_api_key', 'tavily.com': 'tavily_api_key',
        'serper.dev': 'serper_api_key', 'exa.ai': 'exa_api_key',
        'jina.ai': 'jina_api_key', 'firecrawl.dev': 'firecrawl_api_key',
        'console.deepgram.com': 'deepgram_api_key', 'assemblyai.com': 'assemblyai_api_key',
        'elevenlabs.io': 'elevenlabs_api_key', 'lemonfox.ai': 'lemonfox_api_key',
        'platform.stability.ai': 'stability_api_key', 'fal.ai': 'fal_api_key',
        'ollama.com': 'openrouter_api_key', 'platform.kimi.ai': 'kimi_api_key',
        'cloud.sambanova.com': 'sambanova_api_key', 'skillboss.com': 'openrouter_api_key',
        'aionlabs.ai': 'openrouter_api_key',
      }

      let imported = 0
      const skipped: string[] = []

      for (const row of rows) {
        if (!Array.isArray(row)) continue
        const firstCell = String(row[0] || '').trim()
        if (firstCell.toLowerCase() === 'provider' || firstCell.toLowerCase() === 'name') continue
        
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
        const lowerKey = apiKey.toLowerCase()
        if (lowerKey.includes('issue') || lowerKey.includes('problem') || lowerKey.includes('login') ||
            lowerKey.includes('asking') || lowerKey.includes('need subscription') ||
            lowerKey.includes('buy credits') || lowerKey.includes('not found') ||
            lowerKey.includes('no login') || lowerKey.includes('no api key') ||
            lowerKey.includes('there is no') || lowerKey.includes('site can') ||
            lowerKey.includes('password:') || lowerKey.length < 10) continue

        const normalizedName = providerName.toLowerCase()
          .replace(/^https?:\/\//, '').replace(/\s.*$/, '').replace(/\{.*$/, '').replace(/\/.*$/, '').trim()
        
        const secretKey = providerMap[normalizedName] || providerMap[providerName.toLowerCase().replace(/\s.*$/, '').trim()]

        if (secretKey) {
          setSecretsDraft((d) => {
            const existing = d[secretKey] || ''
            const existingKeys = existing ? existing.split(',').map((k: string) => k.trim()).filter(Boolean) : []
            if (!existingKeys.includes(apiKey)) {
              existingKeys.push(apiKey)
            }
            return { ...d, [secretKey]: existingKeys.join(', ') }
          })
          imported++
        } else {
          skipped.push(providerName)
        }
      }

      if (imported > 0) {
        addToast({
          type: 'success',
          title: `Imported ${imported} API key${imported > 1 ? 's' : ''}`,
          message: `Click "Save Keys" to persist.`,
        })
      } else {
        addToast({ type: 'error', title: 'No matching providers found' })
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to parse file', message: err instanceof Error ? err.message : 'Invalid format' })
    }
    e.target.value = ''
  }, [addToast])

  const saveKeys = useCallback(async () => {
    setSaving(true)
    try {
      const body: Record<string, string> = {}
      for (const [k, v] of Object.entries(secretsDraft)) {
        const t = String(v).trim()
        if (t) body[k] = t
      }
      if (Object.keys(body).length === 0) {
        addToast({ type: 'error', title: 'Nothing to save' })
        setSaving(false)
        return
      }
      const res = await csrfFetch('/api/admin/server-secrets', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Save failed')
      // Reload secrets
      const secRes = await fetch('/api/admin/server-secrets', { credentials: 'include' })
      const secJson = await secRes.json()
      if (secRes.ok) setSecretsMeta(secJson.secrets || secJson)
      addToast({ type: 'success', title: 'Keys saved successfully' })
    } catch (e) {
      addToast({ type: 'error', title: 'Save failed', message: e instanceof Error ? e.message : 'Unknown error' })
    } finally {
      setSaving(false)
    }
  }, [secretsDraft, addToast])

  if (loading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
  }

  const categories = [
    { id: 'llm', label: 'LLM Providers', icon: Zap },
    { id: 'speech', label: 'Speech & Voice', icon: Activity },
    { id: 'vector', label: 'Vector DBs', icon: BarChart3 },
    { id: 'search', label: 'Search & Web', icon: TrendingUp },
    { id: 'obs', label: 'Observability', icon: Activity },
    { id: 'integration', label: 'Integrations', icon: Key },
    { id: 'image', label: 'Image & Video', icon: Activity },
    { id: 'other', label: 'Other', icon: Activity },
  ]

  const getKeyCount = (key: string) => {
    const val = secretsDraft[key] || ''
    return val ? val.split(',').filter(k => k.trim()).length : 0
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="keys" className="flex items-center gap-2">
          <Key className="h-4 w-4" /> API Keys
        </TabsTrigger>
        <TabsTrigger value="usage" className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> Usage Stats
        </TabsTrigger>
        <TabsTrigger value="routing" className="flex items-center gap-2">
          <Zap className="h-4 w-4" /> Routing
        </TabsTrigger>
      </TabsList>

      <TabsContent value="keys" className="space-y-4">
        {/* Import & Save */}
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border/60 bg-background hover:bg-muted/50 cursor-pointer transition-colors text-sm font-medium">
            <Upload className="h-4 w-4" />
            Import from Excel/CSV
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
          </label>
          <Button onClick={saveKeys} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            Save Keys
          </Button>
        </div>

        {/* Provider categories */}
        {categories.map(cat => {
          const catProviders = PROVIDERS.filter(p => p.category === cat.id)
          const activeCount = catProviders.filter(p => getKeyCount(p.key) > 0).length
          return (
            <div key={cat.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <cat.icon className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold">{cat.label}</h4>
                <Badge variant="secondary" className="text-[10px]">{activeCount}/{catProviders.length}</Badge>
              </div>
              <div className="space-y-1">
                {catProviders.map(p => {
                  const keyCount = getKeyCount(p.key)
                  const hasKey = keyCount > 0
                  return (
                    <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/30 hover:border-border/60 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium truncate">{p.label}</span>
                          {hasKey ? (
                            <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                              {keyCount} key{keyCount > 1 ? 's' : ''}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] text-muted-foreground">Not set</Badge>
                          )}
                        </div>
                      </div>
                      <div className="relative w-48 shrink-0">
                        <Input
                          type={(visibleFields as any)[p.key] ? 'text' : 'password'}
                          autoComplete="off"
                          value={((visibleFields as any)[p.key] ? (revealedValues[p.key] ?? '') : '') || (hasKey ? '••••••••' : '')}
                          onChange={(e) => setSecretsDraft((d) => ({ ...d, [p.key]: e.target.value }))}
                          className="h-7 text-xs font-mono pr-7"
                          placeholder={p.placeholder}
                        />
                        <button type="button" tabIndex={-1} onClick={() => handleRevealToggle(p.key)}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {(visibleFields as any)[p.key] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                      </div>
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-[9px] text-primary hover:underline shrink-0">
                        Get Key
                      </a>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </TabsContent>

      <TabsContent value="usage" className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Model Usage Statistics</h4>
          <Button variant="outline" size="sm" onClick={() => {
            fetch('/api/admin/platform/ai-usage', { credentials: 'include' })
              .then(r => r.json())
              .then(d => { if (d.modelStats) setUsageStats(d.modelStats) })
          }}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
        {usageStats.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Model</th>
                  <th className="text-left p-2 font-medium">Provider</th>
                  <th className="text-right p-2 font-medium">Requests</th>
                  <th className="text-right p-2 font-medium">Tokens</th>
                  <th className="text-right p-2 font-medium">Cost</th>
                  <th className="text-right p-2 font-medium">Latency</th>
                  <th className="text-right p-2 font-medium">Success</th>
                </tr>
              </thead>
              <tbody>
                {usageStats.map((s, i) => (
                  <tr key={i} className="border-t border-border/30 hover:bg-muted/30">
                    <td className="p-2 font-mono">{s.model}</td>
                    <td className="p-2"><Badge variant="outline" className="text-[9px]">{s.provider}</Badge></td>
                    <td className="p-2 text-right">{s.requests.toLocaleString()}</td>
                    <td className="p-2 text-right">{s.tokens.toLocaleString()}</td>
                    <td className="p-2 text-right font-mono">${s.cost.toFixed(4)}</td>
                    <td className="p-2 text-right">{s.avgLatency}ms</td>
                    <td className="p-2 text-right">
                      <span className={s.successRate >= 95 ? 'text-emerald-500' : s.successRate >= 80 ? 'text-amber-500' : 'text-red-500'}>
                        {s.successRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Card className="p-8 text-center text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No usage data yet. Data will appear after AI requests are made.</p>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="routing" className="space-y-4">
        <Card className="p-4">
          <h4 className="text-sm font-semibold mb-2">Provider Fallback Order</h4>
          <p className="text-xs text-muted-foreground mb-4">
            When a provider fails or hits rate limits, the system automatically tries the next provider in the fallback chain.
          </p>
          <div className="flex flex-wrap gap-2">
            {['Gemini', 'Groq', 'OpenRouter', 'OpenAI', 'Anthropic', 'NVIDIA', 'DeepSeek'].map((p, i) => (
              <div key={p} className="flex items-center gap-1">
                <Badge variant="outline" className="text-xs">{i + 1}. {p}</Badge>
                {i < 6 && <span className="text-muted-foreground">→</span>}
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <h4 className="text-sm font-semibold mb-2">Round-Robin Rotation</h4>
          <p className="text-xs text-muted-foreground">
            When multiple keys are configured for a provider (comma-separated), the system rotates through them evenly.
            If a key hits a rate limit, it's marked as unavailable and the next key is used.
          </p>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
