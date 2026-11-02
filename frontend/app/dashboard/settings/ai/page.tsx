'use client'

import { useEffect, useState, useCallback } from 'react'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { ModelSelector } from '@/components/ai/model-selector'
import { Sparkles, Bot, FileText, GraduationCap, Key, Trash2, Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { useT } from '@/lib/i18n/client'
/* ── BYOK panel ──────────────────────────────────────────────────────────── */
function ByokPanel() {
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [provider, setProvider] = useState<string | undefined>()
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/user/byok')
      if (res.ok) {
        const data = await res.json() as { has_key: boolean; provider?: string }
        setHasKey(data.has_key)
        setProvider(data.provider)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { void load() }, [load])

  async function save() {
    if (!input.trim()) return
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/user/byok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: input.trim() }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; provider?: string }
      if (res.ok && data.ok) {
        setMsg({ ok: true, text: `Key saved (${data.provider ?? 'unknown'} detected).` })
        setInput('')
        setHasKey(true)
        setProvider(data.provider)
      } else {
        setMsg({ ok: false, text: data.error ?? 'Failed to save key.' })
      }
    } catch {
      setMsg({ ok: false, text: 'Network error. Try again.' })
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    setRemoving(true)
    setMsg(null)
    try {
      await fetch('/api/user/byok', { method: 'DELETE' })
      setHasKey(false)
      setProvider(undefined)
      setMsg({ ok: true, text: 'API key removed.' })
    } catch {
      setMsg({ ok: false, text: 'Network error. Try again.' })
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Panel className="p-5 space-y-4" data-tour="ai-settings-byok">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Key className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="font-medium text-foreground">Your own API key (free plan)</p>
          <p className="text-xs text-muted-foreground">Add an OpenAI, Groq, Gemini, or OpenRouter key to use AI features.</p>
        </div>
      </div>

      {hasKey === null ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Loading…</div>
      ) : hasKey ? (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Key saved</p>
            {provider && <p className="text-xs text-muted-foreground">Provider: {provider}</p>}
          </div>
          <button
            onClick={() => void remove()}
            disabled={removing}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
          >
            {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Remove
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="sk-… or sk-or-v1-… or AIza… or gsk_…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            onClick={() => void save()}
            disabled={saving || !input.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save key
          </button>
        </div>
      )}

      {msg && (
        <p className={`text-xs ${msg.ok ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
          {msg.text}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Your key is encrypted at rest and never logged. <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">Get an OpenAI key ↗</a>
      </p>
    </Panel>
  )
}

export default function AISettingsPage() {
  const { t } = useT()
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const aiSettingsTour: TourStep[] = [
        {
          target: '[data-tour="ai-settings-header"]',
          title: t('account.chooseAiModelsHere'),
          description: t('account.thisPageLetsEveryUserAssign4de'),
          position: 'bottom',
        },
        {
          target: '[data-tour="ai-settings-chat"]',
          title: t('account.setChatModelFirst'),
          description: t('account.selectTheModelPoweringChatCodebase247'),
          position: 'bottom',
        },
        {
          target: '[data-tour="ai-settings-models"]',
          title: t('account.tipKeepFlashDefault'),
          description: t('account.tipChangesApplyInstantlyKeepFreec91'),
          position: 'top',
        },
      ]
      autoPlayPageTour('ai-settings', aiSettingsTour)}
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div data-tour="ai-settings-header">
        <PageHeader
          className="mb-0"
          icon={<Sparkles aria-hidden />}
          title={t('account.aiModelPreferences')}
          description={t('account.chooseWhichAiModelThePlatform193')}
        />
      </div>

      <ByokPanel />

      <div className="grid gap-4 md:grid-cols-2" data-tour="ai-settings-models">
        <Panel className="p-5 space-y-3" data-tour="ai-settings-chat">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bot className="h-5 w-5" aria-hidden /></span>
            <div>
              <p className="font-medium text-foreground">{t('account.aiChatAndAgent')}</p>
              <p className="text-xs text-muted-foreground">{t('account.usedByTheChatAssistantCodebasea7f')}</p>
            </div>
          </div>
          <ModelSelector feature="chat_model" />
        </Panel>

        <Panel className="p-5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText className="h-5 w-5" aria-hidden /></span>
            <div>
              <p className="font-medium text-foreground">{t('account.codeReviewAndAnalysis')}</p>
              <p className="text-xs text-muted-foreground">{t('account.usedByAutomatedCodeReviewsStaticc1d')}</p>
            </div>
          </div>
          <ModelSelector feature="review_model" />
        </Panel>

        <Panel className="p-5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><GraduationCap className="h-5 w-5" aria-hidden /></span>
            <div>
              <p className="font-medium text-foreground">{t('account.hintsAndTutoring')}</p>
              <p className="text-xs text-muted-foreground">{t('account.usedBySmartHintsProblemGenerationc59')}</p>
            </div>
          </div>
          <ModelSelector feature="hints_model" />
        </Panel>

        <Panel className="p-5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><GraduationCap className="h-5 w-5" aria-hidden /></span>
            <div>
              <p className="font-medium text-foreground">{t('account.autoGrading')}</p>
              <p className="text-xs text-muted-foreground">{t('account.usedBySubmissionGradingAndAssessment666')}</p>
            </div>
          </div>
          <ModelSelector feature="grade_model" />
        </Panel>
      </div>
    </div>
  )
}
