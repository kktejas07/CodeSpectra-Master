export const MODEL_OPTIONS = [
  { id: 'gemini-flash', label: 'Gemini 2.0 Flash (Free)', provider: 'gemini', model: 'gemini-3-flash-preview', role: 'fast', free: true },
  { id: 'claude-sonnet', label: 'Claude Sonnet 4.5', provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', role: 'reasoning', free: false },
  { id: 'claude-haiku', label: 'Claude Haiku 3.5', provider: 'anthropic', model: 'claude-3-5-haiku-20241022', role: 'fast', free: false },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai', model: 'gpt-4o-mini', role: 'fast', free: false },
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai', model: 'gpt-4o', role: 'reasoning', free: false },
]

export interface UserAISettings {
  chat_model: string
  review_model: string
  hints_model: string
  grade_model: string
}
