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
    label: 'Google Gemini (Free tier)',
    free: true,
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    authType: 'gemini-key',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    free: false,
    models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
    endpoint: 'https://api.anthropic.com/v1',
    authType: 'x-api-key',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    free: false,
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-mini', 'o3-mini'],
    endpoint: 'https://api.openai.com/v1',
    authType: 'bearer',
  },
  {
    id: 'opencode',
    label: 'OpenCode (OpenAI-compatible, free models)',
    free: true,
    models: ['opencode-7b', 'claude-sonnet-4-20250514', 'gpt-4o-mini', 'big-pickle', 'omnirouter', 'omnirouter-pro'],
    endpoint: 'https://opencode.june07.com/v1',
    authType: 'bearer',
  },
  {
    id: 'groq',
    label: 'Groq (fast inference)',
    free: true,
    models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it', 'deepseek-r1-distill-llama-70b', 'llama-3.1-8b-instant'],
    endpoint: 'https://api.groq.com/openai/v1',
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
    id: 'nvidia',
    label: 'NVIDIA NIM',
    free: false,
    models: ['meta/llama-3.1-405b-instruct', 'mistralai/mistral-7b-instruct-v0.3', 'nvidia/llama-3.1-nemotron-70b-instruct'],
    endpoint: 'https://integrate.api.nvidia.com/v1',
    authType: 'bearer',
  },
  {
    id: 'bigpickle',
    label: 'BigPickle (OpenAI-compatible, free tier)',
    free: true,
    models: ['big-pickle-v1'],
    endpoint: 'https://api.bigpickle.ai/v1',
    authType: 'bearer',
  },
] as const

export type LLMProviderId = (typeof LLM_PROVIDERS)[number]['id']

export interface LLMConfig {
  provider: LLMProviderId
  model: string
  endpoint: string
  api_key: string
}

export const LLM_CONFIG_DEFAULTS: LLMConfig = {
  provider: 'gemini',
  model: 'gemini-2.0-flash',
  endpoint: '',
  api_key: '',
}

export function getProviderDefaults(id: string): ProviderDef | undefined {
  return LLM_PROVIDERS.find(p => p.id === id)
}
