'use client'

/**
 * Language versions of a Learn post (admin): the English original and its
 * Hindi / Telugu drafts. "Create Hindi draft" asks the platform model for a
 * natural translation (code untouched) saved as a separate, linked draft that
 * goes through the same review. Published versions are linked on the public
 * page with hreflang alternates.
 */
import { useCallback, useEffect, useState } from 'react'
import { Languages, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { LOCALE_META } from '@/lib/i18n/config'
import { LEARN_TRANSLATION_LOCALES, type LearnPostDoc, type LearnTranslationLocale } from '@/lib/learn/types'

type Version = Pick<LearnPostDoc, 'id' | 'slug' | 'status' | 'locale' | 'title'>

export function TranslationsPanel({ post, onOpen, onChanged }: { post: LearnPostDoc; onOpen: (id: string) => void; onChanged: () => void }) {
  const addToast = useToast()
  const [versions, setVersions] = useState<Version[] | null>(null)
  const [busy, setBusy] = useState<LearnTranslationLocale | null>(null)
  const isEnglish = !post.locale || post.locale === 'en'

  const load = useCallback(() => {
    fetch(`/api/learn/admin/posts/${encodeURIComponent(post.id)}/translate`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { versions: [] }))
      .then((d) => setVersions(Array.isArray(d.versions) ? d.versions : []))
      .catch(() => setVersions([]))
  }, [post.id])
  useEffect(() => { load() }, [load])

  const create = async (locale: LearnTranslationLocale) => {
    setBusy(locale)
    try {
      const r = await csrfFetch(`/api/learn/admin/posts/${encodeURIComponent(post.id)}/translate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'The translation could not be created.')
      addToast({ type: 'success', title: `${LOCALE_META[locale].english} draft created`, message: 'Review it like any other draft before publishing.' })
      load()
      onChanged()
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const others = (versions ?? []).filter((v) => v.id !== post.id)
  const has = (l: LearnTranslationLocale) => (versions ?? []).some((v) => v.locale === l && v.status !== 'rejected')

  return (
    <section aria-labelledby="lp-langs" className="rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="lp-langs" className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Languages className="h-4 w-4" aria-hidden /> Language versions
          <Badge variant="outline">{LOCALE_META[(post.locale ?? 'en') as 'en' | 'hi' | 'te'].english}</Badge>
        </h3>
        {isEnglish && (
          <div className="flex flex-wrap gap-2">
            {LEARN_TRANSLATION_LOCALES.map((l) => (
              <Button key={l} size="sm" variant="outline" disabled={!!busy || has(l)} onClick={() => void create(l)} className="min-h-10">
                {busy === l ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
                {has(l) ? `${LOCALE_META[l].english} exists` : `Create ${LOCALE_META[l].english} draft`}
              </Button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {isEnglish
          ? 'Translations keep code and technical terms in English and count against the daily and monthly translation limits in Learn settings.'
          : 'This is a translation. Edit it here; regenerate translations from the English post.'}
      </p>
      {versions === null ? (
        <p className="mt-2 text-xs text-muted-foreground">Loading versions…</p>
      ) : others.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {others.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{LOCALE_META[(v.locale ?? 'en') as 'en' | 'hi' | 'te'].native}</Badge>
              <button type="button" className="min-w-0 truncate text-left text-primary hover:underline" lang={v.locale ?? 'en'} onClick={() => onOpen(v.id)}>{v.title}</button>
              <span className="text-xs capitalize text-muted-foreground">{v.status}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
