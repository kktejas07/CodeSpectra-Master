export const MODEL_OPTIONS = [
  { id: 'llama-4-maverick', label: 'Llama 4 Maverick', provider: 'custom', model: 'meta-llama/llama-4-maverick-17b-128e-instruct-fp8-fast', role: 'fast', free: true },
  { id: 'llama-4-scout', label: 'Llama 4 Scout', provider: 'custom', model: 'meta-llama/llama-4-scout-17b-16e-instruct', role: 'fast', free: true },
  { id: 'llama-3.3-70b', label: 'Llama 3.3 70B', provider: 'custom', model: 'meta-llama/llama-3.3-70b-instruct', role: 'reasoning', free: true },
  { id: 'deepseek-r1', label: 'DeepSeek R1', provider: 'custom', model: 'deepseek/deepseek-r1', role: 'reasoning', free: true },
  { id: 'deepseek-v3', label: 'DeepSeek V3', provider: 'custom', model: 'deepseek/deepseek-v3', role: 'fast', free: true },
  { id: 'gemini-flash', label: 'Gemini 2.0 Flash', provider: 'gemini', model: 'gemini-3-flash-preview', role: 'fast', free: false },
  { id: 'claude-sonnet', label: 'Claude Sonnet 4.5', provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', role: 'reasoning', free: false },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai', model: 'gpt-4o-mini', role: 'fast', free: false },
]

export interface UserAISettings {
  chat_model: string
  review_model: string
  hints_model: string
  grade_model: string
}
