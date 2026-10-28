/**
 * Accessibility mode — per-user display settings (pure, client-safe).
 * Applied as data attributes on <html> (components/a11y/accessibility-mount.tsx);
 * the CSS lives at the end of app/globals.css. Stored per user (/api/user/accessibility)
 * and cached in localStorage so the next page load applies them before the first fetch.
 */
export const TEXT_SIZES = ['default', 'large', 'xlarge'] as const
export const CONTRASTS = ['default', 'high'] as const
export const MOTIONS = ['system', 'reduce'] as const
export const FONTS = ['default', 'dyslexic'] as const

export interface AccessibilitySettings {
  text_size: (typeof TEXT_SIZES)[number]
  contrast: (typeof CONTRASTS)[number]
  motion: (typeof MOTIONS)[number]
  font: (typeof FONTS)[number]
}

export const DEFAULT_A11Y: AccessibilitySettings = { text_size: 'default', contrast: 'default', motion: 'system', font: 'default' }

export const A11Y_STORAGE_KEY = 'codespectra:a11y'
/** Fired on window after the settings change (same tab). */
export const A11Y_EVENT = 'codespectra:a11y-change'

const pick = <T extends readonly string[]>(list: T, v: unknown, d: T[number]): T[number] => ((list as readonly string[]).includes(String(v)) ? (v as T[number]) : d)

export function normalizeA11y(raw: unknown): AccessibilitySettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    text_size: pick(TEXT_SIZES, r.text_size, DEFAULT_A11Y.text_size),
    contrast: pick(CONTRASTS, r.contrast, DEFAULT_A11Y.contrast),
    motion: pick(MOTIONS, r.motion, DEFAULT_A11Y.motion),
    font: pick(FONTS, r.font, DEFAULT_A11Y.font),
  }
}

/** <html> data attributes for the settings (absent = default). */
export function a11yAttributes(s: AccessibilitySettings): Record<'data-a11y-text' | 'data-a11y-contrast' | 'data-a11y-motion' | 'data-a11y-font', string | null> {
  return {
    'data-a11y-text': s.text_size === 'default' ? null : s.text_size,
    'data-a11y-contrast': s.contrast === 'high' ? 'high' : null,
    'data-a11y-motion': s.motion === 'reduce' ? 'reduce' : null,
    'data-a11y-font': s.font === 'dyslexic' ? 'dyslexic' : null,
  }
}
