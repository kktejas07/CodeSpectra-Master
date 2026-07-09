export const LLM_PROVIDERS = [
  { id: 'gemini', label: 'Google Gemini (Free tier)', free: true },
  { id: 'anthropic', label: 'Anthropic Claude', free: false },
  { id: 'openai', label: 'OpenAI', free: false },
  { id: 'opencode', label: 'OpenCode (OpenAI-compatible, free)', free: true },
  { id: 'omnirouter', label: 'OmniRouter (OpenAI-compatible)', free: false },
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

export const PROVIDER_DEFAULTS: Record<LLMProviderId, { model: string; endpoint: string }> = {
  gemini: { model: 'gemini-2.0-flash', endpoint: 'https://generativelanguage.googleapis.com/v1beta' },
  anthropic: { model: 'claude-sonnet-4-20250514', endpoint: 'https://api.anthropic.com/v1' },
  openai: { model: 'gpt-4o-mini', endpoint: 'https://api.openai.com/v1' },
  opencode: { model: 'opencode-7b', endpoint: 'https://opencode.june07.com/v1' },
  omnirouter: { model: 'omnirouter', endpoint: 'https://omnirouter.com/v1' },
}
