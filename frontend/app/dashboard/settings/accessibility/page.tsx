'use client'

/**
 * Accessibility mode: larger text, high contrast, reduced motion and a dyslexia-friendly
 * font. Saved to the account (every device) and applied at once (lib/accessibility.ts).
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Accessibility, ArrowLeft, Loader2 } from 'lucide-react'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import { CONTRASTS, DEFAULT_A11Y, FONTS, MOTIONS, TEXT_SIZES, normalizeA11y, type AccessibilitySettings } from '@/lib/accessibility'
import { readStoredA11y, storeA11y } from '@/components/a11y/accessibility-mount'

type Field = keyof AccessibilitySettings

export default function AccessibilitySettingsPage() {
  const gate = usePageGuard('user')
  const { t } = useT()
  const apiError = useApiError()
  const addToast = useToast()
  const [settings, setSettings] = useState<AccessibilitySettings | null>(null)
  const [saving, setSaving] = useState<Field | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    if (!gate.ready) return
    setSettings(readStoredA11y() || DEFAULT_A11Y)
    fetch('/api/user/accessibility', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then((j) => { const s = normalizeA11y(j.settings); setSettings(s); storeA11y(s) })
      .catch(() => setLoadFailed(true))
  }, [gate.ready])

  const labels: Record<Field, { legend: string; help: string; options: Record<string, string> }> = {
    text_size: { legend: t('account.a11yTextSize'), help: t('account.a11yTextSizeHelp'), options: { default: t('account.a11yDefault'), large: t('account.a11yLarge'), xlarge: t('account.a11yExtraLarge') } },
    contrast: { legend: t('account.a11yContrast'), help: t('account.a11yContrastHelp'), options: { default: t('account.a11yDefault'), high: t('account.a11yHighContrast') } },
    motion: { legend: t('account.a11yMotion'), help: t('account.a11yMotionHelp'), options: { system: t('account.a11yFollowDevice'), reduce: t('account.a11yReduceMotion') } },
    font: { legend: t('account.a11yFont'), help: t('account.a11yFontHelp'), options: { default: t('account.a11yDefault'), dyslexic: t('account.a11yDyslexicFont') } },
  }
  const choices: Record<Field, readonly string[]> = { text_size: TEXT_SIZES, contrast: CONTRASTS, motion: MOTIONS, font: FONTS }

  const save = async (patch: Partial<AccessibilitySettings>, field: Field) => {
    if (!settings) return
    const prev = settings
    const next = normalizeA11y({ ...settings, ...patch })
    setSettings(next)
    storeA11y(next)
    setSaving(field)
    try {
      const r = await csrfFetch('/api/user/accessibility', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(apiError(j))
    } catch (e) {
      setSettings(prev)
      storeA11y(prev)
      addToast({ type: 'error', title: (e as Error).message || t('account.a11ySaveFailed') })
    } finally {
      setSaving(null)
    }
  }

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <Link href="/dashboard/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t('account.backToSettings')}
      </Link>
      <PageHeader icon={<Accessibility aria-hidden />} title={t('account.a11yTitle')} description={t('account.a11yDescription')} />
      {loadFailed && <p role="status" className="text-sm text-muted-foreground">{t('account.a11yUsingThisDevice')}</p>}
      {!settings ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t('account.a11yLoading')}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(Object.keys(labels) as Field[]).map((field) => (
            <Panel key={field} className="p-5">
              <fieldset className="space-y-3" aria-describedby={`a11y-${field}-help`}>
                <legend className="flex items-center gap-2 font-medium text-foreground">
                  {labels[field].legend}
                  {saving === field && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label={t('account.a11ySaving')} />}
                </legend>
                <p id={`a11y-${field}-help`} className="text-sm text-muted-foreground">{labels[field].help}</p>
                <div className="flex flex-wrap gap-2">
                  {choices[field].map((v) => (
                    <label key={v} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${settings[field] === v ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-card text-foreground hover:border-primary/50'}`}>
                      <input type="radio" name={`a11y-${field}`} value={v} checked={settings[field] === v} onChange={() => save({ [field]: v }, field)} className="h-4 w-4 accent-primary" />
                      {labels[field].options[v]}
                    </label>
                  ))}
                </div>
              </fieldset>
            </Panel>
          ))}
          <Panel className="p-5 md:col-span-2">
            <h2 className="font-medium text-foreground">{t('account.a11yInTestsTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('account.a11yInTestsBody')}</p>
            <Button type="button" variant="outline" className="mt-3" onClick={() => save(DEFAULT_A11Y, 'text_size')}>
              {t('account.a11yReset')}
            </Button>
          </Panel>
        </div>
      )}
    </div>
  )
}
