export interface ProviderDef {
  id: string
  label: string
  free: boolean
  models: string[]
  endpoint: string
  authType: 'bearer' | 'x-api-key' | 'gemini-key'
}

export const LLM_PROVIDERS: ProviderDef[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    free: true,
    models: [
      // ponytail: live-first order (verified 2026-09-21: gemini-2.0-flash 404s,
      // 1.5 family retired — kept at tail so saved configs still resolve).
      'gemini-3-flash-preview', 'gemini-3.5-flash', 'gemini-3.1-flash-lite',
      'gemini-2.0-flash', 'gemini-2.0-flash-lite',
      'gemini-1.5-pro', 'gemini-1.5-flash',
      'gemini-3.0-flash', 'gemini-3.6-flash', 'gemini-3.1-pro',
    ],
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    authType: 'gemini-key',
  },
  {
    id: 'opencode',
    label: 'OpenCode (opencode.ai)',
    free: true,
    models: [
      // ponytail: Zen free catalog rotates ("limited time" models) — live
      // free IDs first (models.dev 2026-09-21), paid fallbacks after.
      'mimo-v2.5-free',
      'minimax-m3-free',
      'qwen3.6-plus-free',
      'nemotron-3-ultra-free',
      'north-mini-code-free',
      'deepseek-v4-flash-free',
      'ling-3.0-flash-free',
      'laguna-s-2.1-free',
      'claude-fable-5',
      'claude-sonnet-5',
      'claude-haiku-4-5',
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-3.1-pro',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'gpt-5.6-sol',
      'grok-4.5',
      'qwen3.6-plus',
      'stealth/ox-alpha',
    ],
    endpoint: 'https://opencode.ai/zen/v1',
    authType: 'bearer',
  },
  {
    id: 'groq',
    label: 'Groq (fast inference)',
    free: true,
    models: [
      // ponytail: live-first (llama-3.1-8b-instant 404s as of 2026-09-21).
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'llama-3.3-70b-versatile',
      'qwen/qwen3.6-27b',
      'deepseek-r1-distill-llama-70b',
      'mixtral-8x7b-32768',
      'gemma2-9b-it',
    ],
    endpoint: 'https://api.groq.com/openai/v1',
    authType: 'bearer',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    free: true,
    models: [
      'openrouter/auto',
      'google/gemini-2.0-flash-lite-001:free',
      'deepseek/deepseek-r1:free',
      'qwen/qwen-2.5-coder-32b-instruct:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'anthropic/claude-3.5-haiku:free',
      'mistralai/mistral-7b-instruct:free',
    ],
    endpoint: 'https://openrouter.ai/api/v1',
    authType: 'bearer',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    free: false,
    models: ['deepseek-chat', 'deepseek-reasoner'],
    endpoint: 'https://api.deepseek.com/v1',
    authType: 'bearer',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    free: false,
    models: [
      'claude-sonnet-4-20250514',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ],
    endpoint: 'https://api.anthropic.com/v1',
    authType: 'x-api-key',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    free: false,
    models: [
      'gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo',
      'gpt-3.5-turbo', 'o1-mini', 'o3-mini',
    ],
    endpoint: 'https://api.openai.com/v1',
    authType: 'bearer',
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    free: false,
    models: [
      'nvidia/llama-3.1-nemotron-70b-instruct',
      'deepseek-ai/deepseek-v4-flash-0731',
      'meta/llama-3.1-405b-instruct',
      'mistralai/mistral-7b-instruct-v0.3',
    ],
    endpoint: 'https://integrate.api.nvidia.com/v1',
    authType: 'bearer',
  },
  {
    id: 'cerebras',
    label: 'Cerebras (fast inference)',
    free: true,
    models: ['llama-3.3-70b', 'openai/gpt-oss-120b'],
    endpoint: 'https://api.cerebras.ai/v1',
    authType: 'bearer',
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    free: false,
    models: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest'],
    endpoint: 'https://api.mistral.ai/v1',
    authType: 'bearer',
  },
  {
    // ponytail: user-supplied OpenAI-compatible gateway (e.g. a proxy like
    // https://api.apinex.bond/v1). Endpoint + models come from saved settings,
    // never from this static list — keep models empty so the UI forces entry.
    id: 'custom',
    label: 'Custom gateway (OpenAI-compatible)',
    free: false,
    models: [],
    endpoint: '',
    authType: 'bearer',
  },
] as const

export type LLMProviderId = (typeof LLM_PROVIDERS)[number]['id']

export interface APIKeyStatus {
  id: string
  key: string
  added_at: string
  usage_count: number
  rate_limited_until: number | null
}

export interface TaskOverride {
  provider: LLMProviderId
  model: string
  endpoint?: string
}

export interface LLMConfig {
  provider: LLMProviderId
  model: string
  endpoint: string
  api_key: string
  keys?: Partial<Record<LLMProviderId, APIKeyStatus[]>>
  taskOverrides?: Partial<Record<string, TaskOverride>>
}

export const LLM_CONFIG_DEFAULTS: LLMConfig = {
  provider: 'gemini',
  model: 'gemini-3-flash-preview',
  endpoint: '',
  api_key: '',
  keys: {},
  taskOverrides: {},
}

export function getProviderDefaults(id: string): ProviderDef | undefined {
  return LLM_PROVIDERS.find(p => p.id === id)
}
