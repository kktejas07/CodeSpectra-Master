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
      'gemini-2.0-flash', 'gemini-2.0-flash-lite',
      'gemini-1.5-pro', 'gemini-1.5-flash',
      'gemini-3.0-flash', 'gemini-3.5-flash',
      'gemini-3.6-flash', 'gemini-3.1-pro',
    ],
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    authType: 'gemini-key',
  },
  {
    id: 'opencode',
    label: 'OpenCode (opencode.ai)',
    free: true,
    models: [
      'deepseek-v4-flash-free',
      'mimo-v2.5-free',
      'ling-3.0-flash-free',
      'nemotron-3-ultra-free',
      'north-mini-code-free',
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
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
      'gemma2-9b-it',
      'deepseek-r1-distill-llama-70b',
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
      'meta/llama-3.1-405b-instruct',
      'mistralai/mistral-7b-instruct-v0.3',
      'nvidia/llama-3.1-nemotron-70b-instruct',
    ],
    endpoint: 'https://integrate.api.nvidia.com/v1',
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
  model: 'gemini-2.0-flash',
  endpoint: '',
  api_key: '',
  keys: {},
  taskOverrides: {},
}

export function getProviderDefaults(id: string): ProviderDef | undefined {
  return LLM_PROVIDERS.find(p => p.id === id)
}
